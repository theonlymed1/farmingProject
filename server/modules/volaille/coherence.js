// Checks that a Bande's health declarations add up, day after day, for each sex group
// (males, females, non-sexed): never fewer than 0 healthy or sick birds, and nothing declared
// before the Bande started. Called inside the transaction AFTER a change (new declaration,
// deletion, Bande edit); throwing rolls the change back.
//
// At the start every chick is non-sexed and healthy. Effect of each declaration type:
//   maladie  : healthy → sick           (same sex group)
//   guerison : sick → healthy           (same sex group)
//   mort     : healthy or sick → dead   (provenance 'sains' / 'malades')
//   sexage   : healthy non-sexed → healthy males (males) and healthy females (femelles)
//   vente    : healthy → sold (out of the flock), from table vente
// Declarations and sales are read together from the view mouvement_troupeau (migration 011).
import { erreurs } from '../../lib/erreurs.js';
import { dateFr, nombreFr } from '../../lib/validation.js';

/** SQL expression: change of the "healthy" or "sick" count of one sex column for one declaration. */
function effet(col, etatSante) {
  if (etatSante === 'malades') {
    return `CASE type WHEN 'maladie' THEN ${col} WHEN 'guerison' THEN -${col}
                      WHEN 'mort' THEN CASE WHEN provenance = 'malades' THEN -${col} ELSE 0 END
                      ELSE 0 END`;
  }
  // Sexing adds to healthy males / females and takes the same number from healthy non-sexed.
  const sexage = col === 'non_sexes' ? '-(males + femelles)' : col;
  return `CASE type WHEN 'maladie' THEN -${col} WHEN 'guerison' THEN ${col}
                    WHEN 'mort' THEN CASE WHEN provenance = 'sains' THEN -${col} ELSE 0 END
                    WHEN 'sexage' THEN ${sexage}
                    WHEN 'vente' THEN -${col}
                    ELSE 0 END`;
}

export const SQL_EFFET = {
  sainsMales: effet('males', 'sains'),
  maladesMales: effet('males', 'malades'),
  sainsFemelles: effet('femelles', 'sains'),
  maladesFemelles: effet('femelles', 'malades'),
  sainsNonSexes: effet('non_sexes', 'sains'),
  maladesNonSexes: effet('non_sexes', 'malades'),
};

const GROUPES = [
  ['sains_m', 'mâles en bonne santé'],
  ['malades_m', 'mâles malades'],
  ['sains_f', 'femelles en bonne santé'],
  ['malades_f', 'femelles malades'],
  ['sains_n', 'oiseaux non sexés en bonne santé'],
  ['malades_n', 'oiseaux non sexés malades'],
];

export async function verifierCoherence(client, bandeId) {
  const { rows: [avant] } = await client.query(
    `SELECT min(m.date_mouvement) AS premiere, b.date_debut
       FROM bande b LEFT JOIN mouvement_troupeau m ON m.bande_id = b.id
      WHERE b.id = $1 GROUP BY b.id`,
    [bandeId],
  );
  if (avant?.premiere && avant.premiere < avant.date_debut) {
    throw erreurs.conflit(
      `Des déclarations ou des ventes existent dès le ${dateFr(avant.premiere)}, `
      + `avant la date de début de la bande (${dateFr(avant.date_debut)}).`,
    );
  }

  const { rows: [probleme] } = await client.query(
    `WITH j AS (
       SELECT date_mouvement AS jour,
              SUM(${SQL_EFFET.sainsMales})      AS ds_m, SUM(${SQL_EFFET.maladesMales})    AS dm_m,
              SUM(${SQL_EFFET.sainsFemelles})   AS ds_f, SUM(${SQL_EFFET.maladesFemelles}) AS dm_f,
              SUM(${SQL_EFFET.sainsNonSexes})   AS ds_n, SUM(${SQL_EFFET.maladesNonSexes}) AS dm_n
         FROM mouvement_troupeau WHERE bande_id = $1
        GROUP BY date_mouvement
     ), c AS (
       SELECT jour,
              SUM(ds_m) OVER w AS sains_m, SUM(dm_m) OVER w AS malades_m,
              SUM(ds_f) OVER w AS sains_f, SUM(dm_f) OVER w AS malades_f,
              SUM(ds_n) OVER w AS cs_n,    SUM(dm_n) OVER w AS malades_n
         FROM j WINDOW w AS (ORDER BY jour)
     )
     SELECT c.jour, c.sains_m, c.malades_m, c.sains_f, c.malades_f,
            b.nombre_poussins + c.cs_n AS sains_n, c.malades_n
       FROM c CROSS JOIN bande b
      WHERE b.id = $1
        AND (c.sains_m < 0 OR c.malades_m < 0 OR c.sains_f < 0 OR c.malades_f < 0
             OR b.nombre_poussins + c.cs_n < 0 OR c.malades_n < 0)
      ORDER BY c.jour
      LIMIT 1`,
    [bandeId],
  );
  if (!probleme) return;

  const [cle, libelle] = GROUPES.find(([k]) => probleme[k] < 0);
  throw erreurs.conflit(
    `Pas assez ${/^[aeiouyéèêâàô]/i.test(libelle) ? 'd’' : 'de '}${libelle} au ${dateFr(probleme.jour)} : `
    + `il en manquerait ${nombreFr(-probleme[cle])}.`,
  );
}
