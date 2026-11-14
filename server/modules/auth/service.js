// Login logic: one account, sessions in the database, 5 hours of inactivity max.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../../config.js';
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs, ErreurApp } from '../../lib/erreurs.js';
import {
  hacherMotDePasse, verifierMotDePasse, reglesNonRespectees, genererMotDePasse,
} from '../../lib/motDePasse.js';

const INACTIVITE_S = Math.floor(config.auth.inactiviteMs / 1000);
// Refresh "last activity" at most once a minute, not on every request.
const RAFRAICHIR_APRES_MS = 60 * 1000;

const empreinte = (jeton) => crypto.createHash('sha256').update(jeton).digest('hex');

// Used when the username doesn't exist, so the answer takes the same time either way.
let hashLeurre = null;

/**
 * Creates the single account on first start if no user exists yet.
 * The password is generated, printed in the console and written to
 * identifiants-initiaux.txt in the data folder. Change it with `npm run mot-de-passe`.
 */
export async function assurerUtilisateurParDefaut() {
  const { rows } = await query('SELECT count(*) AS n FROM utilisateur');
  if (rows[0].n > 0) return;

  const identifiant = config.auth.identifiantParDefaut;
  const motDePasse = genererMotDePasse();
  const fichier = path.join(config.dossierDonnees, 'identifiants-initiaux.txt');
  await transaction(async (client) => {
    const { rows: [u] } = await client.query(
      'INSERT INTO utilisateur (identifiant, mot_de_passe_hash) VALUES ($1, $2) RETURNING id',
      [identifiant, await hacherMotDePasse(motDePasse)],
    );
    await journaliser(client, {
      module: 'parametres', action: 'creation', entiteId: u.id,
      description: `Compte « ${identifiant} » créé au premier démarrage`,
    });
    // Written BEFORE the commit: if the file can't be written, the account isn't created either
    // (otherwise it would exist with a password nobody has seen).
    fs.mkdirSync(config.dossierDonnees, { recursive: true });
    fs.writeFileSync(fichier, [
      'Plateforme avicole — identifiants initiaux',
      `Identifiant : ${identifiant}`,
      `Mot de passe : ${motDePasse}`,
      '',
      'Notez-les, puis supprimez ce fichier.',
      'Pour choisir un autre mot de passe : npm run mot-de-passe -- "NouveauMotDePasse"',
      '',
    ].join('\n'), 'utf8');
  });

  console.log('');
  console.log('==============================================================');
  console.log(' Compte créé — notez ces identifiants :');
  console.log(`   Identifiant  : ${identifiant}`);
  console.log(`   Mot de passe : ${motDePasse}`);
  console.log(` (aussi enregistrés dans ${fichier})`);
  console.log('==============================================================');
  console.log('');
}

export async function connecter(identifiant, motDePasse) {
  const { rows } = await query(
    'SELECT id, identifiant, mot_de_passe_hash FROM utilisateur WHERE identifiant = $1',
    [identifiant.trim()],
  );
  const utilisateur = rows[0];
  if (!hashLeurre) hashLeurre = await hacherMotDePasse(genererMotDePasse());
  const valide = await verifierMotDePasse(motDePasse, utilisateur?.mot_de_passe_hash ?? hashLeurre);
  if (!utilisateur || !valide) {
    throw new ErreurApp(401, 'IDENTIFIANTS_INVALIDES', 'Identifiant ou mot de passe incorrect.');
  }

  const jeton = crypto.randomBytes(32).toString('base64url');
  await query('INSERT INTO session (id, utilisateur_id) VALUES ($1, $2)', [empreinte(jeton), utilisateur.id]);
  return { jeton, identifiant: utilisateur.identifiant };
}

export async function deconnecter(jeton) {
  await query('DELETE FROM session WHERE id = $1', [empreinte(jeton)]);
}

/**
 * Returns { sessionId, utilisateurId, identifiant, rafraichie } for a valid session,
 * or null if the token is unknown or inactive for more than 5 hours.
 */
export async function verifierSession(jeton) {
  const id = empreinte(jeton);
  const { rows } = await query(
    `SELECT s.id, s.derniere_activite, u.id AS utilisateur_id, u.identifiant
       FROM session s JOIN utilisateur u ON u.id = s.utilisateur_id
      WHERE s.id = $1 AND s.derniere_activite > now() - make_interval(secs => $2)`,
    [id, INACTIVITE_S],
  );
  const s = rows[0];
  if (!s) {
    await query('DELETE FROM session WHERE id = $1', [id]); // expired: remove it
    return null;
  }

  let rafraichie = false;
  if (Date.now() - new Date(s.derniere_activite).getTime() > RAFRAICHIR_APRES_MS) {
    await query('UPDATE session SET derniere_activite = now() WHERE id = $1', [id]);
    rafraichie = true;
  }
  return { sessionId: s.id, utilisateurId: s.utilisateur_id, identifiant: s.identifiant, rafraichie };
}

export async function nettoyerSessions() {
  await query('DELETE FROM session WHERE derniere_activite <= now() - make_interval(secs => $1)', [INACTIVITE_S]);
}

/** Change the password from the Paramètres page. Other sessions are closed. */
export async function changerMotDePasse({ utilisateurId, sessionId }, { actuel, nouveau, confirmation }) {
  const champs = {};
  if (!actuel) champs.actuel = 'Saisissez votre mot de passe actuel.';
  const manquantes = reglesNonRespectees(nouveau);
  if (manquantes.length) champs.nouveau = `Le nouveau mot de passe doit contenir : ${manquantes.join(', ')}.`;
  else if (nouveau === actuel) champs.nouveau = 'Le nouveau mot de passe doit être différent de l’actuel.';
  if (nouveau !== confirmation) champs.confirmation = 'Les deux mots de passe ne sont pas identiques.';
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);

  await transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT mot_de_passe_hash FROM utilisateur WHERE id = $1 FOR UPDATE', [utilisateurId],
    );
    if (!rows[0]) throw erreurs.introuvable('Utilisateur introuvable.');
    if (!(await verifierMotDePasse(actuel, rows[0].mot_de_passe_hash))) {
      throw erreurs.validation('Vérifiez les champs indiqués.', { actuel: 'Mot de passe actuel incorrect.' });
    }
    await client.query(
      'UPDATE utilisateur SET mot_de_passe_hash = $1, mot_de_passe_modifie_le = now() WHERE id = $2',
      [await hacherMotDePasse(nouveau), utilisateurId],
    );
    await client.query('DELETE FROM session WHERE utilisateur_id = $1 AND id <> $2', [utilisateurId, sessionId]);
    await journaliser(client, {
      module: 'parametres', action: 'modification', entiteId: utilisateurId,
      description: 'Mot de passe modifié',
    });
  });
}

/**
 * For sensitive actions (deleting a Bande, a guide…): checks the user's password again,
 * inside the caller's transaction. Throws a field error on `motDePasse`.
 */
export async function exigerMotDePasse(client, utilisateurId, motDePasse) {
  if (typeof motDePasse !== 'string' || !motDePasse) {
    throw erreurs.validation('Vérifiez les champs indiqués.', { motDePasse: 'Saisissez votre mot de passe pour confirmer.' });
  }
  const { rows: [u] } = await client.query('SELECT mot_de_passe_hash FROM utilisateur WHERE id = $1', [utilisateurId]);
  if (!u || !(await verifierMotDePasse(motDePasse, u.mot_de_passe_hash))) {
    throw erreurs.validation('Vérifiez les champs indiqués.', { motDePasse: 'Mot de passe incorrect.' });
  }
}

/** Used by scripts/mot-de-passe.js: sets a password without knowing the old one. */
export async function definirMotDePasse(nouveau) {
  const manquantes = reglesNonRespectees(nouveau);
  if (manquantes.length) throw new Error(`Mot de passe trop faible. Il manque : ${manquantes.join(', ')}.`);
  return transaction(async (client) => {
    const { rows } = await client.query('SELECT id, identifiant FROM utilisateur ORDER BY id LIMIT 1 FOR UPDATE');
    if (!rows[0]) throw new Error('Aucun utilisateur. Lancez d’abord l’application une fois.');
    const { id, identifiant } = rows[0];
    await client.query(
      'UPDATE utilisateur SET mot_de_passe_hash = $1, mot_de_passe_modifie_le = now() WHERE id = $2',
      [await hacherMotDePasse(nouveau), id],
    );
    await client.query('DELETE FROM session WHERE utilisateur_id = $1', [id]);
    await journaliser(client, {
      module: 'parametres', action: 'modification', entiteId: id,
      description: 'Mot de passe réinitialisé (outil de maintenance)',
    });
    return identifiant;
  });
}
