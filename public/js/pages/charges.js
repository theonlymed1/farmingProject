// Charges (?bande=…): declare, edit, delete (password) and print the Bande's purchases and services.
// The form suggests sellers, then that seller's product types and products, from earlier charges.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import {
  formaterDate, formaterMontant, formaterNombre, aujourdhui,
} from '../format.js';
import { imprimerHtml, nomExploitation } from '../impression.js';
import {
  echapper, afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, confirmerAvecMotDePasse,
} from '../ui.js';
import {
  lireNombre, ecrireNombre, quantite, tuilesCharges, tableauParType,
} from '../charges-commun.js';

const bandeId = Number(new URLSearchParams(location.search).get('bande'));
const zone = document.getElementById('contenu-charges');
const message = document.getElementById('message');
let etat = null; // { bande, charges, resume }
const filtre = { type: '', produit: '' }; // lower-case keys; '' = all

const cle = (texte) => String(texte ?? '').trim().toLowerCase();

// --- List ---------------------------------------------------------------------------

function chargesFiltrees() {
  return etat.charges.filter((c) => (!filtre.type || cle(c.typeProduit) === filtre.type)
    && (!filtre.produit || cle(c.produit) === filtre.produit));
}

/** Distinct values (first spelling kept), sorted. */
function distincts(valeurs) {
  const vus = new Map();
  for (const v of valeurs) if (!vus.has(cle(v))) vus.set(cle(v), v);
  return [...vus.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Quantities added up per unit: "70 L", "130 sacs + 20" (no unit). null when none was given. */
function quantiteTotale(liste) {
  const parUnite = new Map();
  for (const c of liste) {
    if (c.quantite == null) continue;
    const k = cle(c.unite);
    const u = parUnite.get(k) ?? { unite: c.unite ?? '', total: 0 };
    u.total = Math.round((u.total + c.quantite) * 1000) / 1000;
    parUnite.set(k, u);
  }
  if (!parUnite.size) return null;
  return [...parUnite.values()]
    .map((u) => `${formaterNombre(u.total)}${u.unite ? ` ${echapper(u.unite)}` : ''}`).join(' + ');
}

/** Average price per unit of one product, from the charges that have both a quantity and a price. */
function prixMoyen(liste) {
  const unites = new Set(liste.filter((c) => c.quantite != null).map((c) => cle(c.unite)));
  if (unites.size !== 1) return null;
  const chiffrees = liste.filter((c) => c.quantite > 0 && c.prixTotal != null);
  const q = chiffrees.reduce((t, c) => t + c.quantite, 0);
  if (!q) return null;
  const unite = chiffrees[0].unite;
  return `${formaterMontant(chiffrees.reduce((t, c) => t + c.prixTotal, 0) / q)} ${unite ? `/ ${echapper(unite)}` : 'par unité'}`;
}

/** Totals of the chosen type or product, above the list. */
function htmlResumeFiltre(liste) {
  if (!filtre.type && !filtre.produit) return '';
  const total = liste.reduce((t, c) => t + (c.prixTotal ?? 0), 0);
  const sansPrix = liste.filter((c) => c.prixTotal == null).length;
  const sansQuantite = liste.filter((c) => c.quantite == null).length;
  const quantite = quantiteTotale(liste);
  const moyen = filtre.produit ? prixMoyen(liste) : null;
  const nom = filtre.produit ? liste[0]?.produit : liste[0]?.typeProduit;
  return `
    <div class="resume-filtre">
      <h3>${filtre.produit ? 'Produit' : 'Type'} « ${echapper(nom ?? '')} »${filtre.produit && liste[0]
    ? ` <span class="texte-discret">(${echapper(liste[0].typeProduit)})</span>` : ''}</h3>
      <dl class="chiffres-filtre">
        <div><dt>Achats</dt><dd>${formaterNombre(liste.length)}</dd></div>
        <div><dt>Quantité totale</dt><dd>${quantite ?? '—'}${sansQuantite && quantite
    ? ` <small>(${sansQuantite} sans quantité)</small>` : ''}</dd></div>
        <div><dt>Montant total</dt><dd>${formaterMontant(total)}${sansPrix
    ? ` <small>(${sansPrix} prix à saisir)</small>` : ''}</dd></div>
        ${moyen ? `<div><dt>Prix moyen</dt><dd>${moyen}</dd></div>` : ''}
      </dl>
    </div>`;
}

function htmlListe() {
  const liste = chargesFiltrees();
  if (!etat.charges.length) {
    return `<div class="etat-vide-charges"><p>Aucune charge pour le moment.</p>
      <p class="texte-discret">Cliquez sur « Déclarer une charge » pour enregistrer un achat ou un service.</p></div>`;
  }
  if (!liste.length) return '<p class="texte-discret">Aucune charge ne correspond au filtre.</p>';
  const totalFiltre = liste.reduce((t, c) => t + (c.prixTotal ?? 0), 0);
  const filtreActif = Boolean(filtre.type || filtre.produit);
  return `
    ${htmlResumeFiltre(liste)}
    <table class="tableau tableau-charges">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Vendeur</th>
          <th scope="col">Type</th>
          <th scope="col">Produit / service</th>
          <th scope="col" class="nombre">Quantité</th>
          <th scope="col" class="nombre">Prix total</th>
          <th scope="col">Description</th>
          <th scope="col" class="no-print"><span class="visuellement-cache">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${liste.map((c) => `
          <tr class="${c.prixTotal == null ? 'ligne-sans-prix' : ''}">
            <td>${formaterDate(c.date)}</td>
            <td>${echapper(c.vendeur)}</td>
            <td>${echapper(c.typeProduit)}</td>
            <td>${echapper(c.produit)}</td>
            <td class="nombre">${quantite(c)}</td>
            <td class="nombre">${c.prixTotal == null ? '<span class="badge badge-sans-prix">Prix à saisir</span>' : formaterMontant(c.prixTotal)}</td>
            <td class="cellule-description">${echapper(c.description ?? '')}</td>
            <td class="no-print actions-ligne">
              <button type="button" class="bouton-lien" data-imprimer="${c.id}">Imprimer</button>
              <button type="button" class="bouton-lien" data-modifier="${c.id}">Modifier</button>
              <button type="button" class="bouton-lien bouton-lien-danger" data-supprimer="${c.id}">Supprimer</button>
            </td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colspan="4">Total${filtreActif ? ' (filtre)' : ''} — ${liste.length} charge${liste.length > 1 ? 's' : ''}</th>
          <td class="nombre">${filtreActif ? quantiteTotale(liste) ?? '' : ''}</td>
          <td class="nombre">${formaterMontant(totalFiltre)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>`;
}

function optionsProduits(types) {
  // A type is chosen: its products. No type: every product, grouped by type.
  const groupes = (filtre.type ? types.filter((t) => cle(t) === filtre.type) : types).map((type) => ({
    type,
    produits: distincts(etat.charges.filter((c) => cle(c.typeProduit) === cle(type)).map((c) => c.produit)),
  }));
  const option = (type, p) => `<option value="${echapper(`${cle(type)}\u0001${cle(p)}`)}"${cle(p) === filtre.produit
    && cle(type) === filtre.type ? ' selected' : ''}>${echapper(p)}</option>`;
  return `<option value="">Tous les produits</option>${filtre.type
    ? groupes[0]?.produits.map((p) => option(groupes[0].type, p)).join('') ?? ''
    : groupes.map((g) => `<optgroup label="${echapper(g.type)}">${g.produits.map((p) => option(g.type, p)).join('')}</optgroup>`).join('')}`;
}

function afficher() {
  const types = distincts(etat.charges.map((c) => c.typeProduit));
  // A filter on something that no longer exists (deleted, renamed) is dropped.
  if (filtre.type && !types.some((t) => cle(t) === filtre.type)) { filtre.type = ''; filtre.produit = ''; }
  if (filtre.produit && !chargesFiltrees().length) filtre.produit = '';
  const nomType = types.find((t) => cle(t) === filtre.type);
  const nomProduit = filtre.produit && etat.charges.find((c) => cle(c.produit) === filtre.produit)?.produit;
  const descriptionFiltre = [nomType && `type « ${nomType} »`, nomProduit && `produit « ${nomProduit} »`]
    .filter(Boolean).join(', ');

  zone.innerHTML = `
    ${tuilesCharges(etat.resume)}

    <section class="carte" aria-labelledby="titre-types">
      <h2 id="titre-types">Par type de produit</h2>
      ${tableauParType(etat.resume)}
    </section>

    <section class="carte" aria-labelledby="titre-liste">
      <div class="titre-section">
        <h2 id="titre-liste">Liste des charges</h2>
        ${descriptionFiltre ? `<span class="texte-discret seulement-impression">Filtre : ${echapper(descriptionFiltre)}</span>` : ''}
      </div>
      ${etat.charges.length ? `
      <div class="filtres no-print">
        <label>Type :
          <select id="filtre-type">
            <option value="">Tous les types</option>
            ${types.map((t) => `<option value="${echapper(cle(t))}"${cle(t) === filtre.type ? ' selected' : ''}>${echapper(t)}</option>`).join('')}
          </select>
        </label>
        <label>Produit :
          <select id="filtre-produit">${optionsProduits(types)}</select>
        </label>
      </div>` : ''}
      <div id="liste">${htmlListe()}</div>
    </section>`;

  // Re-render everything so the printed "Filtre : …" line always matches the list.
  zone.querySelector('#filtre-type')?.addEventListener('change', (e) => {
    filtre.type = e.target.value;
    filtre.produit = '';
    afficher();
  });
  zone.querySelector('#filtre-produit')?.addEventListener('change', (e) => {
    const [type = '', produit = ''] = e.target.value.split('\u0001');
    filtre.produit = produit;
    if (produit) filtre.type = type; // chosen from "all types": the type follows
    afficher();
  });
}

// --- Print one charge -----------------------------------------------------------------

function htmlFicheCharge(c) {
  return `
    <div class="recu">
      <div class="recu-entete">
        <strong>${echapper(nomExploitation())}</strong>
        <span>Charge — bande « ${echapper(etat.bande.nom)} »</span>
      </div>
      <h2>${echapper(c.produit)}</h2>
      <dl class="liste-cles">
        <dt>Date</dt><dd>${formaterDate(c.date)}</dd>
        <dt>Vendeur</dt><dd>${echapper(c.vendeur)}</dd>
        <dt>Type de produit</dt><dd>${echapper(c.typeProduit)}</dd>
        <dt>Produit ou service</dt><dd>${echapper(c.produit)}</dd>
        ${c.quantite == null ? '' : `<dt>Quantité</dt><dd>${quantite(c)}</dd>`}
        ${c.description ? `<dt>Description</dt><dd>${echapper(c.description)}</dd>` : ''}
      </dl>
      <p class="facture-total">Prix total : <strong>${c.prixTotal == null ? 'à saisir' : formaterMontant(c.prixTotal)}</strong></p>
    </div>`;
}

// --- Form (add / edit) with suggestions ---------------------------------------------------

const optionsListe = (valeurs) => valeurs.map((v) => `<option value="${echapper(v)}"></option>`).join('');

async function ouvrirFormulaire(charge = null) {
  const v = charge ?? {
    date: aujourdhui(), vendeur: '', typeProduit: '', produit: '', quantite: null, unite: '', prixTotal: null, description: '',
  };
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue dialogue-large';
  dialogue.innerHTML = `
    <form method="dialog" novalidate autocomplete="off">
      <h2>${charge ? 'Modifier la charge' : 'Déclarer une charge'}</h2>
      <div class="message"></div>
      <div class="champ">
        <label for="vendeur">Vendeur</label>
        <input id="vendeur" list="liste-vendeurs" maxlength="80" value="${echapper(v.vendeur)}" placeholder="Ex. Alf Sahel">
        <datalist id="liste-vendeurs"></datalist>
      </div>
      <div class="champs-cote">
        <div class="champ">
          <label for="typeProduit">Type de produit</label>
          <input id="typeProduit" list="liste-types" maxlength="60" value="${echapper(v.typeProduit)}" placeholder="Ex. Aliment, Gaz, Vaccin">
          <datalist id="liste-types"></datalist>
        </div>
        <div class="champ">
          <label for="produit">Produit ou service</label>
          <input id="produit" list="liste-produits" maxlength="100" value="${echapper(v.produit)}" placeholder="Ex. Aliment démarrage">
          <datalist id="liste-produits"></datalist>
        </div>
      </div>
      <div class="champs-cote">
        <div class="champ">
          <label for="quantite">Quantité <span class="texte-discret">(facultatif)</span></label>
          <input id="quantite" inputmode="decimal" value="${echapper(ecrireNombre(v.quantite))}" placeholder="Ex. 50">
        </div>
        <div class="champ">
          <label for="unite">Unité <span class="texte-discret">(kg, L, sacs…)</span></label>
          <input id="unite" list="liste-unites" maxlength="20" value="${echapper(v.unite ?? '')}" placeholder="Ex. sacs">
          <datalist id="liste-unites"></datalist>
        </div>
      </div>
      <div class="champs-cote">
        <div class="champ">
          <label for="prixTotal">Prix total (DH) <span class="texte-discret">(facultatif)</span></label>
          <input id="prixTotal" inputmode="decimal" value="${echapper(ecrireNombre(v.prixTotal))}" placeholder="Ex. 7500">
          <span class="aide">Laissez vide si le prix n’est pas encore connu ou payé : il ne compte pas dans les totaux tant qu’il est vide.</span>
        </div>
        <div class="champ">
          <label for="date">Date</label>
          <input id="date" type="date" value="${echapper(v.date)}">
        </div>
      </div>
      <div class="champ">
        <label for="description">Description <span class="texte-discret">(facultatif)</span></label>
        <textarea id="description" rows="2" maxlength="500" placeholder="Ex. Prix convenu 4 200 DH la tonne, à payer fin du mois">${echapper(v.description ?? '')}</textarea>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">${charge ? 'Enregistrer' : 'Déclarer la charge'}</button>
      </div>
    </form>`;
  document.body.append(dialogue);
  const form = dialogue.querySelector('form');
  dialogue.querySelector('[data-fermer]').addEventListener('click', () => dialogue.close());

  // Suggestions: all sellers; types and products of the chosen seller first.
  let produitsConnus = [];
  let dernierVendeur = null;
  async function chargerSuggestions() {
    const vendeur = form.vendeur.value.trim();
    if (vendeur.toLowerCase() === dernierVendeur) return;
    dernierVendeur = vendeur.toLowerCase();
    try {
      const s = await api.get(`/charges/suggestions?vendeur=${encodeURIComponent(vendeur)}`);
      produitsConnus = s.produits;
      dialogue.querySelector('#liste-vendeurs').innerHTML = optionsListe(s.vendeurs);
      dialogue.querySelector('#liste-types').innerHTML = optionsListe(s.types);
      dialogue.querySelector('#liste-produits').innerHTML = optionsListe(s.produits.map((p) => p.produit));
      dialogue.querySelector('#liste-unites').innerHTML = optionsListe(s.unites);
    } catch { /* suggestions are a help, never a blocker */ }
  }
  let minuteur = null;
  form.vendeur.addEventListener('input', () => { clearTimeout(minuteur); minuteur = setTimeout(chargerSuggestions, 250); });
  form.vendeur.addEventListener('change', chargerSuggestions);
  // A known product fills in its usual type and unit (only if those are still empty).
  form.produit.addEventListener('change', () => {
    const p = produitsConnus.find((x) => x.produit.toLowerCase() === form.produit.value.trim().toLowerCase());
    if (!p) return;
    if (!form.typeProduit.value.trim()) form.typeProduit.value = p.typeProduit;
    if (!form.unite.value.trim() && p.unite) form.unite.value = p.unite;
  });
  chargerSuggestions();

  return new Promise((resoudre) => {
    let resultat = null;
    dialogue.addEventListener('close', () => { dialogue.remove(); resoudre(resultat); });
    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      effacerErreursChamps(form);
      form.querySelector('.message').innerHTML = '';
      const champs = {};
      const q = lireNombre(form.quantite.value);
      const prix = lireNombre(form.prixTotal.value);
      if (Number.isNaN(q)) champs.quantite = 'La quantité doit être un nombre (ex. 50 ou 2,5).';
      if (Number.isNaN(prix)) champs.prixTotal = 'Le prix doit être un nombre (ex. 7500 ou 7 500,50).';
      if (Object.keys(champs).length) { afficherErreursChamps(form, champs); return; }

      const corps = {
        date: form.date.value,
        vendeur: form.vendeur.value,
        typeProduit: form.typeProduit.value,
        produit: form.produit.value,
        quantite: q,
        unite: form.unite.value,
        prixTotal: prix,
        description: form.description.value,
      };
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;
      try {
        resultat = charge
          ? await api.put(`/bandes/${bandeId}/charges/${charge.id}`, corps)
          : await api.post(`/bandes/${bandeId}/charges`, corps);
        dialogue.close();
      } catch (e) {
        if (e.details && !e.details.contrainte) afficherErreursChamps(form, e.details);
        else afficherErreur(form.querySelector('.message'), e);
        bouton.disabled = false;
      }
    });
    dialogue.showModal();
    (charge ? form.prixTotal : form.vendeur).focus();
  });
}

// --- Actions ------------------------------------------------------------------------

document.getElementById('bouton-ajouter').addEventListener('click', async () => {
  const nouvel = await ouvrirFormulaire();
  if (!nouvel) return;
  etat = nouvel;
  afficher();
  const c = etat.charges.reduce((a, b) => (b.id > a.id ? b : a)); // the one just added
  afficherSucces(message, `Charge déclarée : ${c.produit} chez ${c.vendeur}${c.prixTotal == null ? ' (prix à saisir)' : ''}.`);
});

zone.addEventListener('click', async (evt) => {
  const impr = evt.target.closest('[data-imprimer]');
  if (impr) {
    imprimerHtml(htmlFicheCharge(etat.charges.find((c) => c.id === Number(impr.dataset.imprimer))));
    return;
  }
  const modif = evt.target.closest('[data-modifier]');
  const suppr = evt.target.closest('[data-supprimer]');
  if (!modif && !suppr) return;
  const charge = etat.charges.find((c) => c.id === Number((modif ?? suppr).dataset[modif ? 'modifier' : 'supprimer']));
  if (modif) {
    const nouvel = await ouvrirFormulaire(charge);
    if (!nouvel) return;
    etat = nouvel;
    afficher();
    afficherSucces(message, 'Charge modifiée.');
    return;
  }
  const nouvel = await confirmerAvecMotDePasse({
    titre: 'Supprimer cette charge ?',
    avertissement: `${charge.produit} chez ${charge.vendeur}, le ${formaterDate(charge.date)}`
      + `${charge.prixTotal == null ? '' : ` — ${formaterMontant(charge.prixTotal)}`}. Cette action est irréversible.`,
    bouton: 'Supprimer la charge',
    action: (motDePasse) => api.supprimer(`/bandes/${bandeId}/charges/${charge.id}`, { motDePasse }),
  });
  if (!nouvel) return;
  etat = nouvel;
  afficher();
  afficherSucces(message, 'Charge supprimée.');
});

document.getElementById('bouton-imprimer-page').addEventListener('click', () => window.print());

try {
  if (!Number.isInteger(bandeId) || bandeId <= 0) throw new Error('Bande introuvable. Revenez à la liste des bandes.');
  etat = await api.get(`/bandes/${bandeId}/charges`);
  monterLayout({ titre: `Charges — ${etat.bande.nom}`, bande: etat.bande });
  document.getElementById('sous-titre').textContent = `${etat.bande.nom} · début le ${formaterDate(etat.bande.dateDebut)}`;
  document.getElementById('bouton-ajouter').disabled = false;
  afficher();
} catch (e) {
  monterLayout({ titre: 'Charges' });
  zone.innerHTML = '<p><a href="/pages/bandes.html">← Retour à la liste des bandes</a></p>';
  afficherErreur(message, e);
}
