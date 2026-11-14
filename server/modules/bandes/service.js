// Bandes: list, create, read, update, delete (password required).
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import { verifierMotDePasse } from '../../lib/motDePasse.js';
import {
  texte, entier, date, dateFr, nombreFr,
} from '../../lib/validation.js';

// Computed in SQL so every screen agrees:
//  date_fin  = start + duration
//  statut    = 'a_venir' (not started) | 'en_cours' (green) | 'terminee' (red, duration passed)
//  age_jours = day 1 is the arrival day
const SELECT_BANDE = `
  SELECT b.id, b.nom, b.date_debut, b.duree_mois, b.nombre_poussins, b.cree_le, b.modifie_le,
         fin.date_fin,
         CASE WHEN current_date < b.date_debut THEN 'a_venir'
              WHEN current_date > fin.date_fin  THEN 'terminee'
              ELSE 'en_cours' END AS statut,
         (current_date - b.date_debut + 1) AS age_jours
    FROM bande b
   CROSS JOIN LATERAL (SELECT (b.date_debut + make_interval(months => b.duree_mois))::date AS date_fin) fin`;

function versJson(r) {
  return {
    id: r.id,
    nom: r.nom,
    dateDebut: r.date_debut,
    dureeMois: r.duree_mois,
    dateFin: r.date_fin,
    nombrePoussins: r.nombre_poussins,
    // Until phase "Mortalité et malades", the flock is the initial number of chicks.
    effectifActuel: r.nombre_poussins,
    statut: r.statut,
    ageJours: r.age_jours,
    creeLe: r.cree_le,
    modifieLe: r.modifie_le,
  };
}

/** Values stored in the history (what the farmer typed, not the computed fields). */
const instantane = (b) => ({
  nom: b.nom, dateDebut: b.dateDebut, dureeMois: b.dureeMois, nombrePoussins: b.nombrePoussins,
});

export function validerBande(corps) {
  const champs = {};
  const [nom, eNom] = texte(corps?.nom, { nom: 'Le nom', max: 60 });
  const [dateDebut, eDate] = date(corps?.dateDebut, { nom: 'La date de début' });
  const [dureeMois, eDuree] = entier(corps?.dureeMois ?? 4, { nom: 'La durée', min: 1, max: 12 });
  const [nombrePoussins, ePoussins] = entier(corps?.nombrePoussins, {
    nom: 'Le nombre de poussins', min: 1, max: 1000000,
  });
  if (eNom) champs.nom = eNom;
  if (eDate) champs.dateDebut = eDate;
  if (eDuree) champs.dureeMois = eDuree;
  if (ePoussins) champs.nombrePoussins = ePoussins;
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);
  return {
    nom, dateDebut, dureeMois, nombrePoussins,
  };
}

function nomDejaPris(e) {
  if (e?.code === '23505' && e.constraint === 'bande_nom_unique') {
    return erreurs.conflit('Une bande porte déjà ce nom.', { nom: 'Une bande porte déjà ce nom.' });
  }
  return e;
}

async function lire(client, id) {
  const { rows } = await client.query(`${SELECT_BANDE} WHERE b.id = $1`, [id]);
  if (!rows[0]) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
  return versJson(rows[0]);
}

export async function listerBandes() {
  const { rows } = await query(`${SELECT_BANDE} ORDER BY b.date_debut DESC, b.id DESC`);
  return rows.map(versJson);
}

export async function lireBande(id) {
  return lire({ query }, id);
}

export async function creerBande(corps) {
  const v = validerBande(corps);
  try {
    return await transaction(async (client) => {
      const { rows: [{ id }] } = await client.query(
        `INSERT INTO bande (nom, date_debut, duree_mois, nombre_poussins)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [v.nom, v.dateDebut, v.dureeMois, v.nombrePoussins],
      );
      const bande = await lire(client, id);
      await journaliser(client, {
        bandeId: id,
        module: 'bandes',
        action: 'creation',
        entiteId: id,
        description: `Bande « ${v.nom} » créée : ${nombreFr(v.nombrePoussins)} poussins, `
          + `début le ${dateFr(v.dateDebut)}, durée ${v.dureeMois} mois`,
        apres: instantane(bande),
      });
      return bande;
    });
  } catch (e) {
    throw nomDejaPris(e);
  }
}

const LIBELLES = {
  nom: ['nom', (x) => `« ${x} »`],
  dateDebut: ['date de début', dateFr],
  dureeMois: ['durée', (x) => `${x} mois`],
  nombrePoussins: ['nombre de poussins', nombreFr],
};

export async function modifierBande(id, corps) {
  const v = validerBande(corps);
  try {
    return await transaction(async (client) => {
      await client.query('SELECT id FROM bande WHERE id = $1 FOR UPDATE', [id]);
      const avant = await lire(client, id);
      const changements = Object.keys(LIBELLES)
        .filter((k) => avant[k] !== v[k])
        .map((k) => `${LIBELLES[k][0]} ${LIBELLES[k][1](avant[k])} → ${LIBELLES[k][1](v[k])}`);
      if (!changements.length) return avant;

      await client.query(
        `UPDATE bande SET nom = $1, date_debut = $2, duree_mois = $3, nombre_poussins = $4, modifie_le = now()
          WHERE id = $5`,
        [v.nom, v.dateDebut, v.dureeMois, v.nombrePoussins, id],
      );
      const apres = await lire(client, id);
      await journaliser(client, {
        bandeId: id,
        module: 'bandes',
        action: 'modification',
        entiteId: id,
        description: `Bande « ${avant.nom} » modifiée : ${changements.join(' ; ')}`,
        avant: instantane(avant),
        apres: instantane(apres),
      });
      return apres;
    });
  } catch (e) {
    throw nomDejaPris(e);
  }
}

/** Deletes a Bande and everything in it, after checking the user's password again. */
export async function supprimerBande(id, motDePasse, utilisateurId) {
  if (typeof motDePasse !== 'string' || !motDePasse) {
    throw erreurs.validation('Vérifiez les champs indiqués.', { motDePasse: 'Saisissez votre mot de passe pour confirmer.' });
  }
  await transaction(async (client) => {
    const { rows: [u] } = await client.query('SELECT mot_de_passe_hash FROM utilisateur WHERE id = $1', [utilisateurId]);
    if (!u || !(await verifierMotDePasse(motDePasse, u.mot_de_passe_hash))) {
      throw erreurs.validation('Vérifiez les champs indiqués.', { motDePasse: 'Mot de passe incorrect.' });
    }
    await client.query('SELECT id FROM bande WHERE id = $1 FOR UPDATE', [id]);
    const avant = await lire(client, id);
    await client.query('DELETE FROM bande WHERE id = $1', [id]);
    await journaliser(client, {
      bandeId: null, // the Bande no longer exists
      module: 'bandes',
      action: 'suppression',
      entiteId: id,
      description: `Bande « ${avant.nom} » supprimée (début le ${dateFr(avant.dateDebut)}, `
        + `${nombreFr(avant.nombrePoussins)} poussins)`,
      avant: instantane(avant),
    });
  });
}
