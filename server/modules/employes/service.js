// Employés of a Bande: add, edit, rest days, advances (with a receipt), departure (password)
// with the final settlement.
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import {
  texte, entier, date, dateFr, nombre, nombreFr, montantFr,
} from '../../lib/validation.js';
import { lireBandeClient } from '../bandes/service.js';
import { exigerMotDePasse } from '../auth/service.js';
import { calculerCompte } from './calcul.js';

function versJson(r, joursRepos, avances, aujourdhui) {
  const e = {
    id: r.id,
    nom: r.nom,
    age: r.age,
    cin: r.cin,
    dateDebut: r.date_debut,
    salaireJournalier: r.salaire_journalier,
    dateDepart: r.date_depart,
    actif: r.date_depart == null,
    creeLe: r.cree_le,
    modifieLe: r.modifie_le,
  };
  e.joursRepos = joursRepos;
  e.avances = avances;
  e.compte = calculerCompte(e, joursRepos.map((j) => j.date), avances, aujourdhui);
  return e;
}

const avanceJson = (a) => ({
  id: a.id, date: a.date_avance, montant: a.montant, note: a.note, creeLe: a.cree_le,
});

async function lireTous(client, bandeId) {
  const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
  const { rows } = await client.query(
    'SELECT * FROM employe WHERE bande_id = $1 ORDER BY date_depart IS NOT NULL, lower(nom), id', [bandeId],
  );
  const { rows: repos } = await client.query(
    `SELECT r.employe_id, r.jour, r.note FROM jour_repos r JOIN employe e ON e.id = r.employe_id
      WHERE e.bande_id = $1 ORDER BY r.jour`,
    [bandeId],
  );
  const { rows: avances } = await client.query(
    `SELECT a.* FROM avance a JOIN employe e ON e.id = a.employe_id
      WHERE e.bande_id = $1 ORDER BY a.date_avance, a.id`,
    [bandeId],
  );
  return rows.map((r) => versJson(
    r,
    repos.filter((x) => x.employe_id === r.id).map((x) => ({ date: x.jour, note: x.note })),
    avances.filter((x) => x.employe_id === r.id).map(avanceJson),
    aujourdhui,
  ));
}

const arrondi = (n) => Math.round(n * 100) / 100;
/** "de Brahim" / "d’Ahmed" */
const de = (nom) => (/^[aeiouyhéèêâàîô]/i.test(nom) ? `d’${nom}` : `de ${nom}`);

/** What the workers cost the Bande so far (used by the Charges summary too). */
export async function coutEmployes(client, bandeId) {
  const employes = await lireTous(client, bandeId);
  return {
    nombreActifs: employes.filter((e) => e.actif).length,
    nombrePartis: employes.filter((e) => !e.actif).length,
    totalAvances: arrondi(employes.reduce((t, e) => t + e.compte.totalAvances, 0)),
    nombreAvances: employes.reduce((t, e) => t + e.compte.nombreAvances, 0),
    cout: arrondi(employes.reduce((t, e) => t + e.compte.cout, 0)),
    // Still owed to current workers if they left today (wages − advances).
    soldeActifs: arrondi(employes.filter((e) => e.actif).reduce((t, e) => t + e.compte.solde, 0)),
  };
}

async function etat(client, bandeId) {
  const bande = await lireBandeClient(client, bandeId);
  return { bande, employes: await lireTous(client, bandeId), resume: await coutEmployes(client, bandeId) };
}

export async function lireEmployes(bandeId) {
  return etat({ query }, bandeId);
}

async function verrouillerBande(client, bandeId) {
  const { rows } = await client.query('SELECT id FROM bande WHERE id = $1 FOR UPDATE', [bandeId]);
  if (!rows[0]) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
}

async function lireUn(client, bandeId, employeId) {
  const { rows: [r] } = await client.query(
    'SELECT * FROM employe WHERE id = $1 AND bande_id = $2 FOR UPDATE', [employeId, bandeId],
  );
  if (!r) throw erreurs.introuvable('Cet employé n’existe pas.');
  return r;
}

function valider(corps) {
  const champs = {};
  const [nom, eNom] = texte(corps?.nom, { nom: 'Le nom complet', max: 100 });
  const [age, eAge] = entier(corps?.age, { nom: 'L’âge', min: 15, max: 90 });
  const [cinBrut, eCin] = texte(corps?.cin, { nom: 'Le numéro de CIN', max: 20 });
  const cin = cinBrut.replace(/\s/g, '').toUpperCase();
  const [dateDebut, eDate] = date(corps?.dateDebut, { nom: 'La date de début' });
  const [salaireJournalier, eSalaire] = nombre(corps?.salaireJournalier, {
    nom: 'Le salaire journalier', max: 100000, obligatoire: true,
  });
  Object.entries({
    nom: eNom, age: eAge, cin: eCin, dateDebut: eDate, salaireJournalier: eSalaire,
  }).forEach(([k, e]) => { if (e) champs[k] = e; });
  if (!eCin && !/^[A-Z]{1,2}\d{1,8}$/.test(cin)) champs.cin = 'Le CIN doit être 1 ou 2 lettres suivies de chiffres (ex. AB123456).';
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);
  return {
    nom, age, cin, dateDebut, salaireJournalier,
  };
}

function cinDejaPris(e) {
  if (e?.code === '23505' && e.constraint === 'employe_cin_actif') {
    return erreurs.conflit('Un employé actuel a déjà ce numéro de CIN.', { cin: 'Un employé actuel a déjà ce numéro de CIN.' });
  }
  return e;
}

const instantane = (r) => ({
  nom: r.nom, age: r.age, cin: r.cin, dateDebut: r.date_debut, salaireJournalier: r.salaire_journalier,
});

export async function ajouterEmploye(bandeId, corps) {
  const v = valider(corps);
  try {
    return await transaction(async (client) => {
      await verrouillerBande(client, bandeId);
      const { rows: [r] } = await client.query(
        `INSERT INTO employe (bande_id, nom, age, cin, date_debut, salaire_journalier)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [bandeId, v.nom, v.age, v.cin, v.dateDebut, v.salaireJournalier],
      );
      await journaliser(client, {
        bandeId, module: 'employes', action: 'creation', entiteId: r.id,
        description: `Employé ajouté : ${v.nom} (CIN ${v.cin}), début le ${dateFr(v.dateDebut)}, `
          + `salaire ${montantFr(v.salaireJournalier)} par jour`,
        apres: instantane(r),
      });
      return etat(client, bandeId);
    });
  } catch (e) {
    throw cinDejaPris(e);
  }
}

const LIBELLES = {
  nom: ['nom', (x) => x],
  age: ['âge', (x) => `${x} ans`],
  cin: ['CIN', (x) => x],
  dateDebut: ['début', dateFr],
  salaireJournalier: ['salaire journalier', montantFr],
};

export async function modifierEmploye(bandeId, employeId, corps) {
  const v = valider(corps);
  try {
    return await transaction(async (client) => {
      await verrouillerBande(client, bandeId);
      const r = await lireUn(client, bandeId, employeId);
      if (r.date_depart) throw erreurs.conflit('Cet employé est parti : son compte est réglé et ne peut plus être modifié.');
      const { rows: [premier] } = await client.query(
        'SELECT min(jour) AS jour FROM jour_repos WHERE employe_id = $1', [employeId],
      );
      if (premier.jour && premier.jour < v.dateDebut) {
        throw erreurs.validation('Vérifiez les champs indiqués.', {
          dateDebut: `Un jour de repos est déclaré le ${dateFr(premier.jour)}, avant cette date de début.`,
        });
      }
      const { rows: [premiere] } = await client.query(
        'SELECT min(date_avance) AS jour FROM avance WHERE employe_id = $1', [employeId],
      );
      if (premiere.jour && premiere.jour < v.dateDebut) {
        throw erreurs.validation('Vérifiez les champs indiqués.', {
          dateDebut: `Une avance est déclarée le ${dateFr(premiere.jour)}, avant cette date de début.`,
        });
      }
      const avant = instantane(r);
      const changements = Object.keys(LIBELLES)
        .filter((k) => avant[k] !== v[k])
        .map((k) => `${LIBELLES[k][0]} ${LIBELLES[k][1](avant[k])} → ${LIBELLES[k][1](v[k])}`);
      if (!changements.length) return etat(client, bandeId);

      const { rows: [maj] } = await client.query(
        `UPDATE employe SET nom = $3, age = $4, cin = $5, date_debut = $6, salaire_journalier = $7,
                modifie_le = now()
          WHERE id = $1 AND bande_id = $2 RETURNING *`,
        [employeId, bandeId, v.nom, v.age, v.cin, v.dateDebut, v.salaireJournalier],
      );
      await journaliser(client, {
        bandeId, module: 'employes', action: 'modification', entiteId: employeId,
        description: `Employé modifié (${r.nom}) : ${changements.join(' ; ')}`,
        avant, apres: instantane(maj),
      });
      return etat(client, bandeId);
    });
  } catch (e) {
    throw cinDejaPris(e);
  }
}

export async function declarerRepos(bandeId, employeId, corps) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const r = await lireUn(client, bandeId, employeId);
    if (r.date_depart) throw erreurs.conflit('Cet employé est parti : on ne peut plus lui déclarer de repos.');
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const [jour, eJour] = date(corps?.date, { nom: 'La date' });
    const [note, eNote] = texte(corps?.note ?? '', { nom: 'La remarque', min: 0, max: 200 });
    const champs = {};
    if (eJour) champs.date = eJour;
    else if (jour < r.date_debut) champs.date = `La date ne peut pas être avant son début (${dateFr(r.date_debut)}).`;
    else if (jour > aujourdhui) champs.date = 'La date ne peut pas être dans le futur.';
    if (eNote) champs.note = eNote;
    if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);

    const { rows: [ajout] } = await client.query(
      'INSERT INTO jour_repos (employe_id, jour, note) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING jour',
      [employeId, jour, note || null],
    );
    if (!ajout) {
      throw erreurs.conflit(`Un jour de repos est déjà déclaré le ${dateFr(jour)}.`, { date: `Déjà déclaré le ${dateFr(jour)}.` });
    }
    await journaliser(client, {
      bandeId, module: 'employes', action: 'creation', entiteId: employeId,
      description: `Jour de repos déclaré pour ${r.nom} : ${dateFr(jour)}${note ? ` (${note})` : ''}`,
      apres: { date: jour, note: note || null },
    });
    return etat(client, bandeId);
  });
}

export async function annulerRepos(bandeId, employeId, jourIso) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const r = await lireUn(client, bandeId, employeId);
    if (r.date_depart) throw erreurs.conflit('Cet employé est parti : son compte est réglé.');
    const [jour, eJour] = date(jourIso, { nom: 'La date' });
    if (eJour) throw erreurs.introuvable('Ce jour de repos n’existe pas.');
    const { rows: [suppr] } = await client.query(
      'DELETE FROM jour_repos WHERE employe_id = $1 AND jour = $2 RETURNING jour, note', [employeId, jour],
    );
    if (!suppr) throw erreurs.introuvable('Ce jour de repos n’existe pas ou a déjà été annulé.');
    await journaliser(client, {
      bandeId, module: 'employes', action: 'suppression', entiteId: employeId,
      description: `Jour de repos annulé pour ${r.nom} : ${dateFr(jour)}`,
      avant: { date: jour, note: suppr.note },
    });
    return etat(client, bandeId);
  });
}

/** An advance paid to the worker: amount and date, as many as needed. Returns it for the receipt. */
export async function declarerAvance(bandeId, employeId, corps) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const r = await lireUn(client, bandeId, employeId);
    if (r.date_depart) throw erreurs.conflit('Cet employé est parti : son compte est réglé, on ne peut plus lui donner d’avance.');
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const champs = {};
    const [montant, eMontant] = nombre(corps?.montant, { nom: 'Le montant', max: 100000, obligatoire: true });
    if (eMontant) champs.montant = eMontant;
    else if (montant <= 0) champs.montant = 'Le montant doit être supérieur à 0.';
    const [jour, eJour] = date(corps?.date, { nom: 'La date' });
    if (eJour) champs.date = eJour;
    else if (jour < r.date_debut) champs.date = `La date ne peut pas être avant son début (${dateFr(r.date_debut)}).`;
    else if (jour > aujourdhui) champs.date = 'La date ne peut pas être dans le futur.';
    const [note, eNote] = texte(corps?.note ?? '', { nom: 'La remarque', min: 0, max: 200 });
    if (eNote) champs.note = eNote;
    if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);

    const { rows: [a] } = await client.query(
      'INSERT INTO avance (employe_id, date_avance, montant, note) VALUES ($1, $2, $3, $4) RETURNING *',
      [employeId, jour, montant, note || null],
    );
    const avance = avanceJson(a);
    await journaliser(client, {
      bandeId, module: 'employes', action: 'creation', entiteId: employeId,
      description: `Avance de ${montantFr(montant)} donnée à ${r.nom} le ${dateFr(jour)}${note ? ` (${note})` : ''}`,
      apres: { employe: r.nom, ...avance },
    });
    return { ...(await etat(client, bandeId)), avance };
  });
}

/** Deletes an advance entered by mistake (password). Not possible once the worker has left. */
export async function supprimerAvance(bandeId, employeId, avanceId, motDePasse, utilisateurId) {
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
    await verrouillerBande(client, bandeId);
    const r = await lireUn(client, bandeId, employeId);
    if (r.date_depart) throw erreurs.conflit('Cet employé est parti : son compte est réglé et ne peut plus être modifié.');
    const { rows: [a] } = await client.query(
      'DELETE FROM avance WHERE id = $1 AND employe_id = $2 RETURNING *', [avanceId, employeId],
    );
    if (!a) throw erreurs.introuvable('Cette avance n’existe pas ou a déjà été supprimée.');
    const avance = avanceJson(a);
    await journaliser(client, {
      bandeId, module: 'employes', action: 'suppression', entiteId: employeId,
      description: `Avance supprimée pour ${r.nom} : ${montantFr(avance.montant)} du ${dateFr(avance.date)}`,
      avant: { employe: r.nom, ...avance },
    });
    return etat(client, bandeId);
  });
}

/**
 * The worker leaves ("Supprimer"): password, departure date, final settlement.
 * The record is kept (Anciens employés) so the wages stay in the costs and the receipt can be reprinted.
 */
export async function enregistrerDepart(bandeId, employeId, corps, utilisateurId) {
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, corps?.motDePasse);
    await verrouillerBande(client, bandeId);
    const r = await lireUn(client, bandeId, employeId);
    if (r.date_depart) throw erreurs.conflit(`Cet employé est déjà parti le ${dateFr(r.date_depart)}.`);
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const [depart, eDepart] = date(corps?.dateDepart, { nom: 'La date de départ' });
    let erreur = eDepart;
    if (!erreur && depart < r.date_debut) erreur = `La date de départ ne peut pas être avant son début (${dateFr(r.date_debut)}).`;
    if (!erreur && depart > aujourdhui) erreur = 'La date de départ ne peut pas être dans le futur.';
    if (!erreur) {
      const { rows: [apres] } = await client.query(
        'SELECT min(jour) AS jour FROM jour_repos WHERE employe_id = $1 AND jour > $2', [employeId, depart],
      );
      if (apres.jour) erreur = `Un jour de repos est déclaré le ${dateFr(apres.jour)}, après cette date de départ.`;
    }
    if (!erreur) {
      const { rows: [apres] } = await client.query(
        'SELECT max(date_avance) AS jour FROM avance WHERE employe_id = $1 AND date_avance > $2', [employeId, depart],
      );
      if (apres.jour) erreur = `Une avance est déclarée le ${dateFr(apres.jour)}, après cette date de départ.`;
    }
    if (erreur) throw erreurs.validation('Vérifiez les champs indiqués.', { dateDepart: erreur });

    await client.query('UPDATE employe SET date_depart = $3, modifie_le = now() WHERE id = $1 AND bande_id = $2', [employeId, bandeId, depart]);
    const etatApres = await etat(client, bandeId);
    const parti = etatApres.employes.find((e) => e.id === employeId);
    const c = parti.compte;
    await journaliser(client, {
      bandeId, module: 'employes', action: 'suppression', entiteId: employeId,
      description: `Départ ${de(r.nom)} le ${dateFr(depart)} : ${nombreFr(c.joursTravailles)} jours travaillés × `
        + `${montantFr(parti.salaireJournalier)} = ${montantFr(c.salaireTotal)}, avances ${montantFr(c.totalAvances)}, `
        + `${c.solde >= 0 ? `reste à payer ${montantFr(c.solde)}` : `l’employé doit ${montantFr(-c.solde)}`}`,
      avant: instantane(r),
      apres: { dateDepart: depart, compte: c },
    });
    return { ...etatApres, depart: parti };
  });
}
