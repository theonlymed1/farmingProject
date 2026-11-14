// Ventes: birds sold to a customer. Sold birds leave the flock (they are taken from the healthy
// birds, per sex group), and each sale gets an invoice number V<year>-<n> and a printable bill.
import { query, transaction } from '../../db/postgres.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import {
  texte, entier, date, nombre, dateFr, nombreFr, montantFr,
} from '../../lib/validation.js';
import { lireBandeClient } from '../bandes/service.js';
import { verifierCoherence } from '../volaille/coherence.js';
import { libelleOiseaux } from '../volaille/service.js';
import { resumeCouts } from '../charges/service.js';
import { exigerMotDePasse } from '../auth/service.js';

export const TYPES_CLIENT = { particulier: 'particulier', societe: 'société' };

const arrondi = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function versJson(r) {
  const oiseaux = r.males + r.femelles + r.non_sexes;
  return {
    id: r.id,
    numero: r.numero,
    date: r.date_vente,
    client: r.client,
    typeClient: r.type_client,
    males: r.males,
    femelles: r.femelles,
    nonSexes: r.non_sexes,
    oiseaux,
    poidsTotalKg: r.poids_total_kg,
    prixTotal: r.prix_total,
    // Estimations shown on the screen and the bill.
    poidsMoyenKg: arrondi(r.poids_total_kg / oiseaux, 3),
    prixParOiseau: arrondi(r.prix_total / oiseaux),
    prixParKg: arrondi(r.prix_total / r.poids_total_kg),
    description: r.description,
    creeLe: r.cree_le,
    modifieLe: r.modifie_le,
  };
}

function resume(ventes, couts) {
  const oiseaux = ventes.reduce((t, v) => t + v.oiseaux, 0);
  const poidsKg = arrondi(ventes.reduce((t, v) => t + v.poidsTotalKg, 0), 3);
  const total = arrondi(ventes.reduce((t, v) => t + v.prixTotal, 0));
  return {
    nombre: ventes.length,
    oiseaux,
    poidsKg,
    total,
    poidsMoyenKg: oiseaux ? arrondi(poidsKg / oiseaux, 3) : 0,
    prixMoyenKg: poidsKg ? arrondi(total / poidsKg) : 0,
    prixMoyenOiseau: oiseaux ? arrondi(total / oiseaux) : 0,
    coutTotal: couts.coutTotal,
    // Result of the Bande so far: what was sold minus everything it cost.
    resultat: arrondi(total - couts.coutTotal),
  };
}

async function etat(client, bandeId) {
  const bande = await lireBandeClient(client, bandeId);
  const { rows } = await client.query(
    'SELECT * FROM vente WHERE bande_id = $1 ORDER BY date_vente DESC, id DESC', [bandeId],
  );
  const ventes = rows.map(versJson);
  return { bande, ventes, resume: resume(ventes, await resumeCouts(client, bandeId)) };
}

export async function lireVentes(bandeId) {
  return etat({ query }, bandeId);
}

/** Only the sales summary (Bande page). */
export async function resumeVentes(bandeId) {
  return (await etat({ query }, bandeId)).resume;
}

/** "1 250,5", "1250.5 kg", "800 g" → kilograms. Returns [kg, error]. */
function poids(valeur) {
  const nom = 'Le poids total';
  if (valeur === null || valeur === undefined || valeur === '') return [null, `${nom} est obligatoire.`];
  let v = valeur;
  let facteur = 1;
  if (typeof v === 'string') {
    const m = /^(.*?)\s*(kg|g|t)?\s*$/i.exec(v.trim());
    v = m[1];
    const unite = (m[2] ?? 'kg').toLowerCase();
    facteur = { kg: 1, g: 0.001, t: 1000 }[unite];
  }
  const [n, e] = nombre(v, { nom, decimales: 6, obligatoire: true });
  if (e) return [null, e];
  if (n <= 0) return [null, `${nom} doit être supérieur à 0.`];
  const kg = arrondi(n * facteur, 3);
  if (kg <= 0) return [null, `${nom} doit être supérieur à 0.`];
  if (kg > 999999999) return [null, `${nom} est trop grand.`];
  return [kg, null];
}

function valider(corps, bande, aujourdhui) {
  const champs = {};
  const [jour, eDate] = date(corps?.date, { nom: 'La date' });
  if (eDate) champs.date = eDate;
  else if (jour < bande.dateDebut) champs.date = `La date ne peut pas être avant le début de la bande (${dateFr(bande.dateDebut)}).`;
  else if (jour > aujourdhui) champs.date = 'La date ne peut pas être dans le futur.';

  const [client, eClient] = texte(corps?.client, { nom: 'Le nom du client', max: 100 });
  if (eClient) champs.client = eClient;
  const typeClient = corps?.typeClient;
  if (!Object.hasOwn(TYPES_CLIENT, typeClient)) champs.typeClient = 'Choisissez : particulier ou société.';

  const vide = (v) => v === undefined || v === null || v === '';
  const compte = (cle, nom) => {
    const [n, e] = entier(vide(corps?.[cle]) ? 0 : corps[cle], { nom, min: 0, max: 1000000 });
    if (e) champs[cle] = e;
    return n ?? 0;
  };
  const males = compte('males', 'Le nombre de mâles');
  const femelles = compte('femelles', 'Le nombre de femelles');
  const nonSexes = compte('nonSexes', 'Le nombre de non sexés');
  if (!champs.males && !champs.femelles && !champs.nonSexes && males + femelles + nonSexes === 0) {
    champs.males = 'Indiquez au moins un oiseau vendu (mâle, femelle ou non sexé).';
  }

  const [poidsTotalKg, ePoids] = poids(corps?.poidsTotalKg);
  if (ePoids) champs.poidsTotalKg = ePoids;
  const [prixTotal, ePrix] = nombre(corps?.prixTotal, { nom: 'Le prix total', obligatoire: true });
  if (ePrix) champs.prixTotal = ePrix;
  const [description, eDescription] = texte(corps?.description ?? '', { nom: 'La description', min: 0, max: 500 });
  if (eDescription) champs.description = eDescription;

  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);
  return {
    date: jour, client, typeClient, males, femelles, nonSexes, poidsTotalKg, prixTotal, description: description || null,
  };
}

/** "Hassan" typed when "HASSAN" already bought → keeps the first spelling, so one client stays one client. */
async function harmoniserClient(client, nom) {
  const { rows: [r] } = await client.query(
    'SELECT client FROM vente WHERE lower(client) = lower($1) ORDER BY id LIMIT 1', [nom],
  );
  return r ? r.client : nom;
}

async function verrouillerBande(client, bandeId) {
  const { rows } = await client.query('SELECT id FROM bande WHERE id = $1 FOR UPDATE', [bandeId]);
  if (!rows[0]) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
}

/** Next invoice number for the year of the sale: V2026-0001, V2026-0002, … (never reused). */
async function prochainNumero(client, jour) {
  const annee = Number(jour.slice(0, 4));
  const { rows: [{ dernier }] } = await client.query(
    `INSERT INTO compteur_facture (annee, dernier) VALUES ($1, 1)
     ON CONFLICT (annee) DO UPDATE SET dernier = compteur_facture.dernier + 1
     RETURNING dernier`,
    [annee],
  );
  return `V${annee}-${String(dernier).padStart(4, '0')}`;
}

const libelleClient = (v) => `${v.client} (${TYPES_CLIENT[v.typeClient]})`;
const poidsFr = (kg) => `${nombreFr(kg)} kg`;

function resumeVente(v) {
  return `n° ${v.numero} à ${libelleClient(v)}, le ${dateFr(v.date)} — `
    + `${libelleOiseaux(v.males, v.femelles, v.nonSexes)}, ${poidsFr(v.poidsTotalKg)}, ${montantFr(v.prixTotal)}`;
}

const COLONNES = ['date_vente', 'client', 'type_client', 'males', 'femelles', 'non_sexes', 'poids_total_kg', 'prix_total', 'description'];
const valeurs = (v) => [v.date, v.client, v.typeClient, v.males, v.femelles, v.nonSexes, v.poidsTotalKg, v.prixTotal, v.description];

async function aujourdhui(client) {
  return (await client.query('SELECT current_date AS j')).rows[0].j;
}

export async function ajouterVente(bandeId, corps) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const bande = await lireBandeClient(client, bandeId);
    const v = valider(corps, bande, await aujourdhui(client));
    v.client = await harmoniserClient(client, v.client);
    const numero = await prochainNumero(client, v.date);
    const { rows: [ligne] } = await client.query(
      `INSERT INTO vente (numero, bande_id, ${COLONNES.join(', ')})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [numero, bandeId, ...valeurs(v)],
    );
    await verifierCoherence(client, bandeId);
    const vente = versJson(ligne);
    await journaliser(client, {
      bandeId, module: 'ventes', action: 'creation', entiteId: vente.id,
      description: `Vente ${resumeVente(vente)}`,
      apres: vente,
    });
    return { ...(await etat(client, bandeId)), vente };
  });
}

const LIBELLES = {
  date: ['date', dateFr],
  client: ['client', (x) => x],
  typeClient: ['type', (x) => TYPES_CLIENT[x]],
  males: ['mâles', nombreFr],
  femelles: ['femelles', nombreFr],
  nonSexes: ['non sexés', nombreFr],
  poidsTotalKg: ['poids', poidsFr],
  prixTotal: ['prix', montantFr],
  description: ['description', (x) => (x ? `« ${x} »` : 'vide')],
};

export async function modifierVente(bandeId, venteId, corps) {
  return transaction(async (client) => {
    await verrouillerBande(client, bandeId);
    const bande = await lireBandeClient(client, bandeId);
    const v = valider(corps, bande, await aujourdhui(client));
    const { rows: [ligne] } = await client.query(
      'SELECT * FROM vente WHERE id = $1 AND bande_id = $2 FOR UPDATE', [venteId, bandeId],
    );
    if (!ligne) throw erreurs.introuvable('Cette vente n’existe pas ou a été supprimée.');
    const avant = versJson(ligne);
    // Same client written differently ("hassan" for "Hassan") keeps its spelling.
    v.client = avant.client.toLowerCase() === v.client.toLowerCase() ? avant.client : await harmoniserClient(client, v.client);
    const changements = Object.keys(LIBELLES)
      .filter((k) => avant[k] !== v[k])
      .map((k) => `${LIBELLES[k][0]} ${LIBELLES[k][1](avant[k])} → ${LIBELLES[k][1](v[k])}`);
    if (!changements.length) return { ...(await etat(client, bandeId)), vente: avant };

    const { rows: [maj] } = await client.query(
      `UPDATE vente SET ${COLONNES.map((c, i) => `${c} = $${i + 3}`).join(', ')}, modifie_le = now()
        WHERE id = $1 AND bande_id = $2 RETURNING *`,
      [venteId, bandeId, ...valeurs(v)],
    );
    await verifierCoherence(client, bandeId);
    const vente = versJson(maj);
    await journaliser(client, {
      bandeId, module: 'ventes', action: 'modification', entiteId: venteId,
      description: `Vente n° ${avant.numero} modifiée : ${changements.join(' ; ')}`,
      avant, apres: vente,
    });
    return { ...(await etat(client, bandeId)), vente };
  });
}

export async function supprimerVente(bandeId, venteId, motDePasse, utilisateurId) {
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);
    await verrouillerBande(client, bandeId);
    const { rows: [ligne] } = await client.query(
      'DELETE FROM vente WHERE id = $1 AND bande_id = $2 RETURNING *', [venteId, bandeId],
    );
    if (!ligne) throw erreurs.introuvable('Cette vente n’existe pas ou a été supprimée.');
    // The birds come back to the flock; nothing can go negative, but keep the check for safety.
    await verifierCoherence(client, bandeId);
    const vente = versJson(ligne);
    await journaliser(client, {
      bandeId, module: 'ventes', action: 'suppression', entiteId: venteId,
      description: `Vente supprimée : ${resumeVente(vente)} (les oiseaux reviennent dans le troupeau)`,
      avant: vente,
    });
    return etat(client, bandeId);
  });
}

/** Customers of earlier sales (all Bandes), most frequent first, with their usual type. */
export async function clients() {
  const { rows } = await query(
    `SELECT (array_agg(client ORDER BY id))[1] AS client,
            (array_agg(type_client ORDER BY id DESC))[1] AS type_client
       FROM vente GROUP BY lower(client) ORDER BY count(*) DESC, max(id) DESC LIMIT 300`,
  );
  return rows.map((r) => ({ client: r.client, typeClient: r.type_client }));
}
