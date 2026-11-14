// Historique: list of every recorded operation, with filters. Lines can be deleted (password).
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { exigerMotDePasse } from '../auth/service.js';
import { erreurs } from '../../lib/erreurs.js';
import { date, entier, idParam } from '../../lib/validation.js';

export const MODULES = ['bandes', 'volaille', 'croissance', 'charges', 'ventes', 'employes', 'parametres'];
export const ACTIONS = ['creation', 'modification', 'suppression', 'autre'];

/**
 * Filters (all optional): bande (id), module, action, du / au (YYYY-MM-DD, both included),
 * q (words in the description), limite (1–500, default 100), decalage (for "Afficher plus").
 */
export async function listerHistorique(filtres = {}) {
  const champs = {};
  const conditions = [];
  const params = [];
  const ajouter = (sql, valeur) => { params.push(valeur); conditions.push(sql.replace('?', `$${params.length}`)); };

  if (filtres.bande !== undefined && filtres.bande !== '') {
    const id = idParam(filtres.bande);
    if (!id) throw erreurs.introuvable('Cette bande n’existe pas.');
    ajouter('h.bande_id = ?', id);
  }
  if (filtres.module) {
    if (!MODULES.includes(filtres.module)) champs.module = 'Section inconnue.';
    else ajouter('h.module = ?', filtres.module);
  }
  if (filtres.action) {
    if (!ACTIONS.includes(filtres.action)) champs.action = 'Type d’action inconnu.';
    else ajouter('h.action = ?', filtres.action);
  }
  for (const [cle, sql, nom] of [['du', '(h.date_heure)::date >= ?', 'La date de début'], ['au', '(h.date_heure)::date <= ?', 'La date de fin']]) {
    if (!filtres[cle]) continue;
    const [jour, e] = date(filtres[cle], { nom });
    if (e) champs[cle] = e;
    else ajouter(sql, jour);
  }
  if (filtres.du && filtres.au && !champs.du && !champs.au && filtres.du > filtres.au) {
    champs.au = 'La date de fin est avant la date de début.';
  }
  const mots = String(filtres.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
  for (const mot of mots) {
    // Every word must appear (case ignored). % and _ typed by the user are taken literally.
    ajouter("h.description ILIKE ? ESCAPE '\\'", `%${mot.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  const [limite, eLimite] = entier(filtres.limite ?? 100, { nom: 'La limite', min: 1, max: 500 });
  const [decalage, eDecalage] = entier(filtres.decalage ?? 0, { nom: 'Le décalage', min: 0, max: 10000000 });
  if (eLimite) champs.limite = eLimite;
  if (eDecalage) champs.decalage = eDecalage;
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les filtres.', champs);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows: [{ total }] } = await query(`SELECT count(*) AS total FROM historique h ${where}`, params);
  const { rows } = await query(
    `SELECT h.id, h.date_heure, h.bande_id, b.nom AS bande_nom, h.module, h.action, h.entite_id,
            h.description, h.avant, h.apres
       FROM historique h LEFT JOIN bande b ON b.id = h.bande_id
       ${where}
      ORDER BY h.date_heure DESC, h.id DESC
      LIMIT ${limite} OFFSET ${decalage}`,
    params,
  );
  return {
    total,
    limite,
    decalage,
    entrees: rows.map((r) => ({
      id: r.id,
      dateHeure: r.date_heure,
      bandeId: r.bande_id,
      bandeNom: r.bande_nom,
      module: r.module,
      action: r.action,
      entiteId: r.entite_id,
      description: r.description,
      avant: r.avant,
      apres: r.apres,
    })),
  };
}

// --- Clearing (password required) ------------------------------------------------------

/** Deletes one history line. */
export async function supprimerEntree(id, motDePasse, utilisateurId) {
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
    const { rows } = await client.query('DELETE FROM historique WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) throw erreurs.introuvable('Cette opération n’existe pas ou a déjà été supprimée.');
    return { supprimees: 1 };
  });
}

/**
 * Clears the whole history of one Bande (bande given) or the whole history (no bande).
 * One line is then written, so a trace remains that the history was cleared.
 */
export async function effacerHistorique({ bande, motDePasse }, utilisateurId) {
  let bandeId = null;
  if (bande !== undefined && bande !== null && bande !== '') {
    bandeId = idParam(bande);
    if (!bandeId) throw erreurs.introuvable('Cette bande n’existe pas.');
  }
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
    let nomBande = null;
    if (bandeId) {
      const { rows: [b] } = await client.query('SELECT nom FROM bande WHERE id = $1', [bandeId]);
      if (!b) throw erreurs.introuvable('Cette bande n’existe pas.');
      nomBande = b.nom;
    }
    const { rows } = await client.query(
      `DELETE FROM historique ${bandeId ? 'WHERE bande_id = $1' : ''} RETURNING id`,
      bandeId ? [bandeId] : [],
    );
    const n = rows.length;
    await journaliser(client, {
      bandeId,
      module: bandeId ? 'bandes' : 'parametres',
      action: 'suppression',
      description: `Historique ${nomBande ? `de la bande « ${nomBande} » ` : ''}effacé : `
        + `${n} opération${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''}`,
    });
    return { supprimees: n };
  });
}
