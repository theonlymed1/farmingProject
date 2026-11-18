// Construction of the new farm: two kinds of charges, one list, everything printable.
//   + Charge générale   (type 'grosse') : nom, date, quantité (free text), montant total, description
//   + Charge spécifique (type 'petite') : nom, date, unité, quantité, prix par <unité> (total calculated), description
// No link with the Bandes: these charges never count in a Bande's costs.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import {
  formaterDate, formaterMontant, formaterNombre, aujourdhui,
} from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, confirmerAvecMotDePasse,
} from '../ui.js';
import { lireNombre, ecrireNombre } from '../charges-commun.js';

const zone = document.getElementById('contenu-construction');
const message = document.getElementById('message');
let etat = null; // { charges, resume }
let recherche = '';
let filtreType = '';
let nomExploitation = 'Ferme Sidi Aidi';

const TYPES = { grosse: 'Charge générale', petite: 'Charge spécifique' };
const UNITES = ['kg', 'g', 'tonne', 'L', 'pièce', 'sac', 'm', 'm²', 'm³', 'boîte', 'carton', 'rouleau', 'paquet'];
const sansAccents = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Same calculation as the server (whole numbers, rounded to the centime): 2,5 × 3,33 = 8,33. */
const totalPetite = (q, p) => Math.round((Math.round(q * 1000) * Math.round(p * 100)) / 1000) / 100;
const quantiteTexte = (c) => (c.type === 'petite'
  ? `${c.quantite.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} ${echapper(c.unite)}`
  : echapper(c.quantiteTexte ?? ''));

// --- Page --------------------------------------------------------------------------------

function tuiles() {
  const r = etat.resume;
  const n = (x, mot) => `${formaterNombre(x)} ${mot}${x > 1 ? 's' : ''}`;
  return `
    <section class="indicateurs">
      <div class="indicateur indicateur-fort">
        <span class="indicateur-libelle">Total du chantier</span>
        <span class="indicateur-valeur">${formaterMontant(r.total)}</span>
        <span class="indicateur-detail">${n(r.nombre, 'charge')}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Charges générales</span>
        <span class="indicateur-valeur">${formaterMontant(r.grosses.total)}</span>
        <span class="indicateur-detail">${n(r.grosses.nombre, 'charge')}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Charges spécifiques</span>
        <span class="indicateur-valeur">${formaterMontant(r.petites.total)}</span>
        <span class="indicateur-detail">${n(r.petites.nombre, 'charge')}</span>
      </div>
    </section>`;
}

function chargesFiltrees() {
  const q = sansAccents(recherche.trim());
  return etat.charges.filter((c) => (!filtreType || c.type === filtreType)
    && (!q || sansAccents(`${c.nom} ${c.description ?? ''}`).includes(q)));
}

function htmlListe() {
  if (!etat.charges.length) {
    return `<div class="etat-vide-charges"><p>Aucune charge pour le moment.</p>
      <p class="texte-discret">Cliquez sur « Charge générale » ou « Charge spécifique ».</p></div>`;
  }
  const liste = chargesFiltrees();
  if (!liste.length) return '<p class="texte-discret">Aucune charge ne correspond aux filtres.</p>';
  const total = Math.round(liste.reduce((t, c) => t + c.montantTotal, 0) * 100) / 100;
  return `
    <div class="defilement-tableau"><table class="tableau tableau-construction">
      <thead>
        <tr>
          <th scope="col">Date</th><th scope="col">Type</th><th scope="col">Charge</th>
          <th scope="col" class="nombre">Quantité</th><th scope="col" class="nombre">Prix</th>
          <th scope="col" class="nombre">Montant total</th><th scope="col">Description</th>
          <th scope="col" class="no-print"><span class="visuellement-cache">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${liste.map((c) => `
          <tr>
            <td>${formaterDate(c.date)}</td>
            <td><span class="badge badge-${c.type}">${TYPES[c.type]}</span></td>
            <td><strong>${echapper(c.nom)}</strong></td>
            <td class="nombre">${quantiteTexte(c)}</td>
            <td class="nombre">${c.prixUnitaire == null ? '—' : `${formaterMontant(c.prixUnitaire)} / ${echapper(c.unite)}`}</td>
            <td class="nombre"><strong>${formaterMontant(c.montantTotal)}</strong></td>
            <td class="cellule-description">${echapper(c.description ?? '')}</td>
            <td class="no-print cellule-menu">
              <button type="button" class="bouton-menu" data-menu="${c.id}" aria-haspopup="menu" aria-label="Actions pour ${echapper(c.nom)}">⋯</button>
            </td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colspan="5">Total${recherche.trim() || filtreType ? ' (filtres)' : ''} — ${liste.length} charge${liste.length > 1 ? 's' : ''}</th>
          <td class="nombre">${formaterMontant(total)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table></div>`;
}

function texteFiltres() {
  const f = [filtreType && (filtreType === 'grosse' ? 'charges générales' : 'charges spécifiques'),
    recherche.trim() && `recherche « ${echapper(recherche.trim())} »`].filter(Boolean);
  return f.length ? `<p class="texte-discret seulement-impression">Filtres : ${f.join(', ')}</p>` : '';
}

function afficher() {
  zone.innerHTML = `
    ${tuiles()}
    <section class="carte" aria-labelledby="titre-liste">
      <h2 id="titre-liste">Liste des charges</h2>
      ${etat.charges.length ? `
      <div class="filtres no-print">
        <label>Type :
          <select id="filtre-type">
            <option value="">Toutes</option>
            <option value="grosse"${filtreType === 'grosse' ? ' selected' : ''}>Charges générales</option>
            <option value="petite"${filtreType === 'petite' ? ' selected' : ''}>Charges spécifiques</option>
          </select>
        </label>
        <label>Rechercher :
          <input id="recherche" type="search" class="champ-recherche" placeholder="Nom ou description" value="${echapper(recherche)}">
        </label>
      </div>` : ''}
      <div id="filtres-impression">${texteFiltres()}</div>
      <div id="liste">${htmlListe()}</div>
    </section>`;
  const maj = () => {
    zone.querySelector('#liste').innerHTML = htmlListe();
    zone.querySelector('#filtres-impression').innerHTML = texteFiltres();
  };
  zone.querySelector('#recherche')?.addEventListener('input', (e) => { recherche = e.target.value; maj(); });
  zone.querySelector('#filtre-type')?.addEventListener('change', (e) => { filtreType = e.target.value; maj(); });
}

// --- Forms ---------------------------------------------------------------------------------

/** Distinct earlier values for the suggestions (first spelling kept). */
function suggestions(cle, base = []) {
  const vus = new Map(base.map((v) => [v.toLowerCase(), v]));
  for (const c of etat.charges) if (c[cle] && !vus.has(c[cle].toLowerCase())) vus.set(c[cle].toLowerCase(), c[cle]);
  return [...vus.values()].map((v) => `<option value="${echapper(v)}"></option>`).join('');
}

function ouvrirFormulaire(type, charge = null) {
  const petite = type === 'petite';
  const v = charge ?? {
    nom: '', date: aujourdhui(), unite: '', quantite: null, quantiteTexte: '', prixUnitaire: null, montantTotal: null, description: '',
  };
  const d = document.createElement('dialog');
  d.className = 'dialogue dialogue-large';
  d.innerHTML = `
    <form method="dialog" novalidate autocomplete="off">
      <h2>${charge ? 'Modifier la ' : ''}${petite ? `${charge ? 'c' : 'C'}harge spécifique` : `${charge ? 'c' : 'C'}harge générale`}${charge ? ` « ${echapper(charge.nom)} »` : ''}</h2>
      <p class="texte-discret">${petite
    ? 'Le total est calculé : quantité × prix par unité.'
    : 'Vous saisissez directement le montant total.'}</p>
      <div class="message"></div>
      <div class="champs-cote">
        <div class="champ">
          <label for="nom">Nom de la charge</label>
          <input id="nom" list="liste-noms" maxlength="100" value="${echapper(v.nom)}" placeholder="${petite ? 'Ex. Ciment, clous, peinture' : 'Ex. Béton, charpente, maçonnerie'}">
          <datalist id="liste-noms">${suggestions('nom')}</datalist>
        </div>
        <div class="champ">
          <label for="date">Date</label>
          <input id="date" type="date" value="${echapper(v.date)}" max="${aujourdhui()}">
        </div>
      </div>
      ${petite ? `
      <div class="champs-trois">
        <div class="champ">
          <label for="unite">Unité</label>
          <input id="unite" list="liste-unites" maxlength="20" value="${echapper(v.unite ?? '')}" placeholder="Ex. kg, L, pièce">
          <datalist id="liste-unites">${suggestions('unite', UNITES)}</datalist>
        </div>
        <div class="champ">
          <label for="quantite">Quantité</label>
          <input id="quantite" inputmode="decimal" value="${echapper(ecrireNombre(v.quantite))}" placeholder="Ex. 12">
        </div>
        <div class="champ">
          <label for="prixUnitaire" data-libelle-prix>Prix par unité (DH)</label>
          <input id="prixUnitaire" inputmode="decimal" value="${echapper(ecrireNombre(v.prixUnitaire))}" placeholder="Ex. 72,50">
        </div>
      </div>
      <p class="total-calcule" data-total>Total : —</p>` : `
      <div class="champs-cote">
        <div class="champ">
          <label for="quantite">Quantité</label>
          <input id="quantite" type="text" maxlength="50" value="${echapper(v.quantiteTexte ?? '')}" placeholder="Ex. 30 kg, 30 m³, 1 lot, 2 camions">
          <span class="aide">Texte libre : chiffres, lettres, unité…</span>
        </div>
        <div class="champ">
          <label for="montantTotal">Montant total (DH)</label>
          <input id="montantTotal" inputmode="decimal" value="${echapper(ecrireNombre(v.montantTotal))}" placeholder="Ex. 45000">
        </div>
      </div>`}
      <div class="champ">
        <label for="description">Description <span class="texte-discret">(facultatif)</span></label>
        <textarea id="description" rows="2" maxlength="500" placeholder="Ex. fournisseur, livraison, partie du bâtiment">${echapper(v.description ?? '')}</textarea>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">${charge ? 'Enregistrer' : 'Confirmer'}</button>
      </div>
    </form>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.querySelector('[data-fermer]').addEventListener('click', () => d.close());
  const form = d.querySelector('form');

  if (petite) {
    const apercu = () => {
      // "Prix par unité" becomes "Prix par kg", "Prix par sac"… with the unit typed.
      d.querySelector('[data-libelle-prix]').textContent = `Prix par ${form.unite.value.trim() || 'unité'} (DH)`;
      const q = lireNombre(form.quantite.value);
      const p = lireNombre(form.prixUnitaire.value);
      const ok = (x) => x != null && Number.isFinite(x) && x > 0;
      const unite = form.unite.value.trim();
      d.querySelector('[data-total]').innerHTML = ok(q) && ok(p)
        ? `Total : ${q.toLocaleString('fr-FR', { maximumFractionDigits: 3 })}${unite ? ` ${echapper(unite)}` : ''} × ${formaterMontant(p)} = <strong>${formaterMontant(totalPetite(q, p))}</strong>`
        : 'Total : —';
    };
    form.addEventListener('input', apercu);
    apercu();
  }

  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    effacerErreursChamps(form);
    form.querySelector('.message').innerHTML = '';
    const champs = {};
    const lire = (cle, exemple) => {
      const n = lireNombre(form[cle].value);
      if (Number.isNaN(n)) champs[cle] = `Saisissez un nombre (ex. ${exemple}).`;
      return n;
    };
    const corps = {
      type,
      nom: form.nom.value,
      date: form.date.value,
      quantite: petite ? lire('quantite', '12 ou 2,5') : form.quantite.value,
      description: form.description.value,
    };
    if (petite) {
      corps.unite = form.unite.value;
      corps.prixUnitaire = lire('prixUnitaire', '72,50');
    } else {
      corps.montantTotal = lire('montantTotal', '45000');
    }
    if (Object.keys(champs).length) { afficherErreursChamps(form, champs); return; }
    const bouton = form.querySelector('[type="submit"]');
    bouton.disabled = true;
    try {
      const resultat = charge
        ? await api.put(`/construction/charges/${charge.id}`, corps)
        : await api.post('/construction/charges', corps);
      etat = resultat;
      afficher();
      d.close();
      const c = resultat.charge;
      afficherSucces(message, charge
        ? `${TYPES[c.type]} « ${c.nom} » modifiée : ${formaterMontant(c.montantTotal)}.`
        : `${TYPES[c.type]} « ${c.nom} » ajoutée : ${formaterMontant(c.montantTotal)}.`);
    } catch (e) {
      if (e.details && !e.details.contrainte) afficherErreursChamps(form, e.details);
      else afficherErreur(form.querySelector('.message'), e);
      bouton.disabled = false;
    }
  });
  d.showModal();
  form.nom.focus();
}

// --- Print one charge -------------------------------------------------------------------

function htmlFiche(c) {
  const petite = c.type === 'petite';
  return `
    <div class="recu">
      <div class="recu-entete">
        <strong>${echapper(nomExploitation)}</strong>
        <span>Construction de la nouvelle ferme — ${formaterDate(c.date)}</span>
      </div>
      <h2>${TYPES[c.type]} : ${echapper(c.nom)}</h2>
      <dl class="liste-cles">
        <dt>Type</dt><dd>${TYPES[c.type]}</dd>
        <dt>Nom de la charge</dt><dd>${echapper(c.nom)}</dd>
        <dt>Date</dt><dd>${formaterDate(c.date)}</dd>
        ${petite ? `
        <dt>Unité</dt><dd>${echapper(c.unite)}</dd>
        <dt>Quantité</dt><dd>${quantiteTexte(c)}</dd>
        <dt>Prix par ${echapper(c.unite)}</dt><dd>${formaterMontant(c.prixUnitaire)}</dd>` : `
        <dt>Quantité</dt><dd>${quantiteTexte(c)}</dd>`}
        ${c.description ? `<dt>Description</dt><dd>${echapper(c.description)}</dd>` : ''}
      </dl>
      <p class="facture-total">Montant total : <strong>${formaterMontant(c.montantTotal)}</strong>${petite
    ? ` <span class="texte-discret">(${quantiteTexte(c)} × ${formaterMontant(c.prixUnitaire)})</span>` : ''}</p>
    </div>`;
}

function imprimerCharge(c) {
  const zoneRecu = document.getElementById('zone-recu');
  zoneRecu.innerHTML = htmlFiche(c);
  zoneRecu.hidden = false;
  document.body.classList.add('impression-recu');
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('impression-recu');
    zoneRecu.hidden = true;
    zoneRecu.innerHTML = '';
  }, { once: true });
  window.print();
}

// --- "⋯" menu: Imprimer, Modifier, Supprimer ------------------------------------------------

const ACTIONS = [['imprimer', 'Imprimer'], ['modifier', 'Modifier'], ['supprimer', 'Supprimer']];

function fermerMenu() {
  document.querySelector('.menu-actions')?.remove();
  document.querySelector('[data-menu][aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
}

function ouvrirMenu(bouton) {
  fermerMenu();
  const c = etat.charges.find((x) => x.id === Number(bouton.dataset.menu));
  const menu = document.createElement('ul');
  menu.className = 'menu-actions';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = ACTIONS.map(([action, libelle]) => `
    <li role="none"><button type="button" role="menuitem" data-action="${action}"
      class="${action === 'supprimer' ? 'action-danger' : ''}">${libelle}</button></li>`).join('');
  document.body.append(menu);
  const r = bouton.getBoundingClientRect();
  // Below the button if it fits on the screen, otherwise above it.
  const enBas = r.bottom + 4 + menu.offsetHeight <= window.innerHeight - 8 || r.top - 4 - menu.offsetHeight < 8;
  menu.style.top = `${(enBas ? r.bottom + 4 : r.top - 4 - menu.offsetHeight) + window.scrollY}px`;
  menu.style.left = `${Math.max(8, r.right + window.scrollX - menu.offsetWidth)}px`;
  bouton.setAttribute('aria-expanded', 'true');
  menu.querySelector('button').focus();
  menu.addEventListener('click', (evt) => {
    const action = evt.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    fermerMenu();
    if (action === 'imprimer') imprimerCharge(c);
    else if (action === 'modifier') ouvrirFormulaire(c.type, c);
    else supprimer(c);
  });
  menu.addEventListener('keydown', (evt) => {
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (evt.key === 'ArrowDown') { evt.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (evt.key === 'ArrowUp') { evt.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (evt.key === 'Escape') { fermerMenu(); bouton.focus(); }
  });
}

document.addEventListener('click', (evt) => {
  const bouton = evt.target.closest('[data-menu]');
  if (bouton) { evt.stopPropagation(); ouvrirMenu(bouton); return; }
  if (!evt.target.closest('.menu-actions')) fermerMenu();
});

async function supprimer(c) {
  const nouvel = await confirmerAvecMotDePasse({
    titre: `Supprimer la charge « ${c.nom} » ?`,
    avertissement: `${TYPES[c.type]} du ${formaterDate(c.date)} — ${formaterMontant(c.montantTotal)}. Cette action est irréversible.`,
    bouton: 'Supprimer la charge',
    action: (motDePasse) => api.supprimer(`/construction/charges/${c.id}`, { motDePasse }),
  });
  if (!nouvel) return;
  etat = nouvel;
  afficher();
  afficherSucces(message, `Charge « ${c.nom} » du ${formaterDate(c.date)} supprimée.`);
}

// --- Start ------------------------------------------------------------------------------

monterLayout({ titre: 'Construction de la nouvelle ferme' });
document.getElementById('bouton-grosse').addEventListener('click', () => ouvrirFormulaire('grosse'));
document.getElementById('bouton-petite').addEventListener('click', () => ouvrirFormulaire('petite'));
document.getElementById('bouton-imprimer-page').addEventListener('click', () => window.print());

try {
  etat = await api.get('/construction');
  api.get('/auth/etat').then((x) => { nomExploitation = x.nomExploitation; }).catch(() => {});
  document.getElementById('bouton-grosse').disabled = false;
  document.getElementById('bouton-petite').disabled = false;
  afficher();
} catch (e) {
  zone.innerHTML = '';
  afficherErreur(message, e);
}
