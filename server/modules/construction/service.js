// Construction of the new farm: charges with no link to the Bandes. Two kinds, one list
// (stored type names kept from 0.13: 'grosse' / 'petite'):
//   grosse = charge générale   : nom, quantité (free text: "30 m³", "1 lot"), montant total, description
//   petite = charge spécifique : nom, unité, quantité (number), prix par unité → total = quantité × prix
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import {
  texte, date, nombre, dateFr, nombreFr, montantFr,
} from '../../lib/validation.js';
import { exigerMotDePasse } from '../auth/service.js';

export const TYPES = { grosse: 'charge générale', petite: 'charge spécifique' };

const arrondi = (n) => Math.round(n * 100) / 100;

/**
 * quantité × prix unitaire, rounded to the centime, computed in whole numbers so that
 * 2,5 × 3,33 = 8,325 gives 8,33 (floating point would give 8,3249… → 8,32).
 * Same function on screen: public/js/pages/construction.js.
 */
export const totalPetite = (quantite, prix) => Math.round((Math.round(quantite * 1000) * Math.round(prix * 100)) / 1000) / 100;

const versJson = (r) => ({
  id: r.id,
  type: r.type,
  date: r.date_charge,
  nom: r.nom,
  unite: r.unite,
  quantite: r.quantite,             // charge spécifique: number
  quantiteTexte: r.quantite_texte,  // charge générale: free text
  prixUnitaire: r.prix_unitaire,
  montantTotal: r.montant_total,
  description: r.description,
  creeLe: r.cree_le,
});

function resume(charges) {
  const somme = (liste) => arrondi(liste.reduce((t, c) => t + c.montantTotal, 0));
  const grosses = charges.filter((c) => c.type === 'grosse');
  const petites = charges.filter((c) => c.type === 'petite');
  return {
    nombre: charges.length,
    total: somme(charges),
    grosses: { nombre: grosses.length, total: somme(grosses) },
    petites: { nombre: petites.length, total: somme(petites) },
  };
}

async function etat(client) {
  const { rows } = await client.query('SELECT * FROM charge_construction ORDER BY date_charge DESC, id DESC');
  const charges = rows.map(versJson);
  return { charges, resume: resume(charges) };
}

export async function lireConstruction() {
  return etat({ query });
}

function valider(corps, aujourdhui) {
  const champs = {};
  const type = corps?.type;
  if (!Object.hasOwn(TYPES, type)) throw erreurs.validation('Type de charge inconnu (générale ou spécifique).');
  const petite = type === 'petite';

  const [nom, eNom] = texte(corps?.nom, { nom: 'Le nom de la charge', max: 100 });
  if (eNom) champs.nom = eNom;
  const [jour, eJour] = date(corps?.date, { nom: 'La date' });
  if (eJour) champs.date = eJour;
  else if (jour > aujourdhui) champs.date = 'La date ne peut pas être dans le futur.';
  let quantite = null;
  let quantiteTexte = null;
  if (petite) {
    const [q, eQuantite] = nombre(corps?.quantite, {
      nom: 'La quantité', max: 99999999999, decimales: 3, obligatoire: true,
    });
    if (eQuantite) champs.quantite = eQuantite;
    else if (q <= 0) champs.quantite = 'La quantité doit être supérieure à 0.';
    quantite = q;
  } else {
    const [t, eQuantite] = texte(corps?.quantite == null ? '' : String(corps.quantite), { nom: 'La quantité', max: 50 });
    if (eQuantite) champs.quantite = eQuantite;
    quantiteTexte = t;
  }

  let unite = null;
  let prixUnitaire = null;
  let montantTotal = null;
  if (petite) {
    const [u, eUnite] = texte(corps?.unite, { nom: 'L’unité', max: 20 });
    if (eUnite) champs.unite = eUnite;
    unite = u;
    const [p, ePrix] = nombre(corps?.prixUnitaire, { nom: 'Le prix', max: 99999999999, obligatoire: true });
    if (ePrix) champs.prixUnitaire = ePrix;
    else if (p <= 0) champs.prixUnitaire = 'Le prix doit être supérieur à 0.';
    prixUnitaire = p;
    // Calculated here, never taken from the screen.
    if (!champs.quantite && !champs.prixUnitaire) montantTotal = totalPetite(quantite, prixUnitaire);
    if (montantTotal === 0) champs.prixUnitaire = 'Le total (quantité × prix) est trop petit.';
  } else {
    const [m, eMontant] = nombre(corps?.montantTotal, { nom: 'Le montant total', max: 99999999999, obligatoire: true });
    if (eMontant) champs.montantTotal = eMontant;
    else if (m <= 0) champs.montantTotal = 'Le montant total doit être supérieur à 0.';
    montantTotal = m;
  }
  const [description, eDescription] = texte(corps?.description ?? '', { nom: 'La description', min: 0, max: 500 });
  if (eDescription) champs.description = eDescription;
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);

  return {
    type, date: jour, nom, unite, quantite, quantiteTexte, prixUnitaire, montantTotal, description: description || null,
  };
}

/** "ciment " typed when "Ciment" exists → "Ciment"; same for units ("KG" → "kg"). */
async function harmoniser(client, v) {
  const r = { ...v };
  for (const [cle, colonne] of [['nom', 'nom'], ['unite', 'unite']]) {
    if (!v[cle]) continue;
    const { rows: [x] } = await client.query(
      `SELECT ${colonne} AS valeur FROM charge_construction WHERE lower(${colonne}) = lower($1) ORDER BY id LIMIT 1`, [v[cle]],
    );
    if (x) r[cle] = x.valeur;
  }
  return r;
}

const quantiteFr = (c) => (c.type === 'petite' ? `${nombreFr(c.quantite)} ${c.unite}` : c.quantiteTexte);

function phrase(c) {
  return c.type === 'petite'
    ? `${c.nom}, le ${dateFr(c.date)} — ${quantiteFr(c)} × ${montantFr(c.prixUnitaire)} par ${c.unite} = ${montantFr(c.montantTotal)}`
    : `${c.nom}, le ${dateFr(c.date)} — quantité ${quantiteFr(c)}, ${montantFr(c.montantTotal)}`;
}

export async function ajouterCharge(corps) {
  return transaction(async (client) => {
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const v = await harmoniser(client, valider(corps, aujourdhui));
    const { rows: [r] } = await client.query(
      `INSERT INTO charge_construction
         (type, date_charge, nom, unite, quantite, quantite_texte, prix_unitaire, montant_total, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [v.type, v.date, v.nom, v.unite, v.quantite, v.quantiteTexte, v.prixUnitaire, v.montantTotal, v.description],
    );
    const charge = versJson(r);
    await journaliser(client, {
      module: 'construction', action: 'creation', entiteId: charge.id,
      description: `Construction — ${TYPES[charge.type]} : ${phrase(charge)}`,
      apres: charge,
    });
    return { ...(await etat(client)), charge };
  });
}

const LIBELLES = {
  date: ['date', dateFr],
  nom: ['nom', (x) => x],
  quantiteTexte: ['quantité', (x) => x],
  quantite: ['quantité', (x) => nombreFr(x)],
  unite: ['unité', (x) => x],
  prixUnitaire: ['prix', montantFr],
  montantTotal: ['total', montantFr],
  description: ['description', (x) => (x ? `« ${x} »` : 'vide')],
};

/** Edit a charge (same kind: a general charge stays general). */
export async function modifierCharge(chargeId, corps) {
  return transaction(async (client) => {
    const { rows: [ligne] } = await client.query('SELECT * FROM charge_construction WHERE id = $1 FOR UPDATE', [chargeId]);
    if (!ligne) throw erreurs.introuvable('Cette charge n’existe pas ou a été supprimée.');
    const avant = versJson(ligne);
    const { rows: [{ aujourdhui }] } = await client.query('SELECT current_date AS aujourdhui');
    const v = valider({ ...corps, type: avant.type }, aujourdhui);
    // Same name written differently keeps its spelling; another name follows the earlier charges.
    const h = await harmoniser(client, v);
    if (v.nom.toLowerCase() === avant.nom.toLowerCase()) h.nom = avant.nom;
    if (v.unite && avant.unite && v.unite.toLowerCase() === avant.unite.toLowerCase()) h.unite = avant.unite;
    const changements = Object.keys(LIBELLES)
      .filter((k) => (avant[k] ?? null) !== (h[k] ?? null))
      .map((k) => `${LIBELLES[k][0]} ${avant[k] == null ? '—' : LIBELLES[k][1](avant[k])} → ${h[k] == null ? '—' : LIBELLES[k][1](h[k])}`);
    if (!changements.length) return { ...(await etat(client)), charge: avant };

    const { rows: [r] } = await client.query(
      `UPDATE charge_construction
          SET date_charge = $2, nom = $3, unite = $4, quantite = $5, quantite_texte = $6,
              prix_unitaire = $7, montant_total = $8, description = $9
        WHERE id = $1 RETURNING *`,
      [chargeId, h.date, h.nom, h.unite, h.quantite, h.quantiteTexte, h.prixUnitaire, h.montantTotal, h.description],
    );
    const charge = versJson(r);
    await journaliser(client, {
      module: 'construction', action: 'modification', entiteId: chargeId,
      description: `Construction — ${TYPES[charge.type]} modifiée (${avant.nom}) : ${changements.join(' ; ')}`,
      avant, apres: charge,
    });
    return { ...(await etat(client)), charge };
  });
}

export async function supprimerCharge(chargeId, motDePasse, utilisateurId) {
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
    const { rows: [r] } = await client.query('DELETE FROM charge_construction WHERE id = $1 RETURNING *', [chargeId]);
    if (!r) throw erreurs.introuvable('Cette charge n’existe pas ou a déjà été supprimée.');
    const charge = versJson(r);
    await journaliser(client, {
      module: 'construction', action: 'suppression', entiteId: charge.id,
      description: `Construction — ${TYPES[charge.type]} supprimée : ${phrase(charge)}`,
      avant: charge,
    });
    return etat(client);
  });
}
