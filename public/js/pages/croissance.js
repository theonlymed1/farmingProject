// Croissance et pesées (?bande=…).
//  1. First visit: choose the check frequency (once per Bande).
//  2. Then: one table row per check — guide and observed weights for males and females,
//     typed with or without a unit (900g, 1,25 kg, 1250), saved with one button. Gaps update live:
//     light green = at or above the guide, light red = below.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import { formaterDate } from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, confirmer, confirmerAvecMotDePasse,
} from '../ui.js';
import {
  lirePoids, ecrirePoids, calculerEcart, texteEcart, classeEcart, libellePeriode, resumeDernierControle, SEUIL_KG_SANS_UNITE,
} from '../croissance-commun.js';

const bandeId = Number(new URLSearchParams(location.search).get('bande'));
const zone = document.getElementById('contenu-croissance');
const message = document.getElementById('message');
const COLONNES = ['guideMales', 'observeMales', 'guideFemelles', 'observeFemelles'];
let etat = null; // { bande, config, points }

// --- Settings (check frequency) -----------------------------------------------------

const FREQUENCES = [[7, 'Chaque semaine (7 jours)'], [3, 'Tous les 3 jours'], [1, 'Chaque jour']];

function htmlReglages(config) {
  const periode = config?.periodeJours ?? 7;
  const autre = !FREQUENCES.some(([v]) => v === periode);
  return `
    <div class="champ">
      <label for="frequence">Fréquence des contrôles (comme dans le guide du fournisseur)</label>
      <select id="frequence">
        ${FREQUENCES.map(([v, l]) => `<option value="${v}"${v === periode ? ' selected' : ''}>${l}</option>`).join('')}
        <option value="autre"${autre ? ' selected' : ''}>Autre…</option>
      </select>
    </div>
    <div class="champ" id="champ-jours"${autre ? '' : ' hidden'}>
      <label for="periodeJours">Nombre de jours entre deux contrôles</label>
      <input id="periodeJours" type="number" min="1" max="60" step="1" value="${periode}">
    </div>`;
}

function lireReglages(racine) {
  const choix = racine.querySelector('#frequence').value;
  return {
    periodeJours: choix === 'autre' ? Number(racine.querySelector('#periodeJours').value) : Number(choix),
  };
}

function brancherFrequence(racine) {
  racine.querySelector('#frequence').addEventListener('change', (e) => {
    racine.querySelector('#champ-jours').hidden = e.target.value !== 'autre';
  });
}

/** Sends the settings; if values would be erased, asks first and resends with the confirmation. */
async function envoyerReglages(reglages) {
  try {
    return await api.put(`/bandes/${bandeId}/croissance/config`, reglages);
  } catch (e) {
    if (!e.details?.confirmationRequise) throw e;
    const ok = await confirmer({
      titre: 'Effacer les valeurs saisies ?',
      message: `${e.message.replace(' Confirmez pour continuer.', '')} Les contrôles ne tomberont plus aux mêmes dates.`,
      bouton: 'Changer et effacer',
      danger: true,
    });
    if (!ok) return null;
    return api.put(`/bandes/${bandeId}/croissance/config`, { ...reglages, confirmerEffacement: true });
  }
}

function afficherConfiguration() {
  zone.innerHTML = `
    <section class="carte formulaire-etroit no-print">
      <h2>Configurer le guide de cette bande</h2>
      <p>Choisissez la fréquence des contrôles indiquée dans le guide du fournisseur.
        Un tableau sera créé pour toute la durée de la bande.</p>
      <div class="message"></div>
      <form id="form-config" novalidate>
        ${htmlReglages(null)}
        <button type="submit" class="bouton">Créer le tableau</button>
      </form>
    </section>`;
  const form = document.getElementById('form-config');
  brancherFrequence(form);
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    try {
      etat = await envoyerReglages(lireReglages(form));
      if (etat) afficherTableau();
    } catch (e) {
      afficherErreur(form.closest('.carte').querySelector('.message'), e);
    }
  });
}

async function ouvrirReglages() {
  if (modifications.size && !(await confirmer({
    titre: 'Modifications non enregistrées',
    message: 'Vos modifications du tableau seront perdues. Continuer ?',
    bouton: 'Continuer',
  }))) return;

  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue';
  dialogue.innerHTML = `
    <form method="dialog" novalidate>
      <h2>Réglages du guide</h2>
      <div class="message"></div>
      ${htmlReglages(etat.config)}
      <p class="aide">Changer la fréquence efface les valeurs déjà saisies.</p>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">Enregistrer</button>
      </div>
    </form>`;
  document.body.append(dialogue);
  dialogue.addEventListener('close', () => dialogue.remove());
  dialogue.querySelector('[data-fermer]').addEventListener('click', () => dialogue.close());
  const form = dialogue.querySelector('form');
  brancherFrequence(form);
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    try {
      const nouvel = await envoyerReglages(lireReglages(form));
      if (!nouvel) return;
      etat = nouvel;
      modifications.clear();
      dialogue.close();
      afficherTableau();
      afficherSucces(message, 'Réglages enregistrés.');
    } catch (e) {
      afficherErreur(form.querySelector('.message'), e);
    }
  });
  dialogue.showModal();
}

// --- Table ----------------------------------------------------------------------------

// Edited cells not saved yet: "rang:colonne" → grams (null = emptied).
const modifications = new Map();

function celluleEcart(e) {
  return `<td class="cellule-ecart ${classeEcart(e)}">${e ? echapper(texteEcart(e)) : ''}</td>`;
}

function htmlLigne(p) {
  const input = (col) => `<td class="cellule-saisie"><input type="text" inputmode="decimal" autocomplete="off"
      data-rang="${p.rang}" data-col="${col}" value="${ecrirePoids(p[col])}"
      aria-label="${echapper(p.libelle)} — ${{ guideMales: 'guide mâles', observeMales: 'observé mâles', guideFemelles: 'guide femelles', observeFemelles: 'observé femelles' }[col]}"></td>`;
  return `
    <tr data-rang="${p.rang}" class="${p.actuel ? 'ligne-actuelle' : ''}">
      <th scope="row">${echapper(p.libelle)}${p.actuel ? ' <span class="badge badge-ok">actuel</span>' : ''}</th>
      <td class="texte-discret">J+${p.jourApresArrivee} · ${formaterDate(p.date)}</td>
      ${input('guideMales')}${input('observeMales')}${celluleEcart(p.ecartMales)}
      ${input('guideFemelles')}${input('observeFemelles')}${celluleEcart(p.ecartFemelles)}
    </tr>`;
}

function afficherTableau() {
  const { config } = etat;
  document.getElementById('actions').hidden = false;
  zone.innerHTML = `
    <section class="carte">
      <div class="titre-section">
        <h2>Dernier contrôle</h2>
      </div>
      <div id="resume">${resumeDernierControle(etat)}</div>
    </section>

    <section class="carte">
      <div class="titre-section">
        <h2>Guide et poids observés</h2>
        <span class="texte-discret">Contrôle ${libellePeriode(config.periodeJours)}</span>
      </div>
      <p class="aide no-print">Tapez les poids directement dans le tableau, avec ou sans unité : <strong>900g</strong>, <strong>1,25 kg</strong>, <strong>1250</strong>…
        Sans unité, un nombre inférieur à ${SEUIL_KG_SANS_UNITE} est lu en kilogrammes (2,5 = 2,5 kg), sinon en grammes. Puis cliquez sur « Enregistrer ».
        Écart en <span class="ecart-positif pastille">vert</span> : au-dessus du guide ou égal ;
        en <span class="ecart-negatif pastille">rouge</span> : en dessous.</p>
      <div class="defilement-tableau">
        <table class="tableau grille-croissance">
          <thead>
            <tr>
              <th scope="col" rowspan="2">Contrôle</th>
              <th scope="col" rowspan="2">Date</th>
              <th scope="colgroup" colspan="3" class="groupe">Mâles</th>
              <th scope="colgroup" colspan="3" class="groupe">Femelles</th>
            </tr>
            <tr>
              <th scope="col" class="col-poids">Guide</th><th scope="col" class="col-poids">Observé</th><th scope="col" class="col-poids">Écart</th>
              <th scope="col" class="col-poids">Guide</th><th scope="col" class="col-poids">Observé</th><th scope="col" class="col-poids">Écart</th>
            </tr>
          </thead>
          <tbody>${etat.points.map(htmlLigne).join('')}</tbody>
        </table>
      </div>
    </section>

    <div class="barre-enregistrer no-print" id="barre">
      <span id="etat-modifs">Aucune modification</span>
      <button type="button" class="bouton bouton-secondaire" id="bouton-annuler" disabled>Annuler les modifications</button>
      <button type="button" class="bouton" id="bouton-enregistrer" disabled>Enregistrer</button>
    </div>`;

  const tbody = zone.querySelector('.grille-croissance tbody');
  tbody.addEventListener('input', (e) => surSaisie(e.target));
  // Leaving a cell rewrites a valid weight the standard way: "1kg" → "1 kg", "1250" → "1,25 kg".
  tbody.addEventListener('change', (e) => {
    if (!e.target.matches('input[data-col]')) return;
    const g = lirePoids(e.target.value);
    if (g !== null && !Number.isNaN(g)) e.target.value = ecrirePoids(g);
  });
  tbody.addEventListener('keydown', surClavier);
  tbody.addEventListener('focusin', (e) => { if (e.target.matches('input')) e.target.select(); });
  document.getElementById('bouton-enregistrer').addEventListener('click', enregistrer);
  document.getElementById('bouton-annuler').addEventListener('click', () => { modifications.clear(); afficherTableau(); });
  majBarre();
}

function valeurCellule(rang, col) {
  const cle = `${rang}:${col}`;
  if (modifications.has(cle)) return modifications.get(cle);
  return etat.points.find((p) => p.rang === rang)?.[col] ?? null;
}

function surSaisie(input) {
  if (!input.matches('input[data-col]')) return;
  const rang = Number(input.dataset.rang);
  const { col } = input.dataset;
  const g = lirePoids(input.value);
  const origine = etat.points.find((p) => p.rang === rang)?.[col] ?? null;

  input.classList.toggle('saisie-invalide', Number.isNaN(g));
  input.title = Number.isNaN(g) ? 'Poids invalide. Exemples : 900g, 1,25 kg, 1250' : '';
  const cle = `${rang}:${col}`;
  if (g === origine) modifications.delete(cle);
  else modifications.set(cle, g);
  input.classList.toggle('saisie-modifiee', modifications.has(cle) && !Number.isNaN(g));

  // Live gap for this sex on this row.
  const sexe = col.endsWith('Males') ? 'Males' : 'Femelles';
  const e = calculerEcart(valeurCellule(rang, `guide${sexe}`), valeurCellule(rang, `observe${sexe}`));
  const cellule = input.closest('td').parentElement.querySelectorAll('.cellule-ecart')[sexe === 'Males' ? 0 : 1];
  cellule.className = `cellule-ecart ${classeEcart(e)}`;
  cellule.textContent = e ? texteEcart(e) : '';
  majBarre();
}

/** Enter / arrow keys move between cells like a spreadsheet. */
function surClavier(e) {
  const input = e.target;
  if (!input.matches('input[data-col]')) return;
  const rang = Number(input.dataset.rang);
  const idx = COLONNES.indexOf(input.dataset.col);
  let cible = null;
  if (e.key === 'Enter' || e.key === 'ArrowDown') cible = [rang + 1, idx];
  else if (e.key === 'ArrowUp') cible = [rang - 1, idx];
  if (!cible) return;
  const suivant = zone.querySelector(`input[data-rang="${cible[0]}"][data-col="${COLONNES[cible[1]]}"]`);
  if (suivant) { e.preventDefault(); suivant.focus(); }
}

function majBarre() {
  const invalides = zone.querySelectorAll('.saisie-invalide').length;
  const n = modifications.size;
  document.getElementById('etat-modifs').textContent = invalides
    ? `${invalides} valeur${invalides > 1 ? 's' : ''} invalide${invalides > 1 ? 's' : ''} à corriger`
    : n ? `${n} modification${n > 1 ? 's' : ''} non enregistrée${n > 1 ? 's' : ''}` : 'Aucune modification';
  document.getElementById('barre').classList.toggle('barre-active', n > 0);
  document.getElementById('bouton-enregistrer').disabled = n === 0 || invalides > 0;
  document.getElementById('bouton-annuler').disabled = n === 0;
}

async function enregistrer() {
  const parRang = new Map();
  for (const [cle, g] of modifications) {
    const [rang, col] = cle.split(':');
    if (!parRang.has(rang)) parRang.set(rang, { rang: Number(rang) });
    parRang.get(rang)[col] = g;
  }
  const bouton = document.getElementById('bouton-enregistrer');
  bouton.disabled = true;
  try {
    etat = await api.put(`/bandes/${bandeId}/croissance/valeurs`, { points: [...parRang.values()] });
    const n = modifications.size;
    modifications.clear();
    afficherTableau();
    afficherSucces(message, `${n} valeur${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''}.`);
  } catch (e) {
    afficherErreur(message, e);
    majBarre();
  }
}

// Warn before leaving the page with unsaved values.
window.addEventListener('beforeunload', (e) => {
  if (modifications.size) e.preventDefault();
});

document.getElementById('bouton-imprimer-page').addEventListener('click', () => window.print());
document.getElementById('bouton-reglages').addEventListener('click', ouvrirReglages);

document.getElementById('bouton-supprimer-guide').addEventListener('click', async () => {
  const remplis = etat.points.filter((p) => COLONNES.some((c) => p[c] != null)).length;
  const nouvel = await confirmerAvecMotDePasse({
    titre: 'Supprimer le guide de croissance ?',
    avertissement: `Le guide de « ${etat.bande.nom} » et toutes ses valeurs seront supprimés `
      + `(${remplis} contrôle${remplis > 1 ? 's' : ''} rempli${remplis > 1 ? 's' : ''}). Cette action est irréversible.`,
    bouton: 'Supprimer le guide',
    action: (motDePasse) => api.supprimer(`/bandes/${bandeId}/croissance`, { motDePasse }),
  });
  if (!nouvel) return;
  etat = nouvel;
  modifications.clear();
  document.getElementById('actions').hidden = true;
  afficherConfiguration();
  afficherSucces(message, 'Guide supprimé.');
});

try {
  if (!Number.isInteger(bandeId) || bandeId <= 0) throw new Error('Bande introuvable. Revenez à la liste des bandes.');
  etat = await api.get(`/bandes/${bandeId}/croissance`);
  monterLayout({ titre: `Croissance et pesées — ${etat.bande.nom}`, bande: etat.bande });
  document.getElementById('sous-titre').textContent = `${etat.bande.nom} · début le ${formaterDate(etat.bande.dateDebut)}`;
  if (etat.config) afficherTableau();
  else afficherConfiguration();
} catch (e) {
  monterLayout({ titre: 'Croissance et pesées' });
  zone.innerHTML = '<p><a href="/pages/bandes.html">← Retour à la liste des bandes</a></p>';
  afficherErreur(message, e);
}
