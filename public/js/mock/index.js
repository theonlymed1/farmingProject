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
  return { ...b, dateFin, statut, ageJours, effectifActuel: b.nombrePoussins };
}

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
  return { nom: c.nom.trim(), dateDebut: c.dateDebut, dureeMois: c.dureeMois, nombrePoussins: c.nombrePoussins };
}

function trouverBande(id) {
  const b = lireBandes().find((x) => x.id === Number(id));
  if (!b) throw new ErreurApi(404, 'INTROUVABLE', 'Cette bande n’existe pas ou a été supprimée.');
  return b;
}

const routes = [
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
