// Builds the common frame around <main id="contenu">: top bar, side menu, print header.
// Every page calls monterLayout() once.
import { api, mode } from './api.js';
import { echapper } from './ui.js';

// Features of an open Bande. Set `disponible: true` when a page is merged.
// Each page receives the Bande as ?id=… (bande page) or ?bande=… (feature pages).
const MENU_BANDE = [
  { page: 'bande', libelle: 'Tableau de bord', disponible: true, param: 'id' },
  { page: 'volaille', libelle: 'Mortalité et malades', disponible: true },
  { page: 'croissance', libelle: 'Croissance et pesées', disponible: true },
  { page: 'charges', libelle: 'Charges', disponible: false },
  { page: 'employes', libelle: 'Employés', disponible: false },
  { page: 'historique', libelle: 'Historique', disponible: false },
];

function lien({ page, libelle, disponible, href }, pageActive) {
  if (!disponible) return `<li><span>${echapper(libelle)} <small>bientôt</small></span></li>`;
  const actif = page === pageActive ? ' aria-current="page"' : '';
  return `<li><a href="${href ?? `/pages/${page}.html`}"${actif}>${echapper(libelle)}</a></li>`;
}

/**
 * @param {object} options
 * @param {string} options.titre        Page title, also used in the print header.
 * @param {{id:number, nom:string}} [options.bande]  The open Bande, if any: shows its menu.
 */
export function monterLayout({ titre, bande = null }) {
  const pageActive = document.body.dataset.page;
  const contenu = document.getElementById('contenu');
  if (!contenu) throw new Error('layout.js : <main id="contenu"> introuvable');

  const menuBande = bande ? `
      <p class="menu-titre-bande">${echapper(bande.nom)}</p>
      <ul>${MENU_BANDE.map((e) => lien({
        ...e, href: `/pages/${e.page}.html?${e.param ?? 'bande'}=${bande.id}`,
      }, pageActive)).join('')}</ul>` : '';

  const cadre = document.createElement('div');
  cadre.className = 'mise-en-page';
  cadre.innerHTML = `
    <header class="entete">
      <div class="marque">Plateforme avicole
        <small id="entete-exploitation"></small>
        ${mode === 'mock' ? '<span class="badge badge-mode-mock" title="Réponses simulées (js/mock)">MODE SIMULATION</span>' : ''}
      </div>
      <button type="button" class="bouton" id="bouton-imprimer">Imprimer</button>
      <button type="button" class="bouton bouton-entete-discret" id="bouton-deconnexion">Se déconnecter</button>
    </header>
    <nav class="menu" aria-label="Menu principal">
      <ul>${lien({ page: 'bandes', libelle: 'Les bandes', disponible: true }, bande ? null : pageActive)}</ul>
      ${menuBande}
      <ul class="menu-bas">${lien({ page: 'parametres', libelle: 'Paramètres', disponible: true }, pageActive)}</ul>
    </nav>`;

  // Print-only header at the top of the content.
  const entete = document.createElement('div');
  entete.className = 'entete-impression seulement-impression';
  entete.innerHTML = `
    <div class="exploitation" id="impression-exploitation"></div>
    <div class="meta">${echapper(titre)}<br>Imprimé le <span id="impression-date"></span></div>`;
  contenu.prepend(entete);

  document.body.prepend(cadre);
  cadre.append(contenu);

  document.title = `${titre} — Plateforme avicole`;
  document.getElementById('bouton-imprimer').addEventListener('click', () => window.print());
  document.getElementById('bouton-deconnexion').addEventListener('click', seDeconnecter);
  // The print date is the moment of printing, not of page load.
  window.addEventListener('beforeprint', () => {
    document.getElementById('impression-date').textContent = new Date().toLocaleString('fr-FR');
  });

  chargerExploitation();
}

async function chargerExploitation() {
  try {
    const etat = await api.get('/auth/etat');
    if (!etat.connecte) {
      // The page guard should have caught this; covers a session that expired meanwhile.
      location.replace('/pages/connexion.html');
      return;
    }
    document.getElementById('entete-exploitation').textContent = etat.nomExploitation;
    document.getElementById('impression-exploitation').textContent = etat.nomExploitation;
  } catch {
    // Header details are optional: the page itself shows any server error.
  }
}

async function seDeconnecter() {
  try {
    await api.post('/auth/deconnexion');
  } finally {
    location.replace('/pages/connexion.html');
  }
}
