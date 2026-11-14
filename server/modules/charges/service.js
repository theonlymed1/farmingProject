// Charges: purchases and services of a Bande, with suggestions taken from earlier charges.
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import {
  texte, date, dateFr, nombreFr, montantFr,
} from '../../lib/validation.js';
import { lireBandeClient } from '../bandes/service.js';
import { exigerMotDePasse } from '../auth/service.js';

const quantiteFr = (q, u) => (q == null ? null : `${nombreFr(q)}${u ? ` ${u}` : ''}`);

function versJson(r) {
  return {
    id: r.id,
    date: r.date_charge,
    vendeur: r.vendeur,
    typeProduit: r.type_produit,
    produit: r.produit,
    quantite: r.quantite,
    unite: r.unite,
    prixTotal: r.prix_total,
    description: r.description,
    creeLe: r.cree_le,
    modifieLe: r.modifie_le,
  };
}

function resume(charges, bande) {
  const avecPrix = charges.filter((c) => c.prixTotal != null);
  const total = Math.round(avecPrix.reduce((t, c) => t + c.prixTotal, 0) * 100) / 100;
  const parType = new Map();
  for (const c of charges) {
    const cle = c.typeProduit.toLowerCase();
    if (!parType.has(cle)) parType.set(cle, { type: c.typeProduit, nombre: 0, total: 0, sansPrix: 0 });
    const t = parType.get(cle);
    t.nombre += 1;
    if (c.prixTotal == null) t.sansPrix += 1;
    else t.total = Math.round((t.total + c.prixTotal) * 100) / 100;
  }
  // Total cost of the Bande = chicks bought + charges with a price.
  const prixPoussins = bande.prixPoussins ?? 0;
  const coutTotal = Math.round((total + prixPoussins) * 100) / 100;
  return {
    total,
    nombre: charges.length,
    sansPrix: charges.length - avecPrix.length,
    prixPoussins: bande.prixPoussins,
    coutTotal,
    coutParPoussin: bande.nombrePoussins ? Math.round((coutTotal / bande.nombrePoussins) * 100) / 100 : 0,
    parType: [...parType.values()].sort((a, b) => b.total - a.total || a.type.localeCompare(b.type, 'fr')),
  };
}

async function etat(client, bandeId) {
  const bande = await lireBandeClient(client, bandeId);
  const { rows } = await client.query(
    'SELECT * FROM charge WHERE bande_id = $1 ORDER BY date_charge DESC, id DESC', [bandeId],
  );
  const charges = rows.map(versJson);
  return { bande, charges, resume: resume(charges, bande) };
}

export async function lireCharges(bandeId) {
  return etat({ query }, bandeId);
}

/** Number typed as "1,5" or 1.5; null if empty. Returns [value, error]. */
function nombreOptionnel(valeur, { nom, max, decimales }) {
  if (valeur === null || valeur === undefined || valeur === '') return [null, null];
  const n = typeof valeur === 'string' ? Number(valeur.replace(/[\s  ]/g, '').replace(',', '.')) : valeur;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return [null, `${nom} doit être un nombre positif.`];
  if (n > max) return [null, `${nom} est trop grand.`];
  return [Math.round(n * 10 ** decimales) / 10 ** decimales, null];
}

function valider(corps) {
  const champs = {};
  const [dateCharge, eDate] = date(corps?.date, { nom: 'La date' });
  const [vendeur, eVendeur] = texte(corps?.vendeur, { nom: 'Le vendeur', max: 80 });
  const [typeProduit, eType] = texte(corps?.typeProduit, { nom: 'Le type de produit', max: 60 });
  const [produit, eProduit] = texte(corps?.produit, { nom: 'Le produit ou service', max: 100 });
  let [quantite, eQuantite] = nombreOptionnel(corps?.quantite, { nom: 'La quantité', max: 999999999, decimales: 3 });
  if (quantite === 0) { quantite = null; eQuantite = 'La quantité doit être supérieure à 0.'; }
  const [prixTotal, ePrix] = nombreOptionnel(corps?.prixTotal, { nom: 'Le prix total', max: 9999999999, decimales: 2 });
  const [unite, eUnite] = texte(corps?.unite ?? '', { nom: 'L’unité', min: 0, max: 20 });
  const [description, eDescription] = texte(corps?.description ?? '', { nom: 'La description', min: 0, max: 500 });

  Object.entries({
    date: eDate, vendeur: eVendeur, typeProduit: eType, produit: eProduit,
    quantite: eQuantite, unite: eUnite, prixTotal: ePrix, description: eDescription,
  }).forEach(([k, e]) => { if (e) champs[k] = e; });
  if (unite && quantite == null && !eQuantite) champs.quantite = 'Indiquez la quantité pour cette unité.';
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);

  return {
    date: dateCharge, vendeur, typeProduit, produit, quantite, unite: unite || null, prixTotal, description: description || null,
  };
}

const COLONNES = ['date_charge', 'vendeur', 'type_produit', 'produit', 'quantite', 'unite', 'prix_total', 'description'];
const valeurs = (v) => [v.date, v.vendeur, v.typeProduit, v.produit, v.quantite, v.unite, v.prixTotal, v.description];

function resumeCharge(c) {
  const q = quantiteFr(c.quantite, c.unite);
  return `${c.produit} (${c.typeProduit}) chez ${c.vendeur}, le ${dateFr(c.date)}`
    + `${q ? ` — ${q}` : ''} — ${c.prixTotal == null ? 'prix à saisir' : montantFr(c.prixTotal)}`;
}

/**
 * "alf sahel " typed when "Alf Sahel" already exists → "Alf Sahel": one seller, product, type or
 * unit is always written the same way, so suggestions and totals don't split it in two.
 */
async function harmoniser(client, v) {
  const colonnes = { vendeur: 'vendeur', typeProduit: 'type_produit', produit: 'produit', unite: 'unite' };
  const resultat = { ...v };
  for (const [cle, colonne] of Object.entries(colonnes)) {
    if (!v[cle]) continue;
    const { rows: [r] } = await client.query(
      `SELECT ${colonne} AS valeur FROM charge WHERE lower(${colonne}) = lower($1) ORDER BY id LIMIT 1`, [v[cle]],
    );
    if (r) resultat[cle] = r.valeur;
  }
  return resultat;
}

async function verrouillerBande(client, bandeId) {
  const { rows } = await client.query('SELECT id FROM bande WHERE id = $1 FOR UPDATE', [bandeId]);
  if (!rows[0]) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
}

export async function ajouterCharge(bandeId, corps) {
  const saisie = valider(corps);
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const v = await harmoniser(client, saisie);
    const { rows: [ligne] } = await client.query(
      `INSERT INTO charge (bande_id, ${COLONNES.join(', ')}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [bandeId, ...valeurs(v)],
    );
    const charge = versJson(ligne);
    await journaliser(client, {
      bandeId, module: 'charges', action: 'creation', entiteId: charge.id,
      description: `Charge ajoutée : ${resumeCharge(charge)}`,
      apres: charge,
    });
    return etat(client, bandeId);
  });
}

const LIBELLES = {
  date: ['date', dateFr],
  vendeur: ['vendeur', (x) => x],
  typeProduit: ['type', (x) => x],
  produit: ['produit', (x) => x],
  quantite: ['quantité', (x) => (x == null ? 'vide' : nombreFr(x))],
  unite: ['unité', (x) => x ?? 'vide'],
  prixTotal: ['prix', (x) => (x == null ? 'à saisir' : montantFr(x))],
  description: ['description', (x) => (x ? `« ${x} »` : 'vide')],
};

export async function modifierCharge(bandeId, chargeId, corps) {
  const saisie = valider(corps);
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const v = await harmoniser(client, saisie);
    const { rows: [ligne] } = await client.query(
      'SELECT * FROM charge WHERE id = $1 AND bande_id = $2 FOR UPDATE', [chargeId, bandeId],
    );
    if (!ligne) throw erreurs.introuvable('Cette charge n’existe pas ou a été supprimée.');
    const avant = versJson(ligne);
    const changements = Object.keys(LIBELLES)
      .filter((k) => avant[k] !== v[k])
      .map((k) => `${LIBELLES[k][0]} ${LIBELLES[k][1](avant[k])} → ${LIBELLES[k][1](v[k])}`);
    if (!changements.length) return etat(client, bandeId);

    const { rows: [maj] } = await client.query(
      `UPDATE charge SET ${COLONNES.map((c, i) => `${c} = $${i + 3}`).join(', ')}, modifie_le = now()
        WHERE id = $1 AND bande_id = $2 RETURNING *`,
      [chargeId, bandeId, ...valeurs(v)],
    );
    await journaliser(client, {
      bandeId, module: 'charges', action: 'modification', entiteId: chargeId,
      description: `Charge modifiée (${avant.produit} chez ${avant.vendeur}) : ${changements.join(' ; ')}`,
      avant, apres: versJson(maj),
    });
    return etat(client, bandeId);
  });
}

export async function supprimerCharge(bandeId, chargeId, motDePasse, utilisateurId) {
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
    await verrouillerBande(client, bandeId);
    const { rows: [ligne] } = await client.query(
      'DELETE FROM charge WHERE id = $1 AND bande_id = $2 RETURNING *', [chargeId, bandeId],
    );
    if (!ligne) throw erreurs.introuvable('Cette charge n’existe pas ou a été supprimée.');
    const charge = versJson(ligne);
    await journaliser(client, {
      bandeId, module: 'charges', action: 'suppression', entiteId: chargeId,
      description: `Charge supprimée : ${resumeCharge(charge)}`,
      avant: charge,
    });
    return etat(client, bandeId);
  });
}

/**
 * Suggestions for the form, from every earlier charge (all Bandes), most used first:
 *  - vendeurs: all sellers
 *  - types: types bought from this seller first, then the others
 *  - produits: this seller's products (with their usual type and unit), or all if no seller yet
 *  - unites: units already used
 */
export async function suggestions({ vendeur = '' } = {}) {
  const v = String(vendeur).trim().toLowerCase();
  const distincts = async (colonne, filtre = '', params = []) => (await query(
    `SELECT (array_agg(${colonne} ORDER BY id DESC))[1] AS valeur
       FROM charge WHERE ${colonne} IS NOT NULL ${filtre}
      GROUP BY lower(${colonne}) ORDER BY count(*) DESC, max(id) DESC LIMIT 200`,
    params,
  )).rows.map((r) => r.valeur);

  const vendeurs = await distincts('vendeur');
  const typesVendeur = v ? await distincts('type_produit', 'AND lower(vendeur) = $1', [v]) : [];
  const tousTypes = await distincts('type_produit');
  const types = [...typesVendeur, ...tousTypes.filter((t) => !typesVendeur.some((x) => x.toLowerCase() === t.toLowerCase()))];

  const { rows: produits } = await query(
    `SELECT (array_agg(produit ORDER BY id DESC))[1] AS produit,
            (array_agg(type_produit ORDER BY id DESC))[1] AS type,
            (array_agg(unite ORDER BY id DESC) FILTER (WHERE unite IS NOT NULL))[1] AS unite
       FROM charge ${v ? 'WHERE lower(vendeur) = $1' : ''}
      GROUP BY lower(produit) ORDER BY count(*) DESC, max(id) DESC LIMIT 200`,
    v ? [v] : [],
  );
  const unites = await distincts('unite');
  return {
    vendeurs, types, produits: produits.map((p) => ({ produit: p.produit, typeProduit: p.type, unite: p.unite })), unites,
  };
}
