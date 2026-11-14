// Builds the common frame around <main id="contenu">: top bar, side menu, print header.
// Every page calls monterLayout() once at the top of its script.
import { api, mode } from './api.js';
import { echapper } from './ui.js';

// Menu entries. Set `disponible: true` when a page is merged.
const MENU = [
  { page: 'tableau-de-bord', libelle: 'Tableau de bord', disponible: true },
  { page: 'bandes', libelle: 'Bandes', disponible: false },
  { page: 'poussins', libelle: 'Arrivée des poussins', disponible: false },
  { page: 'volaille', libelle: 'Mortalité et malades', disponible: false },
  { page: 'croissance', libelle: 'Croissance et pesées', disponible: false },
  { page: 'charges', libelle: 'Charges', disponible: false },
  { page: 'employes', libelle: 'Employés', disponible: false },
  { page: 'historique', libelle: 'Historique', disponible: false },
];
const MENU_BAS = [
  { page: 'parametres', libelle: 'Paramètres', disponible: true },
];

const lienMenu = (e, pageActive) => `<li>${
  e.disponible
    ? `<a href="/pages/${e.page}.html"${e.page === pageActive ? ' aria-current="page"' : ''}>${echapper(e.libelle)}</a>`
    : `<span>${echapper(e.libelle)} <small>bientôt</small></span>`
}</li>`;

/**
 * @param {object} options
 * @param {string} options.titre  Page title, also used in the print header.
 */
export function monterLayout({ titre }) {
  const pageActive = document.body.dataset.page;
  const contenu = document.getElementById('contenu');
  if (!contenu) throw new Error('layout.js : <main id="contenu"> introuvable');

  const cadre = document.createElement('div');
  cadre.className = 'mise-en-page';
  cadre.innerHTML = `
    <header class="entete">
      <div class="marque">Plateforme avicole
        <small id="entete-exploitation"></small>
        ${mode === 'mock' ? '<span class="badge badge-mode-mock" title="Réponses simulées (js/mock)">MODE SIMULATION</span>' : ''}
      </div>
      <div class="selecteur-bande">
        <label for="bande-active">Bande :</label>
        <select id="bande-active" disabled>
          <option>Aucune bande (phase 2)</option>
        </select>
      </div>
      <button type="button" class="bouton" id="bouton-imprimer">Imprimer</button>
      <button type="button" class="bouton bouton-entete-discret" id="bouton-deconnexion">Se déconnecter</button>
    </header>
    <nav class="menu" aria-label="Menu principal">
      <ul>${MENU.map((e) => lienMenu(e, pageActive)).join('')}</ul>
      <ul class="menu-bas">${MENU_BAS.map((e) => lienMenu(e, pageActive)).join('')}</ul>
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
