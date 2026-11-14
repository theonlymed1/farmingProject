// Mortalité et malades: declarations of sick, recovered and dead birds, per sex.
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import {
  date, entier, dateFr, nombreFr,
} from '../../lib/validation.js';
import { lireBandeClient } from '../bandes/service.js';
import { verifierCoherence } from './coherence.js';

export const TYPES = {
  maladie: 'malades',
  guerison: 'guérisons',
  mort: 'morts',
};

function versJson(r) {
  return {
    id: r.id,
    type: r.type,
    provenance: r.provenance,
    date: r.date_mouvement,
    males: r.males,
    femelles: r.femelles,
    total: r.males + r.femelles,
    note: r.note,
    creeLe: r.cree_le,
  };
}

/** '3 mâles et 2 femelles', '1 mâle', '4 femelles' */
export function libelleOiseaux(males, femelles) {
  const parts = [];
  if (males) parts.push(`${nombreFr(males)} mâle${males > 1 ? 's' : ''}`);
  if (femelles) parts.push(`${nombreFr(femelles)} femelle${femelles > 1 ? 's' : ''}`);
  return parts.join(' et ');
}

function descriptionMouvement(m) {
  const origine = m.type === 'mort' ? (m.provenance === 'malades' ? ', qui étaient malades' : ', qui étaient en bonne santé') : '';
  return `${libelleOiseaux(m.males, m.femelles)}${origine}, le ${dateFr(m.date)}${m.note ? ` (${m.note})` : ''}`;
}

async function verrouillerBande(client, bandeId) {
  const { rows } = await client.query('SELECT id FROM bande WHERE id = $1 FOR UPDATE', [bandeId]);
  if (!rows[0]) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
}

async function etat(client, bandeId) {
  const bande = await lireBandeClient(client, bandeId);
  const { rows } = await client.query(
    `SELECT * FROM mouvement_sante WHERE bande_id = $1 ORDER BY date_mouvement DESC, id DESC`,
    [bandeId],
  );
  return { bande, mouvements: rows.map(versJson) };
}

/** The Bande (with its health totals per sex) and all its declarations, newest first. */
export async function lireSante(bandeId) {
  return etat({ query }, bandeId);
}

function valider(corps, bande, aujourdhui) {
  const champs = {};
  const type = corps?.type;
  if (!Object.hasOwn(TYPES, type)) champs.type = 'Type de déclaration inconnu.';

  const [jour, eDate] = date(corps?.date, { nom: 'La date' });
  if (eDate) champs.date = eDate;
  else if (jour < bande.dateDebut) champs.date = `La date ne peut pas être avant le début de la bande (${dateFr(bande.dateDebut)}).`;
  else if (jour > aujourdhui) champs.date = 'La date ne peut pas être dans le futur.';

  const vide = (v) => v === undefined || v === null || v === '';
  const [males, eMales] = entier(vide(corps?.males) ? 0 : corps.males, { nom: 'Le nombre de mâles', min: 0, max: 1000000 });
  const [femelles, eFemelles] = entier(vide(corps?.femelles) ? 0 : corps.femelles, {
    nom: 'Le nombre de femelles', min: 0, max: 1000000,
  });
  if (eMales) champs.males = eMales;
  if (eFemelles) champs.femelles = eFemelles;
  if (!eMales && !eFemelles && males + femelles === 0) champs.males = 'Indiquez au moins un oiseau (mâle ou femelle).';

  let provenance = null;
  if (type === 'mort') {
    provenance = corps?.provenance;
    if (provenance !== 'sains' && provenance !== 'malades') {
      champs.provenance = 'Indiquez si ces oiseaux étaient en bonne santé ou malades.';
    }
  }

  const note = typeof corps?.note === 'string' && corps.note.trim() ? corps.note.trim().replace(/\s+/g, ' ') : null;
  if (note && note.length > 200) champs.note = 'La remarque : 200 caractères maximum.';

  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);
  return {
    type, provenance, date: jour, males, femelles, note,
  };
}

export async function declarer(bandeId, corps) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const bande = await lireBandeClient(client, bandeId);
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const v = valider(corps, bande, aujourdhui);

    const { rows: [ligne] } = await client.query(
      `INSERT INTO mouvement_sante (bande_id, type, provenance, date_mouvement, males, femelles, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [bandeId, v.type, v.provenance, v.date, v.males, v.femelles, v.note],
    );
    await verifierCoherence(client, bandeId); // e.g. healing more birds than are sick → refused

    const mouvement = versJson(ligne);
    await journaliser(client, {
      bandeId,
      module: 'volaille',
      action: 'creation',
      entiteId: mouvement.id,
      description: `Déclaration de ${TYPES[v.type]} : ${descriptionMouvement(mouvement)}`,
      apres: mouvement,
    });
    return etat(client, bandeId);
  });
}

/** Cancels a declaration made by mistake. Refused if later declarations depend on it. */
export async function supprimerMouvement(bandeId, mouvementId) {
  await transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const { rows: [ligne] } = await client.query(
      'DELETE FROM mouvement_sante WHERE id = $1 AND bande_id = $2 RETURNING *',
      [mouvementId, bandeId],
    );
    if (!ligne) throw erreurs.introuvable('Cette déclaration n’existe pas ou a déjà été supprimée.');
    await verifierCoherence(client, bandeId);

    const mouvement = versJson(ligne);
    await journaliser(client, {
      bandeId,
      module: 'volaille',
      action: 'suppression',
      entiteId: mouvement.id,
      description: `Déclaration de ${TYPES[mouvement.type]} annulée : ${descriptionMouvement(mouvement)}`,
      avant: mouvement,
    });
  });
}
