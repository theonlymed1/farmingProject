// Fake API used when api.js runs in 'mock' mode (?mode=mock).
// One entry per endpoint from docs/api.md: copy the example response from the contract.
import { ErreurApi } from '../erreurs.js';

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
  const groupe = (recus, cle) => {
    const morts = somme((m) => (m.type === 'mort' ? m[cle] : 0));
    const malades = somme((m) => ({ maladie: m[cle], guerison: -m[cle] }[m.type]
      ?? (m.provenance === 'malades' ? -m[cle] : 0)));
    return {
      recus, sains: recus - morts - malades, malades, morts, vivants: recus - morts,
      tauxMortalite: recus ? Math.round((morts / recus) * 10000) / 100 : 0,
    };
  };
  const males = groupe(b.nombreMales, 'males');
  const femelles = groupe(b.nombreFemelles, 'femelles');
  const nombrePoussins = b.nombreMales + b.nombreFemelles;
  const tot = {
    recus: nombrePoussins,
    sains: males.sains + femelles.sains,
    malades: males.malades + femelles.malades,
    morts: males.morts + femelles.morts,
    vivants: males.vivants + femelles.vivants,
    tauxMortalite: nombrePoussins ? Math.round(((males.morts + femelles.morts) / nombrePoussins) * 10000) / 100 : 0,
  };
  return {
    ...b, nombrePoussins, dateFin, statut, ageJours, effectifActuel: tot.vivants, sante: { males, femelles, total: tot },
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
  if ((c.nombreMales ?? 0) + (c.nombreFemelles ?? 0) < 1) champs.nombreMales = 'Le total des poussins (mâles + femelles) doit être entre 1 et 1000000.';
  if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
  return {
    nom: c.nom.trim(), dateDebut: c.dateDebut, dureeMois: c.dureeMois, nombreMales: c.nombreMales ?? 0, nombreFemelles: c.nombreFemelles ?? 0,
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
  return { bande, config: { periodeJours: p, unite: c.unite }, points };
}

const routes = [
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
      tout[id] = { periodeJours: corps.periodeJours, unite: corps.unite, valeurs: garder ? avant.valeurs : {} };
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
      if (males + femelles === 0) champs.males = 'Indiquez au moins un oiseau (mâle ou femelle).';
      if (!corps.date) champs.date = 'La date est obligatoire (format jj/mm/aaaa).';
      if (Object.keys(champs).length) throw new ErreurApi(400, 'VALIDATION', 'Vérifiez les champs indiqués.', champs);
      // Simplified check on today's numbers (the real server checks date by date).
      const { sante } = calculer(trouverBande(id));
      const source = corps.type === 'guerison' ? 'malades' : corps.type === 'mort' ? corps.provenance : 'sains';
      for (const [cle, sexe, mot] of [['males', 'males', 'mâles'], ['femelles', 'femelles', 'femelles']]) {
        const manque = (corps[cle] || 0) - sante[sexe][source];
        if (manque > 0) {
          throw new ErreurApi(409, 'CONFLIT', `Pas assez de ${mot} ${source === 'sains' ? 'en bonne santé' : 'malades'} au ${corps.date.split('-').reverse().join('/')} : il en manquerait ${manque}.`);
        }
      }
      const l = lireMouvements();
      l.push({
        id: (l.at(-1)?.id ?? 0) + 1, bandeId: Number(id), type: corps.type, provenance: corps.type === 'mort' ? corps.provenance : null,
        date: corps.date, males, femelles, total: males + femelles, note: corps.note?.trim() || null, creeLe: new Date().toISOString(),
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
