// Historique: ?bande=… for one Bande, nothing for "Historique général".
// Filters by dates, section, action and words; 100 entries at a time; details = values before / after.
// Deleting one line or clearing everything asks for the password.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import { formaterDate, formaterDateHeure, formaterNombre } from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, confirmerAvecMotDePasse,
} from '../ui.js';

const PAR_PAGE = 100;
const parametre = new URLSearchParams(location.search).get('bande');
const bandeId = parametre ? Number(parametre) : null;
const form = document.getElementById('filtres');
const liste = document.getElementById('liste');
const message = document.getElementById('message');
const boutonPlus = document.getElementById('bouton-plus');

const SECTIONS = {
  bandes: 'Bandes',
  volaille: 'Mortalité et malades',
  croissance: 'Croissance',
  charges: 'Charges',
  ventes: 'Ventes',
  employes: 'Employés',
  parametres: 'Paramètres',
};
const ACTIONS = {
  creation: ['Ajout', 'badge-guerison'],
  modification: ['Modification', 'badge-maladie'],
  suppression: ['Suppression', 'badge-mort'],
  autre: ['Autre', ''],
};

let entrees = [];
let total = 0;

// --- Loading ------------------------------------------------------------------------------

function filtresActuels() {
  const f = {};
  for (const champ of ['du', 'au', 'module', 'action', 'q']) {
    const v = form[champ].value.trim();
    if (v) f[champ] = v;
  }
  if (bandeId) f.bande = bandeId;
  return f;
}

async function charger({ suite = false } = {}) {
  const params = new URLSearchParams({ ...filtresActuels(), limite: PAR_PAGE, decalage: suite ? entrees.length : 0 });
  boutonPlus.disabled = true;
  try {
    const r = await api.get(`/historique?${params}`);
    entrees = suite ? [...entrees, ...r.entrees] : r.entrees;
    total = r.total;
    message.innerHTML = '';
    afficher();
  } catch (e) {
    // Show the precise reason, e.g. "La date de fin est avant la date de début."
    afficherErreur(message, e.details ? { message: Object.values(e.details).join(' ') } : e);
  } finally {
    boutonPlus.disabled = false;
  }
}

// --- Display ------------------------------------------------------------------------------

function afficher() {
  const f = filtresActuels();
  const actifs = Object.keys(f).filter((k) => k !== 'bande').length;
  document.getElementById('compte-resultats').textContent = `${formaterNombre(total)} opération${total > 1 ? 's' : ''}`
    + `${actifs ? ' (filtrées)' : ''}${entrees.length < total ? ` · ${formaterNombre(entrees.length)} affichées` : ''}`;
  document.getElementById('filtres-imprimes').textContent = actifs ? `Filtres : ${[
    f.du && `du ${formaterDate(f.du)}`, f.au && `au ${formaterDate(f.au)}`, f.module && SECTIONS[f.module],
    f.action && ACTIONS[f.action][0], f.q && `« ${f.q} »`,
  ].filter(Boolean).join(', ')}` : '';
  boutonPlus.hidden = entrees.length >= total;

  if (!entrees.length) {
    liste.innerHTML = `<p class="texte-discret">${actifs ? 'Aucune opération ne correspond aux filtres.' : 'Aucune opération enregistrée pour le moment.'}</p>`;
    return;
  }
  liste.innerHTML = `
    <table class="tableau tableau-historique">
      <thead>
        <tr>
          <th scope="col">Date et heure</th>
          <th scope="col">Section</th>
          <th scope="col">Action</th>
          ${bandeId ? '' : '<th scope="col">Bande</th>'}
          <th scope="col">Description</th>
          <th scope="col" class="no-print"><span class="visuellement-cache">Détails</span></th>
        </tr>
      </thead>
      <tbody>
        ${entrees.map((e) => {
    const [action, classe] = ACTIONS[e.action] ?? ACTIONS.autre;
    return `
          <tr>
            <td class="cellule-date">${formaterDateHeure(e.dateHeure)}</td>
            <td>${SECTIONS[e.module] ?? echapper(e.module)}</td>
            <td><span class="badge ${classe}">${action}</span></td>
            ${bandeId ? '' : `<td>${e.bandeNom ? echapper(e.bandeNom) : '<span class="texte-discret">—</span>'}</td>`}
            <td>${echapper(e.description)}</td>
            <td class="no-print actions-ligne">
              ${e.avant || e.apres ? `<button type="button" class="bouton-lien" data-details="${e.id}">Détails</button>` : ''}
              <button type="button" class="bouton-lien bouton-lien-danger" data-supprimer="${e.id}">Supprimer</button>
            </td>
          </tr>`;
  }).join('')}
      </tbody>
    </table>`;
}

// --- Details (before / after) ---------------------------------------------------------------------

const LIBELLES = {
  nom: 'Nom', dateDebut: 'Date de début', dureeMois: 'Durée (mois)', nombrePoussins: 'Nombre de poussins',
  prixPoussins: 'Prix des poussins (DH)', nombreMales: 'Mâles', nombreFemelles: 'Femelles', type: 'Type',
  provenance: 'Provenance', date: 'Date', males: 'Mâles', femelles: 'Femelles', nonSexes: 'Non sexés', total: 'Total',
  note: 'Remarque', periodeJours: 'Fréquence (jours)', vendeur: 'Vendeur', typeProduit: 'Type de produit',
  produit: 'Produit / service', quantite: 'Quantité', unite: 'Unité', prixTotal: 'Prix total (DH)',
  description: 'Description', age: 'Âge', cin: 'CIN', avanceHebdo: 'Avance / semaine (DH)',
  salaireJournalier: 'Salaire / jour (DH)', dateDepart: 'Date de départ', joursTravailles: 'Jours travaillés',
  joursRepos: 'Jours de repos', joursPeriode: 'Jours de la période', semaines: 'Semaines', totalAvances: 'Avances (DH)',
  salaireTotal: 'Salaire total (DH)', solde: 'Solde (DH)', cout: 'Coût (DH)', jusquAu: 'Jusqu’au',
  numero: 'N° de facture', client: 'Client', typeClient: 'Type de client', oiseaux: 'Oiseaux',
  poidsTotalKg: 'Poids total (kg)', poidsMoyenKg: 'Poids par oiseau (kg)', prixParOiseau: 'Prix par oiseau (DH)',
  prixParKg: 'Prix au kg (DH)',
};
const CACHES = new Set(['id', 'creeLe', 'modifieLe', 'bandeId']);

/** { a: 1, compte: { b: 2 } } → [['a', 1], ['b', 2]] (one level of nesting, technical keys hidden). */
function aplatir(objet, resultat = new Map()) {
  for (const [cle, valeur] of Object.entries(objet ?? {})) {
    if (CACHES.has(cle)) continue;
    if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) aplatir(valeur, resultat);
    else resultat.set(cle, valeur);
  }
  return resultat;
}

const VALEURS = { particulier: 'Particulier', societe: 'Société' };

function texteValeur(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Object.hasOwn(VALEURS, v)) return VALEURS[v];
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formaterDate(v);
  if (typeof v === 'number') return v.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
  if (Array.isArray(v)) return `${v.length} élément${v.length > 1 ? 's' : ''}`;
  return String(v);
}

function voirDetails(entree) {
  const avant = aplatir(entree.avant);
  const apres = aplatir(entree.apres);
  const cles = [...new Set([...avant.keys(), ...apres.keys()])];
  const deux = avant.size && apres.size;
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue dialogue-large';
  dialogue.innerHTML = `
    <h2>Détails de l’opération</h2>
    <p class="texte-discret">${formaterDateHeure(entree.dateHeure)} · ${SECTIONS[entree.module] ?? ''}${entree.bandeNom ? ` · ${echapper(entree.bandeNom)}` : ''}</p>
    <p>${echapper(entree.description)}</p>
    <table class="tableau tableau-details">
      <thead><tr><th scope="col">Champ</th>${avant.size ? '<th scope="col">Avant</th>' : ''}${apres.size ? '<th scope="col">Après</th>' : ''}</tr></thead>
      <tbody>
        ${cles.map((c) => {
    const change = deux && JSON.stringify(avant.get(c)) !== JSON.stringify(apres.get(c));
    return `<tr class="${change ? 'ligne-changee' : ''}">
            <th scope="row">${echapper(LIBELLES[c] ?? c)}</th>
            ${avant.size ? `<td>${echapper(texteValeur(avant.get(c)))}</td>` : ''}
            ${apres.size ? `<td>${echapper(texteValeur(apres.get(c)))}</td>` : ''}
          </tr>`;
  }).join('')}
      </tbody>
    </table>
    ${deux ? '<p class="aide">Les lignes surlignées ont changé.</p>' : ''}
    <div class="actions-dialogue"><button type="button" class="bouton" data-fermer>Fermer</button></div>`;
  document.body.append(dialogue);
  dialogue.addEventListener('close', () => dialogue.remove());
  dialogue.querySelector('[data-fermer]').addEventListener('click', () => dialogue.close());
  dialogue.showModal();
}

// --- Events -----------------------------------------------------------------------------------

let minuteur = null;
form.addEventListener('input', (e) => {
  clearTimeout(minuteur);
  // Typing in the search box waits a moment; dates and lists apply at once.
  minuteur = setTimeout(() => charger(), e.target.name === 'q' ? 300 : 0);
});
form.addEventListener('submit', (e) => e.preventDefault());
document.getElementById('bouton-effacer').addEventListener('click', () => { form.reset(); charger(); });
boutonPlus.addEventListener('click', () => charger({ suite: true }));
liste.addEventListener('click', async (e) => {
  const details = e.target.closest('[data-details]');
  if (details) voirDetails(entrees.find((x) => x.id === Number(details.dataset.details)));
  const suppr = e.target.closest('[data-supprimer]');
  if (!suppr) return;
  const entree = entrees.find((x) => x.id === Number(suppr.dataset.supprimer));
  const ok = await confirmerAvecMotDePasse({
    titre: 'Supprimer cette opération de l’historique ?',
    avertissement: `${formaterDateHeure(entree.dateHeure)} — ${entree.description}`,
    bouton: 'Supprimer',
    action: (motDePasse) => api.supprimer(`/historique/${entree.id}`, { motDePasse }),
  });
  if (!ok) return;
  await charger();
  afficherSucces(message, 'Opération supprimée de l’historique.');
});

document.getElementById('bouton-effacer-tout').addEventListener('click', async () => {
  // The count of the whole scope (Bande or everything), whatever filters are shown.
  const { total: n } = await api.get(`/historique?limite=1${bandeId ? `&bande=${bandeId}` : ''}`);
  if (!n) { afficherSucces(message, 'L’historique est déjà vide.'); return; }
  const ok = await confirmerAvecMotDePasse({
    titre: bandeId ? 'Effacer l’historique de cette bande ?' : 'Effacer tout l’historique ?',
    avertissement: `${formaterNombre(n)} opération${n > 1 ? 's' : ''} ${bandeId ? 'de cette bande ' : '(toutes les bandes et les paramètres) '}`
      + `seront supprimée${n > 1 ? 's' : ''} définitivement, quels que soient les filtres. `
      + 'Une ligne indiquant que l’historique a été effacé sera conservée.',
    bouton: 'Effacer l’historique',
    action: (motDePasse) => api.post('/historique/effacer', bandeId ? { motDePasse, bande: bandeId } : { motDePasse }),
  });
  if (!ok) return;
  form.reset();
  await charger();
  afficherSucces(message, `Historique effacé : ${formaterNombre(ok.supprimees)} opération${ok.supprimees > 1 ? 's' : ''} supprimée${ok.supprimees > 1 ? 's' : ''}.`);
});
document.getElementById('bouton-imprimer-page').addEventListener('click', () => window.print());

// --- Start --------------------------------------------------------------------------------------

try {
  if (bandeId !== null && (!Number.isInteger(bandeId) || bandeId <= 0)) throw new Error('Bande introuvable. Revenez à la liste des bandes.');
  if (bandeId) {
    const bande = await api.get(`/bandes/${bandeId}`);
    monterLayout({ titre: `Historique — ${bande.nom}`, bande });
    document.getElementById('sous-titre').textContent = `${bande.nom} · toutes les opérations de la bande`;
  } else {
    document.body.dataset.page = 'historique-general';
    monterLayout({ titre: 'Historique général' });
    document.querySelector('h1').textContent = 'Historique général';
    document.getElementById('sous-titre').textContent = 'Toutes les bandes, y compris supprimées, et les paramètres du compte';
  }
  await charger();
} catch (e) {
  monterLayout({ titre: 'Historique' });
  afficherErreur(message, e);
  liste.innerHTML = '<p><a href="/pages/bandes.html">← Retour à la liste des bandes</a></p>';
}
