// Builds the common frame around <main id="contenu">: top bar, side menu, print header.
// Every page calls monterLayout() once at the top of its script.
import { mode } from './api.js';
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

/**
 * @param {object} options
 * @param {string} options.titre           Page title, also used in the print header.
 * @param {string} [options.nomExploitation] Farm name for the print header.
 */
export function monterLayout({ titre, nomExploitation = 'Exploitation avicole' }) {
  const pageActive = document.body.dataset.page;
  const contenu = document.getElementById('contenu');
  if (!contenu) throw new Error('layout.js : <main id="contenu"> introuvable');

  const cadre = document.createElement('div');
  cadre.className = 'mise-en-page';
  cadre.innerHTML = `
    <header class="entete">
      <div class="marque">Plateforme avicole
        ${mode === 'mock' ? '<span class="badge badge-mode-mock" title="Réponses simulées (js/mock)">MODE SIMULATION</span>' : ''}
      </div>
      <div class="selecteur-bande">
        <label for="bande-active">Bande :</label>
        <select id="bande-active" disabled>
          <option>Aucune bande (phase 2)</option>
        </select>
      </div>
      <button type="button" class="bouton" id="bouton-imprimer">Imprimer</button>
    </header>
    <nav class="menu" aria-label="Menu principal">
      <ul>
        ${MENU.map((e) => `<li>${
          e.disponible
            ? `<a href="/pages/${e.page}.html"${e.page === pageActive ? ' aria-current="page"' : ''}>${echapper(e.libelle)}</a>`
            : `<span>${echapper(e.libelle)} <small>bientôt</small></span>`
        }</li>`).join('')}
      </ul>
    </nav>`;

  // Print-only header at the top of the content.
  const entete = document.createElement('div');
  entete.className = 'entete-impression seulement-impression';
  entete.innerHTML = `
    <div class="exploitation" id="impression-exploitation">${echapper(nomExploitation)}</div>
    <div class="meta">${echapper(titre)}<br>Imprimé le ${new Date().toLocaleString('fr-FR')}</div>`;
  contenu.prepend(entete);

  document.body.prepend(cadre);
  cadre.append(contenu);

  document.title = `${titre} — Plateforme avicole`;
  document.getElementById('bouton-imprimer').addEventListener('click', () => window.print());
}

/** Updates the farm name in the print header once it is loaded from the API. */
export function definirNomExploitation(nom) {
  const el = document.getElementById('impression-exploitation');
  if (el && nom) el.textContent = nom;
}
