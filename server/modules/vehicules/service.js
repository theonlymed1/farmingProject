// Véhicules of a Bande (work cars) and their charges (fuel, tyres…). A charge can be a vidange
// (mileage + distance to the next one) or one of the 4 car documents (visite, vignette, assurance,
// carte grise) with a validity and an expiry date. All of them count in the total cost of the Bande
// (see charges/service.js, resume).
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import {
  texte, date, nombre, entier, dateFr, nombreFr, montantFr,
} from '../../lib/validation.js';
import { lireBandeClient } from '../bandes/service.js';
import { exigerMotDePasse } from '../auth/service.js';

const arrondi = (n) => Math.round(n * 100) / 100;

/** The 4 car documents, with their default validity (months). */
export const DOCUMENTS = {
  visite: { libelle: 'Visite technique', dureeMois: 12 },
  vignette: { libelle: 'Vignette', dureeMois: 12 },
  assurance: { libelle: 'Assurance', dureeMois: 12 },
  carte_grise: { libelle: 'Carte grise', dureeMois: 120 },
};
export const BIENTOT_JOURS = 30; // "expire bientôt" from 30 days before the expiry date

const kmFr = (km) => `${nombreFr(km)} km`;
/** 12 → '1 an', 120 → '10 ans', 6 → '6 mois', 18 → '18 mois' */
export const dureeFr = (mois) => (mois % 12 === 0 ? `${mois / 12} an${mois > 12 ? 's' : ''}` : `${mois} mois`);

function statut(joursRestants) {
  if (joursRestants < 0) return 'expire';
  if (joursRestants <= BIENTOT_JOURS) return 'bientot';
  return 'valide';
}

const chargeJson = (c) => ({
  id: c.id,
  categorie: c.categorie,
  libelle: c.libelle,
  date: c.date_charge,
  montant: c.montant,
  description: c.description,
  creeLe: c.cree_le,
  ...(c.categorie === 'vidange' ? {
    kilometrage: c.kilometrage, intervalleKm: c.intervalle_km, prochaineKm: c.kilometrage + c.intervalle_km,
  } : {}),
  ...(DOCUMENTS[c.categorie] ? {
    dureeMois: c.duree_mois, expireLe: c.expire_le, joursRestants: c.jours_restants, statut: statut(c.jours_restants),
  } : {}),
});

/** Latest vidange and the 4 current documents (latest of each kind) of one car. */
function suivi(charges) {
  const plusRecent = (cat) => charges
    .filter((c) => c.categorie === cat)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0] ?? null;
  const vidange = plusRecent('vidange');
  const documents = Object.fromEntries(Object.keys(DOCUMENTS).map((cat) => [cat, plusRecent(cat)]));
  const alertes = Object.entries(documents)
    .filter(([, d]) => d && d.statut !== 'valide')
    .map(([cat, d]) => ({ document: cat, libelle: DOCUMENTS[cat].libelle, statut: d.statut, expireLe: d.expireLe, joursRestants: d.joursRestants }));
  return {
    vidange: vidange && {
      date: vidange.date, kilometrage: vidange.kilometrage, intervalleKm: vidange.intervalleKm, prochaineKm: vidange.prochaineKm,
    },
    documents,
    alertes,
  };
}

async function lireTous(client, bandeId) {
  const { rows } = await client.query(
    'SELECT * FROM vehicule WHERE bande_id = $1 ORDER BY lower(nom), id', [bandeId],
  );
  const { rows: charges } = await client.query(
    `SELECT c.*,
            (c.date_charge + c.duree_mois * interval '1 month')::date AS expire_le,
            (c.date_charge + c.duree_mois * interval '1 month')::date - current_date AS jours_restants
       FROM charge_vehicule c JOIN vehicule v ON v.id = c.vehicule_id
      WHERE v.bande_id = $1 ORDER BY c.date_charge DESC, c.id DESC`,
    [bandeId],
  );
  return rows.map((r) => {
    const liste = charges.filter((c) => c.vehicule_id === r.id).map(chargeJson);
    return {
      id: r.id,
      nom: r.nom,
      modele: r.modele,
      matricule: r.matricule,
      creeLe: r.cree_le,
      charges: liste,
      nombreCharges: liste.length,
      totalCharges: arrondi(liste.reduce((t, c) => t + c.montant, 0)),
      ...suivi(liste),
    };
  });
}

/** What the cars cost the Bande (used by the Charges summary: total cost). */
export async function coutVehicules(client, bandeId) {
  const vehicules = await lireTous(client, bandeId);
  return {
    nombre: vehicules.length,
    nombreCharges: vehicules.reduce((t, v) => t + v.nombreCharges, 0),
    total: arrondi(vehicules.reduce((t, v) => t + v.totalCharges, 0)),
  };
}

async function etat(client, bandeId) {
  const bande = await lireBandeClient(client, bandeId);
  const vehicules = await lireTous(client, bandeId);
  return {
    bande,
    vehicules,
    resume: {
      nombre: vehicules.length,
      nombreCharges: vehicules.reduce((t, v) => t + v.nombreCharges, 0),
      total: arrondi(vehicules.reduce((t, v) => t + v.totalCharges, 0)),
    },
  };
}

export async function lireVehicules(bandeId) {
  return etat({ query }, bandeId);
}

async function verrouillerBande(client, bandeId) {
  const { rows } = await client.query('SELECT id FROM bande WHERE id = $1 FOR UPDATE', [bandeId]);
  if (!rows[0]) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
}

async function lireUn(client, bandeId, vehiculeId) {
  const { rows: [r] } = await client.query(
    'SELECT * FROM vehicule WHERE id = $1 AND bande_id = $2 FOR UPDATE', [vehiculeId, bandeId],
  );
  if (!r) throw erreurs.introuvable('Ce véhicule n’existe pas ou a été supprimé.');
  return r;
}

const libelleVehicule = (v) => `${v.nom} ${v.modele} (${v.matricule})`;

export async function ajouterVehicule(bandeId, corps) {
  const champs = {};
  const [nom, eNom] = texte(corps?.nom, { nom: 'Le nom du véhicule', max: 60 });
  const [modele, eModele] = texte(corps?.modele, { nom: 'Le modèle', max: 60 });
  const [brut, eMatricule] = texte(corps?.matricule, { nom: 'Le matricule', max: 20 });
  if (eNom) champs.nom = eNom;
  if (eModele) champs.modele = eModele;
  if (eMatricule) champs.matricule = eMatricule;
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);
  const matricule = brut.replace(/\s+/g, ' ').toUpperCase();
  try {
    return await transaction(async (client) => {
      await verrouillerBande(client, bandeId);
      const { rows: [r] } = await client.query(
        'INSERT INTO vehicule (bande_id, nom, modele, matricule) VALUES ($1, $2, $3, $4) RETURNING *',
        [bandeId, nom, modele, matricule],
      );
      await journaliser(client, {
        bandeId, module: 'vehicules', action: 'creation', entiteId: r.id,
        description: `Véhicule ajouté : ${libelleVehicule(r)}`,
        apres: { nom, modele, matricule },
      });
      return etat(client, bandeId);
    });
  } catch (e) {
    if (e?.code === '23505' && e.constraint === 'vehicule_matricule_unique') {
      throw erreurs.conflit('Un véhicule de cette bande a déjà ce matricule.', { matricule: 'Un véhicule de cette bande a déjà ce matricule.' });
    }
    throw e;
  }
}

function validerCommun(corps, aujourdhui, { montantZero = false } = {}) {
  const champs = {};
  const [jour, eJour] = date(corps?.date, { nom: 'La date' });
  if (eJour) champs.date = eJour;
  else if (jour > aujourdhui) champs.date = 'La date ne peut pas être dans le futur.';
  const [montant, eMontant] = nombre(corps?.montant, { nom: 'Le montant', max: 9999999999, obligatoire: true });
  if (eMontant) champs.montant = eMontant;
  else if (montant < 0 || (montant === 0 && !montantZero)) champs.montant = `Le montant doit être supérieur ${montantZero ? 'ou égal ' : ''}à 0.`;
  const [description, eDescription] = texte(corps?.description ?? '', { nom: 'La description', min: 0, max: 500 });
  if (eDescription) champs.description = eDescription;
  return [champs, { date: jour, montant, description: description || null }];
}

async function inserer(client, vehiculeId, c) {
  const { rows: [r] } = await client.query(
    `INSERT INTO charge_vehicule
       (vehicule_id, categorie, libelle, date_charge, montant, description, kilometrage, intervalle_km, duree_mois)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *,
       (date_charge + duree_mois * interval '1 month')::date AS expire_le,
       (date_charge + duree_mois * interval '1 month')::date - current_date AS jours_restants`,
    [vehiculeId, c.categorie, c.libelle, c.date, c.montant, c.description,
      c.kilometrage ?? null, c.intervalleKm ?? null, c.dureeMois ?? null],
  );
  return chargeJson(r);
}

/**
 * Charge of a car: name, date, amount, description. With "vidange": true it is an oil change and
 * also needs the current mileage (kilometrage) and the distance to the next one (intervalleKm, 10 000 by
 * default). Returns the charge too, as "charge".
 */
export async function declarerCharge(bandeId, vehiculeId, corps) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const v = await lireUn(client, bandeId, vehiculeId);
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const c = validerCharge(corps, aujourdhui);
    const { libelle, kilometrage, intervalleKm } = c;
    const estVidange = c.categorie === 'vidange';
    const commun = c;

    const charge = await inserer(client, vehiculeId, c);
    await journaliser(client, {
      bandeId, module: 'vehicules', action: 'creation', entiteId: vehiculeId,
      description: estVidange
        ? `Vidange du véhicule ${libelleVehicule(v)} : ${libelle}, le ${dateFr(commun.date)}, à ${kmFr(kilometrage)}`
          + ` — prochaine vidange à ${kmFr(kilometrage + intervalleKm)} — ${montantFr(commun.montant)}`
        : `Charge du véhicule ${libelleVehicule(v)} : ${libelle}, le ${dateFr(commun.date)} — ${montantFr(commun.montant)}`,
      apres: { vehicule: libelleVehicule(v), ...charge },
    });
    return { ...(await etat(client, bandeId)), charge };
  });
}

/** Charge or vidange: { libelle, date, montant, description, vidange, kilometrage, intervalleKm } → row values. */
function validerCharge(corps, aujourdhui) {
  const [champs, commun] = validerCommun(corps, aujourdhui);
  const estVidange = corps?.vidange === true || corps?.vidange === 'true';
  const [libelle, eLibelle] = texte(corps?.libelle ?? (estVidange ? 'Vidange' : ''), { nom: 'Le nom de la charge', max: 100 });
  if (eLibelle) champs.libelle = eLibelle;
  let kilometrage = null;
  let intervalleKm = null;
  if (estVidange) {
    const sansEspaces = (x) => (typeof x === 'string' ? x.replace(/[\s\u00a0\u202f.]|km/gi, '') : x);
    const [km, eKm] = entier(sansEspaces(corps?.kilometrage), { nom: 'Le kilométrage', min: 0, max: 9999999 });
    if (eKm) champs.kilometrage = corps?.kilometrage == null || corps.kilometrage === '' ? 'Le kilométrage actuel est obligatoire.' : eKm;
    kilometrage = km;
    const brut = corps?.intervalleKm === undefined || corps?.intervalleKm === '' ? 10000 : sansEspaces(corps.intervalleKm);
    const [ikm, eIkm] = entier(brut, { nom: 'La distance avant la prochaine vidange', min: 1, max: 1000000 });
    if (eIkm) champs.intervalleKm = eIkm;
    intervalleKm = ikm;
  }
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);
  return {
    ...commun, categorie: estVidange ? 'vidange' : 'charge', libelle, kilometrage, intervalleKm, dureeMois: null,
  };
}

/** Document of kind `categorie`: { date, dureeMois, montant, description } → row values. */
function validerDocument(categorie, corps, aujourdhui) {
  const doc = DOCUMENTS[categorie];
  const [champs, commun] = validerCommun(corps, aujourdhui, { montantZero: true });
  const [dureeMois, eDuree] = entier(corps?.dureeMois === undefined || corps?.dureeMois === '' ? doc.dureeMois : corps.dureeMois,
    { nom: 'La durée', min: 1, max: 1200 });
  if (eDuree) champs.dureeMois = eDuree;
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);
  return {
    ...commun, categorie, libelle: doc.libelle, dureeMois, kilometrage: null, intervalleKm: null,
  };
}

/**
 * One of the 4 car documents: { document: 'visite' | 'vignette' | 'assurance' | 'carte_grise', date,
 * dureeMois (12 by default, 120 for the carte grise), montant (may be 0), description }.
 * The newest one of each kind is the current one. Returns it as "charge".
 */
export async function declarerDocument(bandeId, vehiculeId, corps) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const v = await lireUn(client, bandeId, vehiculeId);
    const doc = DOCUMENTS[corps?.document];
    if (!doc) throw erreurs.validation('Vérifiez les champs indiqués.', { document: 'Choisissez le document : visite, vignette, assurance ou carte grise.' });
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const commun = validerDocument(corps.document, corps, aujourdhui);
    const { dureeMois } = commun;
    const charge = await inserer(client, vehiculeId, commun);
    await journaliser(client, {
      bandeId, module: 'vehicules', action: 'creation', entiteId: vehiculeId,
      description: `Document du véhicule ${libelleVehicule(v)} : ${doc.libelle}, le ${dateFr(commun.date)}, `
        + `valable ${dureeFr(dureeMois)} (expire le ${dateFr(charge.expireLe)}) — ${montantFr(commun.montant)}`,
      apres: { vehicule: libelleVehicule(v), ...charge },
    });
    return { ...(await etat(client, bandeId)), charge };
  });
}

const LIBELLES = {
  categorie: ['type', (x) => ({ charge: 'charge', vidange: 'vidange' })[x] ?? DOCUMENTS[x]?.libelle ?? x],
  libelle: ['nom', (x) => x],
  date: ['date', dateFr],
  montant: ['montant', montantFr],
  kilometrage: ['kilométrage', kmFr],
  intervalleKm: ['prochaine vidange dans', kmFr],
  dureeMois: ['validité', dureeFr],
  description: ['description', (x) => (x ? `« ${x} »` : 'vide')],
};

/**
 * Edit a car charge. Same body as when declaring it: a charge can become a vidange or the reverse
 * ("vidange": true/false); a document keeps its kind (visite stays visite…).
 */
export async function modifierCharge(bandeId, vehiculeId, chargeId, corps) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const v = await lireUn(client, bandeId, vehiculeId);
    const { rows: [ligne] } = await client.query(
      `SELECT *, (date_charge + duree_mois * interval '1 month')::date AS expire_le,
              (date_charge + duree_mois * interval '1 month')::date - current_date AS jours_restants
         FROM charge_vehicule WHERE id = $1 AND vehicule_id = $2 FOR UPDATE`,
      [chargeId, vehiculeId],
    );
    if (!ligne) throw erreurs.introuvable('Cette charge n’existe pas ou a été supprimée.');
    const avant = chargeJson(ligne);
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const n = DOCUMENTS[avant.categorie]
      ? validerDocument(avant.categorie, corps, aujourdhui)
      : validerCharge(corps, aujourdhui);
    const changements = Object.keys(LIBELLES)
      .filter((k) => (avant[k] ?? null) !== (n[k] ?? null))
      .map((k) => `${LIBELLES[k][0]} ${avant[k] == null ? '—' : LIBELLES[k][1](avant[k])} → ${n[k] == null ? '—' : LIBELLES[k][1](n[k])}`);
    if (!changements.length) return { ...(await etat(client, bandeId)), charge: avant };

    const { rows: [r] } = await client.query(
      `UPDATE charge_vehicule
          SET categorie = $3, libelle = $4, date_charge = $5, montant = $6, description = $7,
              kilometrage = $8, intervalle_km = $9, duree_mois = $10
        WHERE id = $1 AND vehicule_id = $2
       RETURNING *,
         (date_charge + duree_mois * interval '1 month')::date AS expire_le,
         (date_charge + duree_mois * interval '1 month')::date - current_date AS jours_restants`,
      [chargeId, vehiculeId, n.categorie, n.libelle, n.date, n.montant, n.description, n.kilometrage, n.intervalleKm, n.dureeMois],
    );
    const charge = chargeJson(r);
    await journaliser(client, {
      bandeId, module: 'vehicules', action: 'modification', entiteId: vehiculeId,
      description: `Charge du véhicule ${libelleVehicule(v)} modifiée (${avant.libelle} du ${dateFr(avant.date)}) : ${changements.join(' ; ')}`,
      avant: { vehicule: libelleVehicule(v), ...avant },
      apres: { vehicule: libelleVehicule(v), ...charge },
    });
    return { ...(await etat(client, bandeId)), charge };
  });
}

/** Deletes a charge entered by mistake (password). */
export async function supprimerCharge(bandeId, vehiculeId, chargeId, motDePasse, utilisateurId) {
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
    await verrouillerBande(client, bandeId);
    const v = await lireUn(client, bandeId, vehiculeId);
    const { rows: [c] } = await client.query(
      'DELETE FROM charge_vehicule WHERE id = $1 AND vehicule_id = $2 RETURNING *', [chargeId, vehiculeId],
    );
    if (!c) throw erreurs.introuvable('Cette charge n’existe pas ou a déjà été supprimée.');
    const charge = chargeJson(c);
    await journaliser(client, {
      bandeId, module: 'vehicules', action: 'suppression', entiteId: vehiculeId,
      description: `Charge supprimée du véhicule ${libelleVehicule(v)} : ${charge.libelle} du ${dateFr(charge.date)} — ${montantFr(charge.montant)}`,
      avant: { vehicule: libelleVehicule(v), ...charge },
    });
    return etat(client, bandeId);
  });
}

/** Deletes the car and its charges (password): they leave the costs of the Bande. */
export async function supprimerVehicule(bandeId, vehiculeId, motDePasse, utilisateurId) {
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
    await verrouillerBande(client, bandeId);
    const v = await lireUn(client, bandeId, vehiculeId);
    const { rows: [{ n, total }] } = await client.query(
      'SELECT count(*)::int AS n, COALESCE(sum(montant), 0) AS total FROM charge_vehicule WHERE vehicule_id = $1', [vehiculeId],
    );
    await client.query('DELETE FROM vehicule WHERE id = $1', [vehiculeId]);
    await journaliser(client, {
      bandeId, module: 'vehicules', action: 'suppression', entiteId: vehiculeId,
      description: `Véhicule supprimé : ${libelleVehicule(v)}`
        + `${n ? `, avec ${n} charge${n > 1 ? 's' : ''} (${montantFr(total)})` : ''}`,
      avant: { nom: v.nom, modele: v.modele, matricule: v.matricule, nombreCharges: n, totalCharges: total },
    });
    return etat(client, bandeId);
  });
}
