// Fake API used when api.js runs in 'mock' mode (?mode=mock).
// One entry per endpoint from docs/api.md: copy the example response from the contract.
import { ErreurApi } from '../erreurs.js';
import { calculerCompte as compteMock } from '../employes-calcul.js';

// Simulated login state, kept for this browser tab.
const etat = {
  get connecte() { return sessionStorage.getItem('mock-connecte') === '1'; },
  set connecte(v) { sessionStorage.setItem('mock-connecte', v ? '1' : '0'); },
};
const MOCK_IDENTIFIANT = 'admin';
const MOCK_MOT_DE_PASSE = 'Test-1234!';

function exigerConnexion() {
  if (!etat.connecte) throw new ErreurApi(401, 'NON_AUTORISE', 'Votre session a expiré. Veuillez vous reconnecter.');
}

// --- Simulated Bandes (kept in sessionStorage) ---------------------------------
const lireBandes = () => JSON.parse(sessionStorage.getItem('mock-bandes') ?? '[]');
const ecrireBandes = (l) => sessionStorage.setItem('mock-bandes', JSON.stringify(l));
const jourIso = (d) => d.toISOString().slice(0, 10);

function calculer(b) {
  const [a, m, j] = b.dateDebut.split('-').map(Number);
  const total = m - 1 + b.dureeMois;
  const dernier = new Date(Date.UTC(a + Math.floor(total / 12), (total % 12) + 1, 0)).getUTCDate();
  const dateFin = jourIso(new Date(Date.UTC(a + Math.floor(total / 12), total % 12, Math.min(j, dernier))));
  const aujourdhui = jourIso(new Date());
  const statut = aujourdhui < b.dateDebut ? 'a_venir' : aujourdhui > dateFin ? 'terminee' : 'en_cours';
  const ageJours = Math.round((Date.parse(aujourdhui) - Date.parse(b.dateDebut)) / 864e5) + 1;
  // Sales count like healthy birds leaving the flock (type 'vente', see migration 011).
  const mv = [...lireMouvements(), ...lireVentesMock().map((v) => ({ ...v, type: 'vente' }))].filter((m) => m.bandeId === b.id);
  const somme = (f) => mv.reduce((t, m) => t + f(m), 0);
  // Same rules as server/modules/volaille/coherence.js (every chick starts non-sexed and healthy).
  const effet = (m, cle, etatSante) => {
    if (etatSante === 'malades') return { maladie: m[cle], guerison: -m[cle], mort: m.provenance === 'malades' ? -m[cle] : 0 }[m.type] ?? 0;
    const sexage = cle === 'nonSexes' ? -(m.males + m.femelles) : m[cle];
    return {
      maladie: -m[cle], guerison: m[cle], mort: m.provenance === 'sains' ? -m[cle] : 0, sexage, vente: -m[cle],
    }[m.type] ?? 0;
  };
  const groupe = (cle, depart) => {
    const sains = depart + somme((m) => effet(m, cle, 'sains'));
    const malades = somme((m) => effet(m, cle, 'malades'));
    const morts = somme((m) => (m.type === 'mort' ? m[cle] : 0));
    const vendus = somme((m) => (m.type === 'vente' ? m[cle] : 0));
    return {
      sains, malades, morts, vendus, vivants: sains + malades,
    };
  };
  const males = groupe('males', 0);
  const femelles = groupe('femelles', 0);
  const nonSexes = groupe('nonSexes', b.nombrePoussins);
  const morts = males.morts + femelles.morts + nonSexes.morts;
  const vendus = males.vendus + femelles.vendus + nonSexes.vendus;
  const tot = {
    recus: b.nombrePoussins,
    sains: males.sains + femelles.sains + nonSexes.sains,
    malades: males.malades + femelles.malades + nonSexes.malades,
    morts,
    vendus,
    vivants: b.nombrePoussins - morts - vendus,
    tauxMortalite: Math.round((morts / b.nombrePoussins) * 10000) / 100,
  };
  return {
    ...b,
    prixParPoussin: b.prixPoussins == null ? null : Math.round((b.prixPoussins / b.nombrePoussins) * 100) / 100,
    dateFin,
    statut,
    ageJours,
    effectifActuel: tot.vivants,
    sante: {
      males, femelles, nonSexes, total: tot,
    },
  };
}

// --- Simulated health declarations ------------------------------------------------
const lireMouvements = () => JSON.parse(sessionStorage.getItem('mock-mouvements') ?? '[]');
const ecrireMouvements = (l) => sessionStorage.setItem('mock-mouvements', JSON.stringify(l));
const etatVolaille = (id) => ({
  bande: calculer(trouverBande(id)),
  mouvements: lireMouvements().filter((m) => m.bandeId === Number(id))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
});

function validerBandeMock(c, idIgnore) {
  const champs = {};
  if (!c.nom?.trim()) champs.nom = 'Le nom est obligatoire.';
  else if (lireBandes().some((b) => b.id !== idIgnore && b.nom.toLowerCase() === c.nom.trim().toLowerCase())) {
    champs.nom = 'Une bande porte déjà ce nom.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.dateDebut ?? '')) champs.dateDebut = 'La date de début est obligatoire (format jj/mm/aaaa).';
  if (!Number.isInteger(c.dureeMois) || c.dureeMois < 1 || c.dureeMois > 12) champs.dureeMois = 'La durée doit être entre 1 et 12.';
  if (!Number.isInteger(c.nombrePoussins) || c.nombrePoussins < 1) champs.nombrePoussins = 'Le nombre de poussins doit être entre 1 et 1000000.';
  if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
  if (c.prixPoussins == null) champs.prixPoussins = 'Le prix total des poussins est obligatoire.';
  if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
  return {
    nom: c.nom.trim(), dateDebut: c.dateDebut, dureeMois: c.dureeMois, nombrePoussins: c.nombrePoussins, prixPoussins: c.prixPoussins,
  };
}

function trouverBande(id) {
  const b = lireBandes().find((x) => x.id === Number(id));
  if (!b) throw new ErreurApi(404, 'INTROUVABLE', 'Cette bande n’existe pas ou a été supprimée.');
  return b;
}

// --- Simulated growth guide (same rules as server/modules/croissance/calcul.js) ---------
const lireCroissance = () => JSON.parse(sessionStorage.getItem('mock-croissance') ?? '{}');
const ecrireCroissance = (o) => sessionStorage.setItem('mock-croissance', JSON.stringify(o));
const plusJours = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const ecartMock = (g, o) => (g == null || o == null ? null : {
  valeur: Math.round((o - g) * 10) / 10, pourcent: Math.round(((o - g) / g) * 1000) / 10, positif: o >= g,
});
function etatCroissance(id) {
  const bande = calculer(trouverBande(id));
  const c = lireCroissance()[id];
  if (!c) return { bande, config: null, points: [] };
  const p = c.periodeJours;
  const n = Math.max(1, Math.floor((Date.parse(bande.dateFin) - Date.parse(bande.dateDebut)) / 864e5 / p), ...Object.keys(c.valeurs).map(Number));
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const points = Array.from({ length: n }, (_, i) => {
    const rang = i + 1; const v = c.valeurs[rang] ?? {};
    const pt = {
      rang, libelle: p === 7 ? `Semaine ${rang}` : p === 1 ? `Jour ${rang}` : `Contrôle ${rang}`,
      jourApresArrivee: rang * p, date: plusJours(bande.dateDebut, rang * p),
      guideMales: v.guideMales ?? null, observeMales: v.observeMales ?? null,
      guideFemelles: v.guideFemelles ?? null, observeFemelles: v.observeFemelles ?? null,
    };
    pt.ecartMales = ecartMock(pt.guideMales, pt.observeMales);
    pt.ecartFemelles = ecartMock(pt.guideFemelles, pt.observeFemelles);
    pt.passe = pt.date <= aujourdhui;
    return pt;
  });
  const actuel = points.filter((x) => x.passe).at(-1);
  if (actuel) actuel.actuel = true;
  return { bande, config: { periodeJours: p }, points };
}

// --- Simulated sales (same rules as server/modules/ventes/service.js) --------------------
const lireVentesMock = () => JSON.parse(sessionStorage.getItem('mock-ventes') ?? '[]');
const ecrireVentesMock = (l) => sessionStorage.setItem('mock-ventes', JSON.stringify(l));
const arr = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
function venteJson(v) {
  const oiseaux = v.males + v.femelles + v.nonSexes;
  return {
    ...v,
    oiseaux,
    poidsMoyenKg: arr(v.poidsTotalKg / oiseaux, 3),
    prixParOiseau: arr(v.prixTotal / oiseaux),
    prixParKg: arr(v.prixTotal / v.poidsTotalKg),
  };
}
function etatVentes(id) {
  const bande = calculer(trouverBande(id));
  const ventes = lireVentesMock().filter((v) => v.bandeId === Number(id)).map(venteJson)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const oiseaux = ventes.reduce((t, v) => t + v.oiseaux, 0);
  const poidsKg = arr(ventes.reduce((t, v) => t + v.poidsTotalKg, 0), 3);
  const total = arr(ventes.reduce((t, v) => t + v.prixTotal, 0));
  const { coutTotal } = etatCharges(id).resume;
  return {
    bande,
    ventes,
    resume: {
      nombre: ventes.length, oiseaux, poidsKg, total,
      poidsMoyenKg: oiseaux ? arr(poidsKg / oiseaux, 3) : 0,
      prixMoyenKg: poidsKg ? arr(total / poidsKg) : 0,
      prixMoyenOiseau: oiseaux ? arr(total / oiseaux) : 0,
      coutTotal,
      resultat: arr(total - coutTotal),
    },
  };
}
function validerVenteMock(c, bande, ancienne = null) {
  const champs = {};
  const nb = (x) => (x === '' || x == null ? 0 : Number(x));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date ?? '')) champs.date = 'La date est obligatoire (format jj/mm/aaaa).';
  else if (c.date < bande.dateDebut) champs.date = 'La date ne peut pas être avant le début de la bande.';
  if (!c.client?.trim()) champs.client = 'Le nom du client est obligatoire.';
  if (!['particulier', 'societe'].includes(c.typeClient)) champs.typeClient = 'Choisissez : particulier ou société.';
  const v = { males: nb(c.males), femelles: nb(c.femelles), nonSexes: nb(c.nonSexes) };
  if (v.males + v.femelles + v.nonSexes === 0) champs.males = 'Indiquez au moins un oiseau vendu (mâle, femelle ou non sexé).';
  if (!(c.poidsTotalKg > 0)) champs.poidsTotalKg = 'Le poids total est obligatoire.';
  if (c.prixTotal == null) champs.prixTotal = 'Le prix total est obligatoire.';
  if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
  const libelles = { males: 'de mâles', femelles: 'de femelles', nonSexes: 'd’oiseaux non sexés' };
  for (const k of ['males', 'femelles', 'nonSexes']) {
    const dispo = bande.sante[k].sains + (ancienne?.[k] ?? 0);
    if (v[k] > dispo) throw new ErreurApi(409, 'CONFLIT', `Pas assez ${libelles[k]} en bonne santé : il en manquerait ${v[k] - dispo}.`);
  }
  return {
    date: c.date, client: c.client.trim(), typeClient: c.typeClient, ...v,
    poidsTotalKg: c.poidsTotalKg, prixTotal: c.prixTotal, description: c.description?.trim() || null,
  };
}

// --- Simulated charges ------------------------------------------------------------------
const lireChargesMock = () => JSON.parse(sessionStorage.getItem('mock-charges') ?? '[]');
const ecrireChargesMock = (l) => sessionStorage.setItem('mock-charges', JSON.stringify(l));
// --- Simulated cars (same rules as server/modules/vehicules) ---------------------------------
const lireVehiculesMock = () => JSON.parse(sessionStorage.getItem('mock-vehicules') ?? '[]');
const ecrireVehiculesMock = (l) => sessionStorage.setItem('mock-vehicules', JSON.stringify(l));
const DOCUMENTS_MOCK = {
  visite: { libelle: 'Visite technique', dureeMois: 12 },
  vignette: { libelle: 'Vignette', dureeMois: 12 },
  assurance: { libelle: 'Assurance', dureeMois: 12 },
  carte_grise: { libelle: 'Carte grise', dureeMois: 120 },
};
function ajouterMoisMock(iso, mois) {
  const [a, m, j] = iso.split('-').map(Number);
  const fin = new Date(Date.UTC(a, m - 1 + mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + mois, Math.min(j, fin))).toISOString().slice(0, 10);
}
function chargeVehiculeMock(c) {
  const x = { categorie: 'charge', ...c };
  if (x.categorie === 'vidange') x.prochaineKm = x.kilometrage + x.intervalleKm;
  if (DOCUMENTS_MOCK[x.categorie]) {
    x.expireLe = ajouterMoisMock(x.date, x.dureeMois);
    x.joursRestants = Math.round((Date.parse(x.expireLe) - Date.parse(aujourdhuiMock())) / 864e5);
    x.statut = x.joursRestants < 0 ? 'expire' : x.joursRestants <= 30 ? 'bientot' : 'valide';
  }
  return x;
}
function etatVehicules(id) {
  const vehicules = lireVehiculesMock().filter((v) => v.bandeId === Number(id))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id - b.id)
    .map((v) => {
      const charges = v.charges.map(chargeVehiculeMock).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      const recent = (cat) => charges.find((c) => c.categorie === cat) ?? null;
      const vid = recent('vidange');
      const documents = Object.fromEntries(Object.keys(DOCUMENTS_MOCK).map((cat) => [cat, recent(cat)]));
      return {
        ...v,
        charges,
        nombreCharges: charges.length,
        totalCharges: arr(charges.reduce((t, c) => t + c.montant, 0)),
        vidange: vid && { date: vid.date, kilometrage: vid.kilometrage, intervalleKm: vid.intervalleKm, prochaineKm: vid.prochaineKm },
        documents,
        alertes: Object.entries(documents).filter(([, d]) => d && d.statut !== 'valide').map(([cat, d]) => ({
          document: cat, libelle: DOCUMENTS_MOCK[cat].libelle, statut: d.statut, expireLe: d.expireLe, joursRestants: d.joursRestants,
        })),
      };
    });
  return {
    bande: calculer(trouverBande(id)),
    vehicules,
    resume: {
      nombre: vehicules.length,
      nombreCharges: vehicules.reduce((t, v) => t + v.nombreCharges, 0),
      total: arr(vehicules.reduce((t, v) => t + v.totalCharges, 0)),
    },
  };
}
function exigerMotDePasseMock(corps) {
  if (corps.motDePasse !== MOCK_MOT_DE_PASSE) {
    throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { motDePasse: corps.motDePasse ? 'Mot de passe incorrect.' : 'Saisissez votre mot de passe pour confirmer.' });
  }
}

// --- Simulated construction charges (server/modules/construction) -----------------------------
const lireConstructionMock = () => JSON.parse(sessionStorage.getItem('mock-construction') ?? '[]');
function etatConstruction() {
  const charges = lireConstructionMock().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const somme = (l) => arr(l.reduce((t, c) => t + c.montantTotal, 0));
  const grosses = charges.filter((c) => c.type === 'grosse');
  const petites = charges.filter((c) => c.type === 'petite');
  return {
    charges,
    resume: {
      nombre: charges.length, total: somme(charges),
      grosses: { nombre: grosses.length, total: somme(grosses) },
      petites: { nombre: petites.length, total: somme(petites) },
    },
  };
}

function etatCharges(id) {
  const bande = calculer(trouverBande(id));
  const charges = lireChargesMock().filter((c) => c.bandeId === Number(id))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const avecPrix = charges.filter((c) => c.prixTotal != null);
  const total = avecPrix.reduce((t, c) => t + c.prixTotal, 0);
  const parType = new Map();
  for (const c of charges) {
    const k = c.typeProduit.toLowerCase();
    if (!parType.has(k)) parType.set(k, { type: c.typeProduit, nombre: 0, total: 0, sansPrix: 0 });
    const t = parType.get(k); t.nombre += 1;
    if (c.prixTotal == null) t.sansPrix += 1; else t.total += c.prixTotal;
  }
  return {
    bande,
    charges,
    resume: {
      total, nombre: charges.length, sansPrix: charges.length - avecPrix.length,
      prixPoussins: bande.prixPoussins ?? null,
      employes: resumeEmployesMock(id),
      vehicules: etatVehicules(id).resume,
      coutTotal: arr(total + (bande.prixPoussins ?? 0) + resumeEmployesMock(id).cout + etatVehicules(id).resume.total),
      coutParPoussin: arr((total + (bande.prixPoussins ?? 0) + resumeEmployesMock(id).cout + etatVehicules(id).resume.total) / bande.nombrePoussins),
      parType: [...parType.values()].sort((x, y) => y.total - x.total),
    },
  };
}
function validerChargeMock(c) {
  const champs = {};
  for (const [k, l] of [['vendeur', 'Le vendeur'], ['typeProduit', 'Le type de produit'], ['produit', 'Le produit ou service']]) {
    if (!c[k]?.trim()) champs[k] = `${l} est obligatoire.`;
  }
  if (!c.date) champs.date = 'La date est obligatoire (format jj/mm/aaaa).';
  if (c.unite?.trim() && c.quantite == null) champs.quantite = 'Indiquez la quantité pour cette unité.';
  if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
  const t = (x) => x?.trim().replace(/\s+/g, ' ') || null;
  return {
    date: c.date, vendeur: t(c.vendeur), typeProduit: t(c.typeProduit), produit: t(c.produit),
    quantite: c.quantite ?? null, unite: t(c.unite), prixTotal: c.prixTotal ?? null, description: t(c.description),
  };
}
function distinctsMock(valeurs) {
  const vus = new Map();
  for (const v of valeurs) if (v && !vus.has(v.toLowerCase())) vus.set(v.toLowerCase(), v);
  return [...vus.values()];
}

// --- Simulated workers (same rules as server/modules/employes) -------------------------------
const lireEmployesMock = () => JSON.parse(sessionStorage.getItem('mock-employes') ?? '[]');
const ecrireEmployesMock = (l) => sessionStorage.setItem('mock-employes', JSON.stringify(l));
const aujourdhuiMock = () => new Date().toISOString().slice(0, 10);
function employesDe(id) {
  return lireEmployesMock().filter((e) => e.bandeId === Number(id))
    .map((e) => ({ ...e, avances: e.avances ?? [] }))
    .map((e) => ({ ...e, actif: !e.dateDepart, compte: compteMock(e, e.joursRepos.map((j) => j.date), e.avances, aujourdhuiMock()) }))
    .sort((a, b) => Number(!a.actif) - Number(!b.actif) || a.nom.localeCompare(b.nom, 'fr'));
}
function resumeEmployesMock(id) {
  const l = employesDe(id);
  const somme = (f) => Math.round(l.reduce((t, e) => t + f(e), 0) * 100) / 100;
  return {
    nombreActifs: l.filter((e) => e.actif).length,
    nombrePartis: l.filter((e) => !e.actif).length,
    totalAvances: somme((e) => e.compte.totalAvances),
    nombreAvances: l.reduce((t, e) => t + e.compte.nombreAvances, 0),
    cout: somme((e) => e.compte.cout),
    soldeActifs: somme((e) => (e.actif ? e.compte.solde : 0)),
  };
}
const etatEmployes = (id) => ({ bande: calculer(trouverBande(id)), employes: employesDe(id), resume: resumeEmployesMock(id) });
function validerEmployeMock(c, idIgnore, bandeId) {
  const champs = {};
  if (!c.nom?.trim()) champs.nom = 'Le nom complet est obligatoire.';
  if (!Number.isInteger(c.age) || c.age < 15 || c.age > 90) champs.age = 'L’âge doit être entre 15 et 90.';
  const cin = (c.cin ?? '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{1,2}\d{1,8}$/.test(cin)) champs.cin = 'Le CIN doit être 1 ou 2 lettres suivies de chiffres (ex. AB123456).';
  else if (lireEmployesMock().some((e) => e.bandeId === Number(bandeId) && !e.dateDepart && e.id !== idIgnore && e.cin === cin)) {
    champs.cin = 'Un employé actuel a déjà ce numéro de CIN.';
  }
  if (!c.dateDebut) champs.dateDebut = 'La date de début est obligatoire (format jj/mm/aaaa).';
  if (c.salaireJournalier == null) champs.salaireJournalier = 'Le salaire journalier est obligatoire.';
  if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
  return {
    nom: c.nom.trim().replace(/\s+/g, ' '), age: c.age, cin, dateDebut: c.dateDebut, salaireJournalier: c.salaireJournalier,
  };
}
function majEmployeMock(eid, f) {
  const l = lireEmployesMock();
  const e = l.find((x) => x.id === Number(eid));
  if (!e) throw new ErreurApi(404, 'INTROUVABLE', 'Cet employé n’existe pas.');
  f(e);
  ecrireEmployesMock(l);
}

const routes = [
  {
    methode: 'GET',
    motif: /^\/construction$/,
    reponse: () => { exigerConnexion(); return etatConstruction(); },
  },
  {
    methode: 'POST',
    motif: /^\/construction\/charges$/,
    reponse: ({ corps }) => {
      exigerConnexion();
      const petite = corps.type === 'petite';
      const champs = {};
      if (!corps.nom?.trim()) champs.nom = 'Le nom de la charge est obligatoire.';
      if (!corps.date) champs.date = 'La date est obligatoire (format jj/mm/aaaa).';
      if (petite && !(corps.quantite > 0)) champs.quantite = corps.quantite == null ? 'La quantité est obligatoire.' : 'La quantité doit être supérieure à 0.';
      if (!petite && !String(corps.quantite ?? '').trim()) champs.quantite = 'La quantité est obligatoire.';
      if (petite && !corps.unite?.trim()) champs.unite = 'L’unité est obligatoire.';
      if (petite && !(corps.prixUnitaire > 0)) champs.prixUnitaire = corps.prixUnitaire == null ? 'Le prix est obligatoire.' : 'Le prix doit être supérieur à 0.';
      if (!petite && !(corps.montantTotal > 0)) champs.montantTotal = corps.montantTotal == null ? 'Le montant total est obligatoire.' : 'Le montant total doit être supérieur à 0.';
      if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
      const l = lireConstructionMock();
      const charge = {
        id: (l.at(-1)?.id ?? 0) + 1, type: corps.type, date: corps.date, nom: corps.nom.trim(),
        unite: petite ? corps.unite.trim() : null,
        quantite: petite ? corps.quantite : null, quantiteTexte: petite ? null : String(corps.quantite).trim(),
        prixUnitaire: petite ? corps.prixUnitaire : null,
        montantTotal: petite
          ? Math.round((Math.round(corps.quantite * 1000) * Math.round(corps.prixUnitaire * 100)) / 1000) / 100
          : corps.montantTotal,
        description: corps.description?.trim() || null, creeLe: new Date().toISOString(),
      };
      l.push(charge);
      sessionStorage.setItem('mock-construction', JSON.stringify(l));
      return { ...etatConstruction(), charge };
    },
  },
  {
    methode: 'PUT',
    motif: /^\/construction\/charges\/(\d+)$/,
    reponse: ({ params: [cid], corps }) => {
      exigerConnexion();
      const l = lireConstructionMock();
      const ancienne = l.find((c) => c.id === Number(cid));
      if (!ancienne) throw new ErreurApi(404, 'INTROUVABLE', 'Cette charge n’existe pas ou a été supprimée.');
      const petite = ancienne.type === 'petite';
      const champs = {};
      if (!corps.nom?.trim()) champs.nom = 'Le nom de la charge est obligatoire.';
      if (petite && !(corps.quantite > 0)) champs.quantite = 'La quantité doit être supérieure à 0.';
      if (!petite && !String(corps.quantite ?? '').trim()) champs.quantite = 'La quantité est obligatoire.';
      if (petite && !corps.unite?.trim()) champs.unite = 'L’unité est obligatoire.';
      if (petite && !(corps.prixUnitaire > 0)) champs.prixUnitaire = 'Le prix est obligatoire.';
      if (!petite && !(corps.montantTotal > 0)) champs.montantTotal = 'Le montant total est obligatoire.';
      if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
      Object.assign(ancienne, {
        date: corps.date, nom: corps.nom.trim(), description: corps.description?.trim() || null,
        ...(petite ? {
          unite: corps.unite.trim(), quantite: corps.quantite, prixUnitaire: corps.prixUnitaire,
          montantTotal: Math.round((Math.round(corps.quantite * 1000) * Math.round(corps.prixUnitaire * 100)) / 1000) / 100,
        } : { quantiteTexte: String(corps.quantite).trim(), montantTotal: corps.montantTotal }),
      });
      sessionStorage.setItem('mock-construction', JSON.stringify(l));
      return { ...etatConstruction(), charge: ancienne };
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/construction\/charges\/(\d+)$/,
    reponse: ({ params: [cid], corps }) => {
      exigerConnexion();
      exigerMotDePasseMock(corps);
      sessionStorage.setItem('mock-construction', JSON.stringify(lireConstructionMock().filter((c) => c.id !== Number(cid))));
      return etatConstruction();
    },
  },
  {
    methode: 'GET',
    motif: /^\/bandes\/(\d+)\/vehicules$/,
    reponse: ({ params: [id] }) => { exigerConnexion(); return etatVehicules(id); },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/vehicules$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      const champs = {};
      if (!corps.nom?.trim()) champs.nom = 'Le nom du véhicule est obligatoire.';
      if (!corps.modele?.trim()) champs.modele = 'Le modèle est obligatoire.';
      if (!corps.matricule?.trim()) champs.matricule = 'Le matricule est obligatoire.';
      if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
      const l = lireVehiculesMock();
      const cle = (m) => m.replace(/[\s|/-]/g, '').toUpperCase();
      if (l.some((v) => v.bandeId === Number(id) && cle(v.matricule) === cle(corps.matricule))) {
        throw new ErreurApi(409, 'CONFLIT', 'Un véhicule de cette bande a déjà ce matricule.', { matricule: 'Un véhicule de cette bande a déjà ce matricule.' });
      }
      l.push({
        id: (l.at(-1)?.id ?? 0) + 1, bandeId: Number(id), nom: corps.nom.trim(), modele: corps.modele.trim(),
        matricule: corps.matricule.trim().replace(/\s+/g, ' ').toUpperCase(), creeLe: new Date().toISOString(), charges: [],
      });
      ecrireVehiculesMock(l);
      return etatVehicules(id);
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/bandes\/(\d+)\/vehicules\/(\d+)$/,
    reponse: ({ params: [id, vid], corps }) => {
      exigerConnexion();
      exigerMotDePasseMock(corps);
      ecrireVehiculesMock(lireVehiculesMock().filter((v) => v.id !== Number(vid)));
      return etatVehicules(id);
    },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/vehicules\/(\d+)\/charges$/,
    reponse: ({ params: [id, vid], corps }) => {
      exigerConnexion();
      const champs = {};
      if (!corps.libelle?.trim()) champs.libelle = 'Le nom de la charge est obligatoire.';
      if (!corps.date) champs.date = 'La date est obligatoire (format jj/mm/aaaa).';
      if (corps.montant == null) champs.montant = 'Le montant est obligatoire.';
      else if (!(corps.montant > 0)) champs.montant = 'Le montant doit être supérieur à 0.';
      if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
      const l = lireVehiculesMock();
      const v = l.find((x) => x.id === Number(vid));
      if (!v) throw new ErreurApi(404, 'INTROUVABLE', 'Ce véhicule n’existe pas ou a été supprimé.');
      if (corps.vidange) {
        if (!Number.isInteger(corps.kilometrage)) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { kilometrage: 'Le kilométrage actuel est obligatoire.' });
        if (!(corps.intervalleKm > 0)) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { intervalleKm: 'La distance avant la prochaine vidange doit être supérieure à 0.' });
      }
      const charge = {
        id: Math.max(0, ...l.flatMap((x) => x.charges.map((c) => c.id))) + 1,
        categorie: corps.vidange ? 'vidange' : 'charge',
        libelle: corps.libelle.trim(), date: corps.date, montant: corps.montant,
        description: corps.description?.trim() || null, creeLe: new Date().toISOString(),
        ...(corps.vidange ? { kilometrage: corps.kilometrage, intervalleKm: corps.intervalleKm ?? 10000 } : {}),
      };
      v.charges.push(charge);
      ecrireVehiculesMock(l);
      return { ...etatVehicules(id), charge: chargeVehiculeMock(charge) };
    },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/vehicules\/(\d+)\/documents$/,
    reponse: ({ params: [id, vid], corps }) => {
      exigerConnexion();
      const doc = DOCUMENTS_MOCK[corps.document];
      const champs = {};
      if (!doc) champs.document = 'Choisissez le document.';
      if (!corps.date) champs.date = 'La date est obligatoire (format jj/mm/aaaa).';
      if (corps.montant == null || corps.montant < 0) champs.montant = 'Le montant est obligatoire.';
      if (!(Number.isInteger(corps.dureeMois) && corps.dureeMois > 0)) champs.dureeMois = 'La durée doit être un nombre entier.';
      if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
      const l = lireVehiculesMock();
      const v = l.find((x) => x.id === Number(vid));
      const charge = {
        id: Math.max(0, ...l.flatMap((x) => x.charges.map((c) => c.id))) + 1,
        categorie: corps.document, libelle: doc.libelle, date: corps.date, montant: corps.montant, dureeMois: corps.dureeMois,
        description: corps.description?.trim() || null, creeLe: new Date().toISOString(),
      };
      v.charges.push(charge);
      ecrireVehiculesMock(l);
      return { ...etatVehicules(id), charge: chargeVehiculeMock(charge) };
    },
  },
  {
    methode: 'PUT',
    motif: /^\/bandes\/(\d+)\/vehicules\/(\d+)\/charges\/(\d+)$/,
    reponse: ({ params: [id, vid, cid], corps }) => {
      exigerConnexion();
      const l = lireVehiculesMock();
      const v = l.find((x) => x.id === Number(vid));
      const c = v?.charges.find((x) => x.id === Number(cid));
      if (!c) throw new ErreurApi(404, 'INTROUVABLE', 'Cette charge n’existe pas ou a été supprimée.');
      const doc = DOCUMENTS_MOCK[c.categorie];
      const champs = {};
      if (!corps.date) champs.date = 'La date est obligatoire (format jj/mm/aaaa).';
      if (corps.montant == null || corps.montant < 0 || (!doc && corps.montant === 0)) champs.montant = 'Le montant est obligatoire.';
      if (!doc && !corps.libelle?.trim()) champs.libelle = 'Le nom de la charge est obligatoire.';
      if (!doc && corps.vidange && !Number.isInteger(corps.kilometrage)) champs.kilometrage = 'Le kilométrage actuel est obligatoire.';
      if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
      Object.assign(c, { date: corps.date, montant: corps.montant, description: corps.description?.trim() || null });
      if (doc) c.dureeMois = corps.dureeMois;
      else {
        c.libelle = corps.libelle.trim();
        c.categorie = corps.vidange ? 'vidange' : 'charge';
        if (corps.vidange) Object.assign(c, { kilometrage: corps.kilometrage, intervalleKm: corps.intervalleKm ?? 10000 });
        else { delete c.kilometrage; delete c.intervalleKm; }
      }
      ecrireVehiculesMock(l);
      return { ...etatVehicules(id), charge: chargeVehiculeMock(c) };
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/bandes\/(\d+)\/vehicules\/(\d+)\/charges\/(\d+)$/,
    reponse: ({ params: [id, vid, cid], corps }) => {
      exigerConnexion();
      exigerMotDePasseMock(corps);
      const l = lireVehiculesMock();
      const v = l.find((x) => x.id === Number(vid));
      if (v) v.charges = v.charges.filter((c) => c.id !== Number(cid));
      ecrireVehiculesMock(l);
      return etatVehicules(id);
    },
  },
  {
    methode: 'GET',
    motif: /^\/ventes\/clients$/,
    reponse: () => {
      exigerConnexion();
      const vus = new Map();
      for (const v of lireVentesMock()) {
        const k = v.client.toLowerCase();
        vus.set(k, { client: vus.get(k)?.client ?? v.client, typeClient: v.typeClient });
      }
      return [...vus.values()];
    },
  },
  {
    methode: 'GET',
    motif: /^\/bandes\/(\d+)\/ventes$/,
    reponse: ({ params: [id] }) => { exigerConnexion(); return etatVentes(id); },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/ventes$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      const v = validerVenteMock(corps, calculer(trouverBande(id)));
      const l = lireVentesMock();
      const deja = l.find((x) => x.client.toLowerCase() === v.client.toLowerCase());
      if (deja) v.client = deja.client;
      const annee = v.date.slice(0, 4);
      const dernier = Math.max(0, ...l.filter((x) => x.numero.startsWith(`V${annee}-`)).map((x) => Number(x.numero.slice(6))));
      const nouvelle = {
        id: (l.at(-1)?.id ?? 0) + 1, numero: `V${annee}-${String(dernier + 1).padStart(4, '0')}`, bandeId: Number(id), ...v,
        creeLe: new Date().toISOString(), modifieLe: null,
      };
      l.push(nouvelle);
      ecrireVentesMock(l);
      return { ...etatVentes(id), vente: venteJson(nouvelle) };
    },
  },
  {
    methode: 'PUT',
    motif: /^\/bandes\/(\d+)\/ventes\/(\d+)$/,
    reponse: ({ params: [id, vid], corps }) => {
      exigerConnexion();
      const l = lireVentesMock();
      const ancienne = l.find((x) => x.id === Number(vid));
      if (!ancienne) throw new ErreurApi(404, 'INTROUVABLE', 'Cette vente n’existe pas ou a été supprimée.');
      const v = validerVenteMock(corps, calculer(trouverBande(id)), ancienne);
      const maj = { ...ancienne, ...v, modifieLe: new Date().toISOString() };
      ecrireVentesMock(l.map((x) => (x.id === maj.id ? maj : x)));
      return { ...etatVentes(id), vente: venteJson(maj) };
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/bandes\/(\d+)\/ventes\/(\d+)$/,
    reponse: ({ params: [id, vid], corps }) => {
      exigerConnexion();
      if (corps.motDePasse !== MOCK_MOT_DE_PASSE) {
        throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { motDePasse: 'Mot de passe incorrect.' });
      }
      ecrireVentesMock(lireVentesMock().filter((x) => x.id !== Number(vid)));
      return etatVentes(id);
    },
  },
  {
    // The simulation keeps no history: the real server records every operation.
    methode: 'GET',
    motif: /^\/historique(\?.*)?$/,
    reponse: () => { exigerConnexion(); return { total: 0, limite: 100, decalage: 0, entrees: [] }; },
  },
  {
    methode: 'GET',
    motif: /^\/bandes\/(\d+)\/employes$/,
    reponse: ({ params: [id] }) => { exigerConnexion(); return etatEmployes(id); },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/employes$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      const v = validerEmployeMock(corps, null, id);
      const l = lireEmployesMock();
      l.push({ id: (l.at(-1)?.id ?? 0) + 1, bandeId: Number(id), ...v, dateDepart: null, joursRepos: [] });
      ecrireEmployesMock(l);
      return etatEmployes(id);
    },
  },
  {
    methode: 'PUT',
    motif: /^\/bandes\/(\d+)\/employes\/(\d+)$/,
    reponse: ({ params: [id, eid], corps }) => {
      exigerConnexion();
      const v = validerEmployeMock(corps, Number(eid), id);
      majEmployeMock(eid, (e) => Object.assign(e, v));
      return etatEmployes(id);
    },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/employes\/(\d+)\/repos$/,
    reponse: ({ params: [id, eid], corps }) => {
      exigerConnexion();
      majEmployeMock(eid, (e) => {
        if (!corps.date) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { date: 'La date est obligatoire (format jj/mm/aaaa).' });
        if (e.joursRepos.some((j) => j.date === corps.date)) {
          throw new ErreurApi(409, 'CONFLIT', 'Un jour de repos est déjà déclaré à cette date.', { date: `Déjà déclaré le ${corps.date.split('-').reverse().join('/')}.` });
        }
        e.joursRepos.push({ date: corps.date, note: corps.note?.trim() || null });
        e.joursRepos.sort((a, b) => a.date.localeCompare(b.date));
      });
      return etatEmployes(id);
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/bandes\/(\d+)\/employes\/(\d+)\/repos\/([\d-]+)$/,
    reponse: ({ params: [id, eid, jour] }) => {
      exigerConnexion();
      majEmployeMock(eid, (e) => { e.joursRepos = e.joursRepos.filter((j) => j.date !== jour); });
      return etatEmployes(id);
    },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/employes\/(\d+)\/avances$/,
    reponse: ({ params: [id, eid], corps }) => {
      exigerConnexion();
      let avance;
      majEmployeMock(eid, (e) => {
        const champs = {};
        if (!(corps.montant > 0)) champs.montant = corps.montant == null ? 'Le montant est obligatoire.' : 'Le montant doit être supérieur à 0.';
        if (!corps.date) champs.date = 'La date est obligatoire (format jj/mm/aaaa).';
        else if (corps.date < e.dateDebut) champs.date = 'La date ne peut pas être avant son début.';
        if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
        e.avances = e.avances ?? [];
        avance = {
          id: Math.max(0, ...lireEmployesMock().flatMap((x) => (x.avances ?? []).map((a) => a.id))) + 1,
          date: corps.date, montant: corps.montant, note: corps.note?.trim() || null, creeLe: new Date().toISOString(),
        };
        e.avances.push(avance);
        e.avances.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      });
      return { ...etatEmployes(id), avance };
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/bandes\/(\d+)\/employes\/(\d+)\/avances\/(\d+)$/,
    reponse: ({ params: [id, eid, aid], corps }) => {
      exigerConnexion();
      if (corps.motDePasse !== MOCK_MOT_DE_PASSE) {
        throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { motDePasse: corps.motDePasse ? 'Mot de passe incorrect.' : 'Saisissez votre mot de passe pour confirmer.' });
      }
      majEmployeMock(eid, (e) => { e.avances = (e.avances ?? []).filter((a) => a.id !== Number(aid)); });
      return etatEmployes(id);
    },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/employes\/(\d+)\/depart$/,
    reponse: ({ params: [id, eid], corps }) => {
      exigerConnexion();
      if (corps.motDePasse !== MOCK_MOT_DE_PASSE) {
        throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { motDePasse: corps.motDePasse ? 'Mot de passe incorrect.' : 'Saisissez votre mot de passe pour confirmer.' });
      }
      majEmployeMock(eid, (e) => { e.dateDepart = corps.dateDepart; });
      const etatApres = etatEmployes(id);
      return { ...etatApres, depart: etatApres.employes.find((e) => e.id === Number(eid)) };
    },
  },
  {
    methode: 'GET',
    motif: /^\/charges\/suggestions(\?.*)?$/,
    reponse: ({ params: [qs] }) => {
      exigerConnexion();
      const vendeur = (new URLSearchParams(qs ?? '').get('vendeur') ?? '').trim().toLowerCase();
      const toutes = lireChargesMock().reverse();
      const duVendeur = vendeur ? toutes.filter((c) => c.vendeur.toLowerCase() === vendeur) : toutes;
      return {
        vendeurs: distinctsMock(toutes.map((c) => c.vendeur)),
        types: distinctsMock([...duVendeur, ...toutes].map((c) => c.typeProduit)),
        produits: distinctsMock(duVendeur.map((c) => c.produit)).map((produit) => {
          const c = duVendeur.find((x) => x.produit === produit);
          return { produit, typeProduit: c.typeProduit, unite: c.unite };
        }),
        unites: distinctsMock(toutes.map((c) => c.unite)),
      };
    },
  },
  {
    methode: 'GET',
    motif: /^\/bandes\/(\d+)\/charges$/,
    reponse: ({ params: [id] }) => { exigerConnexion(); return etatCharges(id); },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/charges$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      const v = validerChargeMock(corps);
      const l = lireChargesMock();
      // Same as the server: reuse the spelling already on file.
      for (const k of ['vendeur', 'typeProduit', 'produit', 'unite']) {
        const deja = v[k] && l.find((c) => c[k]?.toLowerCase() === v[k].toLowerCase());
        if (deja) v[k] = deja[k];
      }
      l.push({ id: (l.at(-1)?.id ?? 0) + 1, bandeId: Number(id), ...v, creeLe: new Date().toISOString(), modifieLe: null });
      ecrireChargesMock(l);
      return etatCharges(id);
    },
  },
  {
    methode: 'PUT',
    motif: /^\/bandes\/(\d+)\/charges\/(\d+)$/,
    reponse: ({ params: [id, cid], corps }) => {
      exigerConnexion();
      const v = validerChargeMock(corps);
      ecrireChargesMock(lireChargesMock().map((c) => (c.id === Number(cid) ? { ...c, ...v, modifieLe: new Date().toISOString() } : c)));
      return etatCharges(id);
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/bandes\/(\d+)\/charges\/(\d+)$/,
    reponse: ({ params: [id, cid], corps }) => {
      exigerConnexion();
      if (corps.motDePasse !== MOCK_MOT_DE_PASSE) {
        throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { motDePasse: 'Mot de passe incorrect.' });
      }
      ecrireChargesMock(lireChargesMock().filter((c) => c.id !== Number(cid)));
      return etatCharges(id);
    },
  },
  {
    methode: 'GET',
    motif: /^\/bandes\/(\d+)\/croissance$/,
    reponse: ({ params: [id] }) => { exigerConnexion(); return etatCroissance(id); },
  },
  {
    methode: 'PUT',
    motif: /^\/bandes\/(\d+)\/croissance\/config$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      const tout = lireCroissance();
      const avant = tout[id];
      const n = avant ? Object.keys(avant.valeurs).length : 0;
      if (avant && avant.periodeJours !== corps.periodeJours && n && !corps.confirmerEffacement) {
        throw new ErreurApi(409, 'CONFLIT', `Changer la fréquence effacera ${n > 1 ? `les ${n} contrôles déjà saisis` : 'le contrôle déjà saisi'}. Confirmez pour continuer.`, { confirmationRequise: true, nombreControles: n });
      }
      const garder = avant && avant.periodeJours === corps.periodeJours;
      tout[id] = { periodeJours: corps.periodeJours, valeurs: garder ? avant.valeurs : {} };
      ecrireCroissance(tout);
      return etatCroissance(id);
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/bandes\/(\d+)\/croissance$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      if (corps.motDePasse !== MOCK_MOT_DE_PASSE) {
        throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { motDePasse: 'Mot de passe incorrect.' });
      }
      const tout = lireCroissance();
      delete tout[id];
      ecrireCroissance(tout);
      return etatCroissance(id);
    },
  },
  {
    methode: 'PUT',
    motif: /^\/bandes\/(\d+)\/croissance\/valeurs$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      const tout = lireCroissance();
      for (const ligne of corps.points) {
        const v = { ...(tout[id].valeurs[ligne.rang] ?? {}) };
        for (const k of ['guideMales', 'observeMales', 'guideFemelles', 'observeFemelles']) if (k in ligne) v[k] = ligne[k];
        if (Object.values(v).every((x) => x == null)) delete tout[id].valeurs[ligne.rang];
        else tout[id].valeurs[ligne.rang] = v;
      }
      ecrireCroissance(tout);
      return etatCroissance(id);
    },
  },
  {
    methode: 'GET',
    motif: /^\/bandes\/(\d+)\/volaille$/,
    reponse: ({ params: [id] }) => { exigerConnexion(); return etatVolaille(id); },
  },
  {
    methode: 'POST',
    motif: /^\/bandes\/(\d+)\/volaille$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      const champs = {};
      const males = corps.males || 0;
      const femelles = corps.femelles || 0;
      const nonSexes = corps.type === 'sexage' ? 0 : (corps.nonSexes || 0);
      if (males + femelles + nonSexes === 0) {
        champs.males = corps.type === 'sexage' ? 'Indiquez au moins un mâle ou une femelle.' : 'Indiquez au moins un oiseau (mâle, femelle ou non sexé).';
      }
      if (!corps.date) champs.date = 'La date est obligatoire (format jj/mm/aaaa).';
      if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
      // Simplified check on today's numbers (the real server checks date by date).
      const { sante } = calculer(trouverBande(id));
      const jj = corps.date.split('-').reverse().join('/');
      if (corps.type === 'sexage') {
        const manque = males + femelles - sante.nonSexes.sains;
        if (manque > 0) throw new ErreurApi(409, 'CONFLIT', `Pas assez d’oiseaux non sexés en bonne santé au ${jj} : il en manquerait ${manque}.`);
      } else {
        const source = corps.type === 'guerison' ? 'malades' : corps.type === 'mort' ? corps.provenance : 'sains';
        for (const [cle, mot] of [['males', 'de mâles'], ['femelles', 'de femelles'], ['nonSexes', 'd’oiseaux non sexés']]) {
          const manque = (cle === 'nonSexes' ? nonSexes : corps[cle] || 0) - sante[cle][source];
          if (manque > 0) {
            throw new ErreurApi(409, 'CONFLIT', `Pas assez ${mot} ${source === 'sains' ? 'en bonne santé' : 'malades'} au ${jj} : il en manquerait ${manque}.`);
          }
        }
      }
      const l = lireMouvements();
      l.push({
        id: (l.at(-1)?.id ?? 0) + 1, bandeId: Number(id), type: corps.type, provenance: corps.type === 'mort' ? corps.provenance : null,
        date: corps.date, males, femelles, nonSexes, total: males + femelles + nonSexes, note: corps.note?.trim() || null, creeLe: new Date().toISOString(),
      });
      ecrireMouvements(l);
      return etatVolaille(id);
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/bandes\/(\d+)\/volaille\/(\d+)$/,
    reponse: ({ params: [id, mid] }) => {
      exigerConnexion();
      ecrireMouvements(lireMouvements().filter((m) => !(m.id === Number(mid) && m.bandeId === Number(id))));
      return null;
    },
  },
  {
    methode: 'GET',
    motif: /^\/bandes$/,
    reponse: () => {
      exigerConnexion();
      return lireBandes().map(calculer).sort((a, b) => b.dateDebut.localeCompare(a.dateDebut) || b.id - a.id);
    },
  },
  {
    methode: 'POST',
    motif: /^\/bandes$/,
    reponse: ({ corps }) => {
      exigerConnexion();
      const v = validerBandeMock(corps);
      const l = lireBandes();
      const b = { id: (l.at(-1)?.id ?? 0) + 1, ...v, creeLe: new Date().toISOString(), modifieLe: null };
      ecrireBandes([...l, b]);
      return calculer(b);
    },
  },
  {
    methode: 'GET',
    motif: /^\/bandes\/(\d+)$/,
    reponse: ({ params: [id] }) => { exigerConnexion(); return calculer(trouverBande(id)); },
  },
  {
    methode: 'PUT',
    motif: /^\/bandes\/(\d+)$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      const b = { ...trouverBande(id), ...validerBandeMock(corps, Number(id)), modifieLe: new Date().toISOString() };
      ecrireBandes(lireBandes().map((x) => (x.id === b.id ? b : x)));
      return calculer(b);
    },
  },
  {
    methode: 'DELETE',
    motif: /^\/bandes\/(\d+)$/,
    reponse: ({ params: [id], corps }) => {
      exigerConnexion();
      if (corps.motDePasse !== MOCK_MOT_DE_PASSE) {
        throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { motDePasse: 'Mot de passe incorrect.' });
      }
      trouverBande(id);
      ecrireBandes(lireBandes().filter((x) => x.id !== Number(id)));
      return null;
    },
  },
  {
    methode: 'GET',
    motif: /^\/auth\/etat$/,
    reponse: () => ({
      connecte: etat.connecte,
      identifiant: etat.connecte ? MOCK_IDENTIFIANT : null,
      nomExploitation: 'Ferme Sidi Aidi',
    }),
  },
  {
    methode: 'POST',
    motif: /^\/auth\/connexion$/,
    reponse: ({ corps }) => {
      if (corps.identifiant !== MOCK_IDENTIFIANT || corps.motDePasse !== MOCK_MOT_DE_PASSE) {
        throw new ErreurApi(401, 'IDENTIFIANTS_INVALIDES', 'Identifiant ou mot de passe incorrect.');
      }
      etat.connecte = true;
      return { identifiant: MOCK_IDENTIFIANT };
    },
  },
  {
    methode: 'POST',
    motif: /^\/auth\/deconnexion$/,
    reponse: () => { etat.connecte = false; return null; },
  },
  {
    methode: 'PUT',
    motif: /^\/auth\/mot-de-passe$/,
    reponse: ({ corps }) => {
      exigerConnexion();
      if (corps.actuel !== MOCK_MOT_DE_PASSE) {
        throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { actuel: 'Mot de passe actuel incorrect.' });
      }
      if (corps.nouveau !== corps.confirmation) {
        throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', { confirmation: 'Les deux mots de passe ne sont pas identiques.' });
      }
      return { message: 'Mot de passe modifié.' };
    },
  },
  {
    methode: 'GET',
    motif: /^\/sante$/,
    reponse: () => {
      exigerConnexion();
      return {
        statut: 'ok',
        application: '0.2.0 (simulation)',
        base: 'PostgreSQL (simulé)',
        nomExploitation: 'Ferme Sidi Aidi',
        heure: new Date().toISOString(),
      };
    },
  },
];

export async function repondreMock(methode, chemin, corps) {
  await new Promise((ok) => setTimeout(ok, 150)); // feel of a real request

  const route = routes.find((r) => r.methode === methode && r.motif.test(chemin));
  if (!route) {
    throw new ErreurApi(404, 'ROUTE_INCONNUE', `Simulation absente pour ${methode} ${chemin} (à ajouter dans js/mock/index.js).`);
  }
  const params = chemin.match(route.motif).slice(1);
  return structuredClone(route.reponse({ params, corps: corps ?? {} }));
}
