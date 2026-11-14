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
  const mv = lireMouvements().filter((m) => m.bandeId === b.id);
  const somme = (f) => mv.reduce((t, m) => t + f(m), 0);
  // Same rules as server/modules/volaille/coherence.js (every chick starts non-sexed and healthy).
  const effet = (m, cle, etatSante) => {
    if (etatSante === 'malades') return { maladie: m[cle], guerison: -m[cle], mort: m.provenance === 'malades' ? -m[cle] : 0 }[m.type] ?? 0;
    const sexage = cle === 'nonSexes' ? -(m.males + m.femelles) : m[cle];
    return {
      maladie: -m[cle], guerison: m[cle], mort: m.provenance === 'sains' ? -m[cle] : 0, sexage,
    }[m.type] ?? 0;
  };
  const groupe = (cle, depart) => {
    const sains = depart + somme((m) => effet(m, cle, 'sains'));
    const malades = somme((m) => effet(m, cle, 'malades'));
    const morts = somme((m) => (m.type === 'mort' ? m[cle] : 0));
    return {
      sains, malades, morts, vivants: sains + malades,
    };
  };
  const males = groupe('males', 0);
  const femelles = groupe('femelles', 0);
  const nonSexes = groupe('nonSexes', b.nombrePoussins);
  const morts = males.morts + femelles.morts + nonSexes.morts;
  const tot = {
    recus: b.nombrePoussins,
    sains: males.sains + femelles.sains + nonSexes.sains,
    malades: males.malades + femelles.malades + nonSexes.malades,
    morts,
    vivants: b.nombrePoussins - morts,
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

// --- Simulated charges ------------------------------------------------------------------
const lireChargesMock = () => JSON.parse(sessionStorage.getItem('mock-charges') ?? '[]');
const ecrireChargesMock = (l) => sessionStorage.setItem('mock-charges', JSON.stringify(l));
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
      coutTotal: total + (bande.prixPoussins ?? 0) + resumeEmployesMock(id).cout,
      coutParPoussin: Math.round(((total + (bande.prixPoussins ?? 0) + resumeEmployesMock(id).cout) / bande.nombrePoussins) * 100) / 100,
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
    .map((e) => ({ ...e, actif: !e.dateDepart, compte: compteMock(e, e.joursRepos.map((j) => j.date), aujourdhuiMock()) }))
    .sort((a, b) => Number(!a.actif) - Number(!b.actif) || a.nom.localeCompare(b.nom, 'fr'));
}
function resumeEmployesMock(id) {
  const l = employesDe(id);
  const somme = (f) => Math.round(l.reduce((t, e) => t + f(e), 0) * 100) / 100;
  return {
    nombreActifs: l.filter((e) => e.actif).length,
    nombrePartis: l.filter((e) => !e.actif).length,
    totalAvances: somme((e) => e.compte.totalAvances),
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
    nom: c.nom.trim().replace(/\s+/g, ' '), age: c.age, cin, dateDebut: c.dateDebut, avanceHebdo: c.avanceHebdo ?? 200, salaireJournalier: c.salaireJournalier,
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
      nomExploitation: 'Firme Sidi Aidi',
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
        nomExploitation: 'Firme Sidi Aidi',
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
