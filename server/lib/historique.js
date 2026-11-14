// Writes one history line. Always call it with the transaction client, never the pool,
// so the history row is saved only if the change itself is saved.
//
//   await journaliser(client, {
//     bandeId: 3,
//     module: 'charges',
//     action: 'creation',
//     entiteId: charge.id,
//     description: `Achat de ${charge.quantite} sacs d'aliment — ${charge.total} DH`,
//     apres: charge,
//   });

const ACTIONS = new Set(['creation', 'modification', 'suppression', 'autre']);

export async function journaliser(client, {
  bandeId = null, module, action, entiteId = null, description, avant = null, apres = null,
}) {
  if (!module || !description) throw new Error('journaliser : « module » et « description » sont obligatoires');
  if (!ACTIONS.has(action)) throw new Error(`journaliser : action inconnue « ${action} »`);

  await client.query(
    `INSERT INTO historique (bande_id, module, action, entite_id, description, avant, apres)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      bandeId, module, action, entiteId, description,
      avant === null ? null : JSON.stringify(avant),
      apres === null ? null : JSON.stringify(apres),
    ],
  );
}
