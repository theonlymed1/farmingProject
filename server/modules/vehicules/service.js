// Véhicules of a Bande (work cars) and their charges (oil change, tyres, fuel…).
// The charges count in the total cost of the Bande (see charges/service.js, resume).
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import {
  texte, date, nombre, dateFr, montantFr,
} from '../../lib/validation.js';
import { lireBandeClient } from '../bandes/service.js';
import { exigerMotDePasse } from '../auth/service.js';

const arrondi = (n) => Math.round(n * 100) / 100;

const chargeJson = (c) => ({
  id: c.id, libelle: c.libelle, date: c.date_charge, montant: c.montant, description: c.description, creeLe: c.cree_le,
});

async function lireTous(client, bandeId) {
  const { rows } = await client.query(
    'SELECT * FROM vehicule WHERE bande_id = $1 ORDER BY lower(nom), id', [bandeId],
  );
  const { rows: charges } = await client.query(
    `SELECT c.* FROM charge_vehicule c JOIN vehicule v ON v.id = c.vehicule_id
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

/** Charge of a car: name, date, amount, description. Returns it too, as "charge". */
export async function declarerCharge(bandeId, vehiculeId, corps) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const v = await lireUn(client, bandeId, vehiculeId);
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const champs = {};
    const [libelle, eLibelle] = texte(corps?.libelle, { nom: 'Le nom de la charge', max: 100 });
    if (eLibelle) champs.libelle = eLibelle;
    const [jour, eJour] = date(corps?.date, { nom: 'La date' });
    if (eJour) champs.date = eJour;
    else if (jour > aujourdhui) champs.date = 'La date ne peut pas être dans le futur.';
    const [montant, eMontant] = nombre(corps?.montant, { nom: 'Le montant', max: 9999999999, obligatoire: true });
    if (eMontant) champs.montant = eMontant;
    else if (montant <= 0) champs.montant = 'Le montant doit être supérieur à 0.';
    const [description, eDescription] = texte(corps?.description ?? '', { nom: 'La description', min: 0, max: 500 });
    if (eDescription) champs.description = eDescription;
    if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);

    const { rows: [c] } = await client.query(
      `INSERT INTO charge_vehicule (vehicule_id, libelle, date_charge, montant, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [vehiculeId, libelle, jour, montant, description || null],
    );
    const charge = chargeJson(c);
    await journaliser(client, {
      bandeId, module: 'vehicules', action: 'creation', entiteId: vehiculeId,
      description: `Charge du véhicule ${libelleVehicule(v)} : ${libelle}, le ${dateFr(jour)} — ${montantFr(montant)}`,
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
