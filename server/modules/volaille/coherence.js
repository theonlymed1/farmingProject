// Checks that a Bande's health declarations add up, day after day, for each sex:
// never fewer than 0 healthy or sick birds, and nothing declared before the Bande started.
// Called inside the transaction AFTER a change (new declaration, deletion, Bande edit);
// throwing rolls the change back.
import { erreurs } from '../../lib/erreurs.js';
import { dateFr, nombreFr } from '../../lib/validation.js';

// Effect of one declaration on the "healthy" (sains) and "sick" (malades) groups.
const effet = (col, groupe) => groupe === 'sains'
  ? `CASE WHEN type = 'maladie' THEN -${col} WHEN type = 'guerison' THEN ${col}
          WHEN provenance = 'sains' THEN -${col} ELSE 0 END`
  : `CASE WHEN type = 'maladie' THEN ${col} WHEN type = 'guerison' THEN -${col}
          WHEN provenance = 'malades' THEN -${col} ELSE 0 END`;

export const SQL_EFFET = {
  sainsMales: effet('males', 'sains'),
  maladesMales: effet('males', 'malades'),
  sainsFemelles: effet('femelles', 'sains'),
  maladesFemelles: effet('femelles', 'malades'),
};

const GROUPES = [
  ['sains_m', 'mâles en bonne santé'],
  ['malades_m', 'mâles malades'],
  ['sains_f', 'femelles en bonne santé'],
  ['malades_f', 'femelles malades'],
];

export async function verifierCoherence(client, bandeId) {
  const { rows: [avant] } = await client.query(
    `SELECT min(m.date_mouvement) AS premiere, b.date_debut
       FROM bande b LEFT JOIN mouvement_sante m ON m.bande_id = b.id
      WHERE b.id = $1 GROUP BY b.id`,
    [bandeId],
  );
  if (avant?.premiere && avant.premiere < avant.date_debut) {
    throw erreurs.conflit(
      `Des déclarations de santé existent dès le ${dateFr(avant.premiere)}, `
      + `avant la date de début de la bande (${dateFr(avant.date_debut)}).`,
    );
  }

  const { rows: [probleme] } = await client.query(
    `WITH j AS (
       SELECT date_mouvement AS jour,
              SUM(${SQL_EFFET.sainsMales})      AS ds_m,
              SUM(${SQL_EFFET.maladesMales})    AS dm_m,
              SUM(${SQL_EFFET.sainsFemelles})   AS ds_f,
              SUM(${SQL_EFFET.maladesFemelles}) AS dm_f
         FROM mouvement_sante WHERE bande_id = $1
        GROUP BY date_mouvement
     ), c AS (
       SELECT jour, SUM(ds_m) OVER w AS cs_m, SUM(dm_m) OVER w AS cm_m,
                    SUM(ds_f) OVER w AS cs_f, SUM(dm_f) OVER w AS cm_f
         FROM j WINDOW w AS (ORDER BY jour)
     )
     SELECT c.jour,
            b.nombre_males    + c.cs_m AS sains_m,   c.cm_m AS malades_m,
            b.nombre_femelles + c.cs_f AS sains_f,   c.cm_f AS malades_f
       FROM c CROSS JOIN bande b
      WHERE b.id = $1
        AND (b.nombre_males + c.cs_m < 0 OR c.cm_m < 0 OR b.nombre_femelles + c.cs_f < 0 OR c.cm_f < 0)
      ORDER BY c.jour
      LIMIT 1`,
    [bandeId],
  );
  if (!probleme) return;

  const [cle, libelle] = GROUPES.find(([k]) => probleme[k] < 0);
  throw erreurs.conflit(
    `Pas assez de ${libelle} au ${dateFr(probleme.jour)} : il en manquerait ${nombreFr(-probleme[cle])}.`,
  );
}
