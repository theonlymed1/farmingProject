// Croissance et pesées: per-Bande guide (period + unit) and the table of guide / observed weights.
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import { entier } from '../../lib/validation.js';
import { lireBandeClient } from '../bandes/service.js';
import { exigerMotDePasse } from '../auth/service.js';
import {
  construirePoints, libelleControle, formaterPoids,
} from './calcul.js';

const COLONNES = {
  guideMales: ['guide_males_g', 'guide mâles'],
  observeMales: ['observe_males_g', 'observé mâles'],
  guideFemelles: ['guide_femelles_g', 'guide femelles'],
  observeFemelles: ['observe_femelles_g', 'observé femelles'],
};
const MAX_GRAMMES = 99999.9;

async function etat(client, bandeId) {
  const bande = await lireBandeClient(client, bandeId);
  const { rows: [config] } = await client.query(
    'SELECT periode_jours, modifie_le FROM croissance_config WHERE bande_id = $1', [bandeId],
  );
  if (!config) return { bande, config: null, points: [] };

  const { rows: lignes } = await client.query(
    'SELECT * FROM croissance_point WHERE bande_id = $1 ORDER BY rang', [bandeId],
  );
  const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
  return {
    bande,
    config: { periodeJours: config.periode_jours, modifieLe: config.modifie_le },
    points: construirePoints(bande, config.periode_jours, lignes, aujourdhui),
  };
}

export async function lireCroissance(bandeId) {
  return etat({ query }, bandeId);
}

async function verrouiller(client, bandeId) {
  const { rows } = await client.query('SELECT id FROM bande WHERE id = $1 FOR UPDATE', [bandeId]);
  if (!rows[0]) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
}

const libellePeriode = (p) => (p === 7 ? 'chaque semaine' : p === 1 ? 'chaque jour' : `tous les ${p} jours`);

/**
 * Sets the check frequency. Changing it when values exist would shift every value to another
 * date, so it clears them — only if the request says confirmerEffacement: true.
 */
export async function configurer(bandeId, corps) {
  const [periode, ePeriode] = entier(corps?.periodeJours, { nom: 'La fréquence', min: 1, max: 60 });
  if (ePeriode) throw erreurs.validation('Vérifiez les champs indiqués.', { periodeJours: ePeriode });

  return transaction(async (client) => {
    await verrouiller(client, bandeId);
    const { rows: [avant] } = await client.query(
      'SELECT periode_jours FROM croissance_config WHERE bande_id = $1', [bandeId],
    );
    if (avant && avant.periode_jours === periode) return etat(client, bandeId);
    const { rows: [{ n }] } = await client.query('SELECT count(*) AS n FROM croissance_point WHERE bande_id = $1', [bandeId]);

    if (avant && n > 0 && corps?.confirmerEffacement !== true) {
      throw erreurs.conflit(
        `Changer la fréquence effacera ${n > 1 ? `les ${n} contrôles déjà saisis` : 'le contrôle déjà saisi'}. Confirmez pour continuer.`,
        { confirmationRequise: true, nombreControles: n },
      );
    }
    if (avant && n > 0) await client.query('DELETE FROM croissance_point WHERE bande_id = $1', [bandeId]);
    await client.query(
      `INSERT INTO croissance_config (bande_id, periode_jours) VALUES ($1, $2)
       ON CONFLICT (bande_id) DO UPDATE SET periode_jours = $2, modifie_le = now()`,
      [bandeId, periode],
    );

    const efface = n > 0 ? ` (${n} contrôle${n > 1 ? 's' : ''} effacé${n > 1 ? 's' : ''})` : '';
    await journaliser(client, {
      bandeId,
      module: 'croissance',
      action: avant ? 'modification' : 'creation',
      description: avant
        ? `Guide de croissance modifié : fréquence ${libellePeriode(avant.periode_jours)} → ${libellePeriode(periode)}${efface}`
        : `Guide de croissance créé : contrôle ${libellePeriode(periode)}`,
      avant: avant ? { periodeJours: avant.periode_jours } : null,
      apres: { periodeJours: periode },
    });
    return etat(client, bandeId);
  });
}

/** Deletes the Bande's guide and every value in it, after checking the password again. */
export async function supprimerGuide(bandeId, motDePasse, utilisateurId) {
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
    await verrouiller(client, bandeId);
    const { rows: [config] } = await client.query(
      'DELETE FROM croissance_config WHERE bande_id = $1 RETURNING periode_jours', [bandeId],
    );
    if (!config) throw erreurs.introuvable('Cette bande n’a pas de guide de croissance.');
    const { rows: effaces } = await client.query('DELETE FROM croissance_point WHERE bande_id = $1 RETURNING rang', [bandeId]);
    const n = effaces.length;
    await journaliser(client, {
      bandeId,
      module: 'croissance',
      action: 'suppression',
      description: `Guide de croissance supprimé (contrôle ${libellePeriode(config.periode_jours)}, `
        + `${n} contrôle${n > 1 ? 's' : ''} avec des valeurs)`,
      avant: { periodeJours: config.periode_jours },
    });
    return etat(client, bandeId);
  });
}

/** Weight in grams from the API: null (empty) or a number between 0.1 and 99 999.9. */
function poids(valeur, libelle) {
  if (valeur === null || valeur === undefined || valeur === '') return [null, null];
  const n = Number(valeur);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_GRAMMES) return [null, `${libelle} : poids invalide.`];
  return [Math.round(n * 10) / 10, null];
}

/**
 * Saves the edited cells. Body: { points: [{ rang, guideMales?, observeMales?, guideFemelles?, observeFemelles? }] }
 * in grams. Only the keys present are changed; null empties a cell.
 */
export async function enregistrerValeurs(bandeId, corps) {
  const lignes = Array.isArray(corps?.points) ? corps.points : null;
  if (!lignes || !lignes.length) throw erreurs.validation('Aucune valeur à enregistrer.');
  if (lignes.length > 400) throw erreurs.validation('Trop de lignes envoyées.');

  return transaction(async (client) => {
    await verrouiller(client, bandeId);
    const { rows: [config] } = await client.query(
      'SELECT periode_jours FROM croissance_config WHERE bande_id = $1', [bandeId],
    );
    if (!config) throw erreurs.conflit('Configurez d’abord la fréquence des contrôles.');

    const champs = {};
    const changements = [];
    for (const ligne of lignes) {
      const [rang, eRang] = entier(ligne?.rang, { nom: 'Le numéro de contrôle', min: 1, max: 400 });
      if (eRang) { champs[`rang-${ligne?.rang}`] = eRang; continue; }
      const nom = libelleControle(rang, config.periode_jours);

      const nouvelles = {};
      for (const [cle, [colonne, libelle]] of Object.entries(COLONNES)) {
        if (!Object.hasOwn(ligne, cle)) continue;
        const [v, e] = poids(ligne[cle], `${nom}, ${libelle}`);
        if (e) champs[`${rang}-${cle}`] = e;
        else nouvelles[colonne] = v;
      }
      if (!Object.keys(nouvelles).length || Object.keys(champs).length) continue;

      const { rows: [existante] } = await client.query(
        'SELECT * FROM croissance_point WHERE bande_id = $1 AND rang = $2', [bandeId, rang],
      );
      const fusion = {};
      for (const [colonne] of Object.values(COLONNES)) {
        fusion[colonne] = Object.hasOwn(nouvelles, colonne)
          ? nouvelles[colonne]
          : (existante?.[colonne] == null ? null : Number(existante[colonne]));
      }
      for (const [colonne, libelle] of Object.values(COLONNES)) {
        const ancien = existante?.[colonne] == null ? null : Number(existante[colonne]);
        if (ancien !== fusion[colonne]) {
          changements.push(`${nom} ${libelle} ${formaterPoids(ancien)} → ${formaterPoids(fusion[colonne])}`);
        }
      }

      if (Object.values(fusion).every((v) => v === null)) {
        await client.query('DELETE FROM croissance_point WHERE bande_id = $1 AND rang = $2', [bandeId, rang]);
      } else {
        await client.query(
          `INSERT INTO croissance_point (bande_id, rang, guide_males_g, observe_males_g, guide_femelles_g, observe_femelles_g)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (bande_id, rang) DO UPDATE SET guide_males_g = $3, observe_males_g = $4,
             guide_femelles_g = $5, observe_femelles_g = $6, modifie_le = now()`,
          [bandeId, rang, fusion.guide_males_g, fusion.observe_males_g, fusion.guide_femelles_g, fusion.observe_femelles_g],
        );
      }
    }
    if (Object.keys(champs).length) throw erreurs.validation('Certaines valeurs sont invalides.', champs);

    if (changements.length) {
      const MAX = 12;
      const liste = changements.slice(0, MAX).join(' ; ');
      const reste = changements.length > MAX ? ` ; et ${changements.length - MAX} autres modifications` : '';
      await journaliser(client, {
        bandeId,
        module: 'croissance',
        action: 'modification',
        description: `Croissance : ${liste}${reste}`,
        apres: { points: lignes },
      });
    }
    return etat(client, bandeId);
  });
}
