// Bandes: list, create, read, update, delete (password required).
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import {
  texte, entier, date, dateFr, nombreFr,
} from '../../lib/validation.js';
import { SQL_EFFET, verifierCoherence } from '../volaille/coherence.js';
import { exigerMotDePasse } from '../auth/service.js';

// Computed in SQL so every screen agrees:
//  date_fin  = start + duration
//  statut    = 'a_venir' (not started) | 'en_cours' (green) | 'terminee' (red, duration passed)
//  age_jours = day 1 is the arrival day
//  s.*       = health totals per sex from the declarations (phase 3)
const SELECT_BANDE = `
  SELECT b.id, b.nom, b.date_debut, b.duree_mois, b.nombre_males, b.nombre_femelles, b.nombre_poussins,
         b.cree_le, b.modifie_le,
         fin.date_fin, s.morts_m, s.morts_f, s.malades_m, s.malades_f,
         CASE WHEN current_date < b.date_debut THEN 'a_venir'
              WHEN current_date > fin.date_fin  THEN 'terminee'
              ELSE 'en_cours' END AS statut,
         (current_date - b.date_debut + 1) AS age_jours
    FROM bande b
   CROSS JOIN LATERAL (SELECT (b.date_debut + make_interval(months => b.duree_mois))::date AS date_fin) fin
   CROSS JOIN LATERAL (
     SELECT COALESCE(SUM(males)    FILTER (WHERE type = 'mort'), 0) AS morts_m,
            COALESCE(SUM(femelles) FILTER (WHERE type = 'mort'), 0) AS morts_f,
            COALESCE(SUM(${SQL_EFFET.maladesMales}), 0)    AS malades_m,
            COALESCE(SUM(${SQL_EFFET.maladesFemelles}), 0) AS malades_f
       FROM mouvement_sante m WHERE m.bande_id = b.id) s`;

const pourcent = (n, total) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);

function groupe(recus, morts, malades) {
  return {
    recus,
    sains: recus - morts - malades,
    malades,
    morts,
    vivants: recus - morts,
    tauxMortalite: pourcent(morts, recus),
  };
}

function versJson(r) {
  return {
    id: r.id,
    nom: r.nom,
    dateDebut: r.date_debut,
    dureeMois: r.duree_mois,
    dateFin: r.date_fin,
    nombreMales: r.nombre_males,
    nombreFemelles: r.nombre_femelles,
    nombrePoussins: r.nombre_poussins,
    effectifActuel: r.nombre_poussins - r.morts_m - r.morts_f,
    sante: {
      males: groupe(r.nombre_males, r.morts_m, r.malades_m),
      femelles: groupe(r.nombre_femelles, r.morts_f, r.malades_f),
      total: groupe(r.nombre_poussins, r.morts_m + r.morts_f, r.malades_m + r.malades_f),
    },
    statut: r.statut,
    ageJours: r.age_jours,
    creeLe: r.cree_le,
    modifieLe: r.modifie_le,
  };
}

/** Values stored in the history (what the farmer typed, not the computed fields). */
const instantane = (b) => ({
  nom: b.nom, dateDebut: b.dateDebut, dureeMois: b.dureeMois, nombreMales: b.nombreMales, nombreFemelles: b.nombreFemelles,
});

export function validerBande(corps) {
  const champs = {};
  const [nom, eNom] = texte(corps?.nom, { nom: 'Le nom', max: 60 });
  const [dateDebut, eDate] = date(corps?.dateDebut, { nom: 'La date de début' });
  const [dureeMois, eDuree] = entier(corps?.dureeMois ?? 4, { nom: 'La durée', min: 1, max: 12 });
  const [nombreMales, eMales] = entier(corps?.nombreMales ?? 0, { nom: 'Le nombre de mâles', min: 0, max: 1000000 });
  const [nombreFemelles, eFemelles] = entier(corps?.nombreFemelles ?? 0, {
    nom: 'Le nombre de femelles', min: 0, max: 1000000,
  });
  if (eNom) champs.nom = eNom;
  if (eDate) champs.dateDebut = eDate;
  if (eDuree) champs.dureeMois = eDuree;
  if (eMales) champs.nombreMales = eMales;
  if (eFemelles) champs.nombreFemelles = eFemelles;
  if (!eMales && !eFemelles && (nombreMales + nombreFemelles < 1 || nombreMales + nombreFemelles > 1000000)) {
    champs.nombreMales = 'Le total des poussins (mâles + femelles) doit être entre 1 et 1000000.';
  }
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);
  return {
    nom, dateDebut, dureeMois, nombreMales, nombreFemelles,
  };
}

function nomDejaPris(e) {
  if (e?.code === '23505' && e.constraint === 'bande_nom_unique') {
    return erreurs.conflit('Une bande porte déjà ce nom.', { nom: 'Une bande porte déjà ce nom.' });
  }
  return e;
}

/** Reads one Bande with the given client (inside a transaction) or the pool. */
export async function lireBandeClient(client, id) {
  return lire(client, id);
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
        `INSERT INTO bande (nom, date_debut, duree_mois, nombre_males, nombre_femelles)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [v.nom, v.dateDebut, v.dureeMois, v.nombreMales, v.nombreFemelles],
      );
      const bande = await lire(client, id);
      await journaliser(client, {
        bandeId: id,
        module: 'bandes',
        action: 'creation',
        entiteId: id,
        description: `Bande « ${v.nom} » créée : ${nombreFr(v.nombreMales + v.nombreFemelles)} poussins `
          + `(${nombreFr(v.nombreMales)} mâles, ${nombreFr(v.nombreFemelles)} femelles), `
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
  nombreMales: ['mâles', nombreFr],
  nombreFemelles: ['femelles', nombreFr],
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
        `UPDATE bande SET nom = $1, date_debut = $2, duree_mois = $3, nombre_males = $4, nombre_femelles = $5,
                modifie_le = now()
          WHERE id = $6`,
        [v.nom, v.dateDebut, v.dureeMois, v.nombreMales, v.nombreFemelles, id],
      );
      // Fewer chicks or a later start date must still fit the health declarations already made.
      await verifierCoherence(client, id);
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
  await transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
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
