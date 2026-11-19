// Printing a PART of a page: one document (receipt, invoice, fiche) or one section of the page.
// The page itself stays as it is; only the given HTML goes on paper (print.css hides the rest
// while body has the class "impression-recu").
//
//   imprimerHtml(html)            prints this HTML only (it brings its own header)
//   imprimerSection(section)      prints one <section class="carte"> under the usual print header
//   enteteImpression(titre)       that header: farm name · what it is · print date
//
// layout.js adds a small "Imprimer" button to every section of the page (activerImpressionSections):
// a section opts out with data-sans-impression, or by being .no-print.
import { echapper } from './ui.js';

/** Farm name, as shown in the header (filled by layout.js once the session is checked). */
export function nomExploitation() {
  return document.getElementById('impression-exploitation')?.textContent.trim()
    || document.getElementById('entete-exploitation')?.textContent.trim() || '';
}

/** Page title without the application name, e.g. "Charges — Bande 3". */
const titrePage = () => document.title.replace(/\s+—\s+Plateforme avicole$/, '');

export function enteteImpression(titre = titrePage()) {
  return `
    <div class="entete-impression">
      <div class="exploitation">${echapper(nomExploitation())}</div>
      <div class="meta">${echapper(titre)}<br>Imprimé le ${echapper(new Date().toLocaleString('fr-FR'))}</div>
    </div>`;
}

function zone() {
  let z = document.getElementById('zone-recu');
  if (!z) {
    z = document.createElement('div');
    z.id = 'zone-recu';
    z.className = 'zone-recu';
    z.hidden = true;
    document.body.append(z);
  }
  return z;
}

export function imprimerHtml(html) {
  const z = zone();
  z.innerHTML = html;
  z.hidden = false;
  document.body.classList.add('impression-recu');
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('impression-recu');
    z.hidden = true;
    z.innerHTML = '';
  }, { once: true });
  window.print();
}

/** Copy of a section as it is on screen, without buttons, filters, links or anything marked no-print. */
export function copiePourImpression(element) {
  const copie = element.cloneNode(true);
  copie.querySelectorAll('.no-print, button, select, .filtres').forEach((x) => x.remove());
  // Typed values (e.g. the growth table) print as plain text.
  copie.querySelectorAll('input, textarea').forEach((champ) => {
    const texte = document.createElement('span');
    texte.textContent = champ.value;
    champ.replaceWith(texte);
  });
  copie.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  copie.removeAttribute('id');
  copie.classList.remove('carte');
  return copie.outerHTML;
}

export function imprimerSection(section) {
  imprimerHtml(`${enteteImpression()}${copiePourImpression(section)}`);
}

// --- "Imprimer" button on every section ------------------------------------------------------

const BOUTON = '<button type="button" class="bouton-lien bouton-imprimer-section no-print" data-imprimer-section>Imprimer</button>';

function ajouterBoutons(racine) {
  for (const section of racine.querySelectorAll('section.carte')) {
    if (section.matches('[data-sans-impression], .no-print') || section.closest('.no-print, dialog')) continue;
    const titre = section.querySelector(':scope > h2, :scope > .titre-section > h2');
    if (!titre) continue;
    let ligne = titre.parentElement;
    if (ligne.querySelector(':scope > [data-imprimer-section]')) continue;
    if (!ligne.classList.contains('titre-section')) {
      // Put the title and the button on one line.
      ligne = document.createElement('div');
      ligne.className = 'titre-section';
      titre.replaceWith(ligne);
      ligne.append(titre);
    }
    ligne.insertAdjacentHTML('beforeend', BOUTON);
  }
}

export function activerImpressionSections() {
  const contenu = document.getElementById('contenu');
  if (!contenu) return;
  ajouterBoutons(contenu);
  // Pages redraw their sections after every change: add the buttons again each time.
  let prevu = false;
  new MutationObserver(() => {
    if (prevu) return;
    prevu = true;
    queueMicrotask(() => { prevu = false; ajouterBoutons(contenu); });
  }).observe(contenu, { childList: true, subtree: true });
  contenu.addEventListener('click', (evt) => {
    const bouton = evt.target.closest('[data-imprimer-section]');
    if (bouton) imprimerSection(bouton.closest('section'));
  });
}
