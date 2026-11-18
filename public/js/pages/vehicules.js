// Véhicules (?bande=…): the work cars of the Bande. "+ Ajouter un véhicule" (name, model, plate),
// then from the "⋯" menu: declare a charge (a vidange asks the mileage and the next one), declare one
// of the 4 documents (visite, vignette, assurance, carte grise) with its validity, see the documents
// and when they expire, see the car's information and charges (printable), or delete the car.
// Every amount counts in the cost of the Bande.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import {
  formaterDate, formaterMontant, formaterNombre, aujourdhui,
} from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, confirmerAvecMotDePasse,
} from '../ui.js';
import { lireNombre, ecrireNombre } from '../charges-commun.js';

const bandeId = Number(new URLSearchParams(location.search).get('bande'));
const zone = document.getElementById('contenu-vehicules');
const message = document.getElementById('message');
let etat = null; // { bande, vehicules, resume }
let nomExploitation = 'Ferme Sidi Aidi';

const pluriel = (n, mot) => `${formaterNombre(n)} ${mot}${n > 1 ? 's' : ''}`;
const titreVehicule = (v) => `${v.nom} — ${v.modele}`;
const formaterKm = (km) => `${formaterNombre(km)} km`;

// Same list and defaults as the server (modules/vehicules/service.js).
const DOCUMENTS = {
  visite: { libelle: 'Visite technique', dureeMois: 12 },
  vignette: { libelle: 'Vignette', dureeMois: 12 },
  assurance: { libelle: 'Assurance', dureeMois: 12 },
  carte_grise: { libelle: 'Carte grise', dureeMois: 120 },
};
/** 12 → '1 an', 120 → '10 ans', 6 → '6 mois' */
const dureeTexte = (mois) => (mois % 12 === 0 ? `${mois / 12} an${mois > 12 ? 's' : ''}` : `${mois} mois`);
/** '2026-11-18' + 12 months → '2027-11-18' (31/01 + 1 month → 28/02 or 29/02, like the server). */
function ajouterMois(iso, mois) {
  const [a, m, j] = iso.split('-').map(Number);
  const fin = new Date(Date.UTC(a, m - 1 + mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + mois, Math.min(j, fin))).toISOString().slice(0, 10);
}
/** Badge: Valide / Expire dans 5 jours / Expiré depuis 35 jours / Non déclaré. */
function badgeDocument(d) {
  if (!d) return '<span class="badge badge-doc-absent">Non déclaré</span>';
  if (d.statut === 'expire') {
    const n = -d.joursRestants;
    return `<span class="badge badge-doc-expire">Expiré${n ? ` depuis ${pluriel(n, 'jour')}` : ''}</span>`;
  }
  if (d.statut === 'bientot') {
    return `<span class="badge badge-doc-bientot">${d.joursRestants === 0 ? 'Expire aujourd’hui' : `Expire dans ${pluriel(d.joursRestants, 'jour')}`}</span>`;
  }
  return '<span class="badge badge-doc-valide">Valide</span>';
}
/** Small detail under a charge's name: mileage of a vidange, validity of a document. */
function detailCharge(c) {
  if (c.categorie === 'vidange') return `à ${formaterKm(c.kilometrage)} · prochaine vidange à ${formaterKm(c.prochaineKm)}`;
  if (DOCUMENTS[c.categorie]) return `valable ${dureeTexte(c.dureeMois)} · expire le ${formaterDate(c.expireLe)}`;
  return '';
}

// --- Page --------------------------------------------------------------------------------

function tuiles() {
  const r = etat.resume;
  return `
    <section class="indicateurs">
      <div class="indicateur">
        <span class="indicateur-libelle">Véhicules</span>
        <span class="indicateur-valeur">${formaterNombre(r.nombre)}</span>
        <span class="indicateur-detail">dans cette bande</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Charges déclarées</span>
        <span class="indicateur-valeur">${formaterNombre(r.nombreCharges)}</span>
        <span class="indicateur-detail">vidange, pneus, carburant…</span>
      </div>
      <div class="indicateur indicateur-fort">
        <span class="indicateur-libelle">Total des charges des véhicules</span>
        <span class="indicateur-valeur">${formaterMontant(r.total)}</span>
        <span class="indicateur-detail">compté dans le coût de la bande</span>
      </div>
    </section>`;
}

function htmlListe() {
  if (!etat.vehicules.length) {
    return `<div class="etat-vide-charges"><p>Aucun véhicule pour le moment.</p>
      <p class="texte-discret">Cliquez sur « Ajouter un véhicule ».</p></div>`;
  }
  return `
    <div class="defilement-tableau"><table class="tableau tableau-vehicules">
      <thead>
        <tr>
          <th scope="col">Nom</th><th scope="col">Modèle</th><th scope="col">Matricule</th>
          <th scope="col" class="nombre">Total des charges</th>
          <th scope="col" class="no-print"><span class="visuellement-cache">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${etat.vehicules.map((v) => `
          <tr>
            <th scope="row">${echapper(v.nom)}
              <span class="detail-vehicule">${v.vidange
    ? `Prochaine vidange à <strong>${formaterKm(v.vidange.prochaineKm)}</strong>`
    : 'Aucune vidange déclarée'}</span>
              ${v.alertes.map((a) => `<span class="badge badge-doc-${a.statut}">${echapper(a.libelle)} : ${a.statut === 'expire'
    ? 'expiré' : `expire dans ${pluriel(a.joursRestants, 'jour')}`}</span>`).join(' ')}
            </th>
            <td>${echapper(v.modele)}</td>
            <td><span class="matricule">${echapper(v.matricule)}</span></td>
            <td class="nombre">${formaterMontant(v.totalCharges)}</td>
            <td class="no-print cellule-menu">
              <button type="button" class="bouton-menu" data-menu="${v.id}" aria-haspopup="menu" aria-label="Actions pour ${echapper(v.nom)}">⋯</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table></div>`;
}

const boutonCharge = (v, c) => `<button type="button" class="bouton-menu" data-menu-charge="${v.id}:${c.id}"
  aria-haspopup="menu" aria-label="Actions pour ${echapper(c.libelle)} du ${formaterDate(c.date)}">⋯</button>`;

/** Every charge of every car, newest first (on screen and on paper). */
function htmlToutesCharges() {
  const lignes = etat.vehicules.flatMap((v) => v.charges.map((c) => ({ ...c, vehicule: v })))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  if (!lignes.length) return '<p class="texte-discret">Aucune charge déclarée. Utilisez le menu « ⋯ » d’un véhicule → « Déclarer une charge ».</p>';
  return `
    <div class="defilement-tableau"><table class="tableau">
      <thead>
        <tr><th scope="col">Date</th><th scope="col">Véhicule</th><th scope="col">Charge</th>
          <th scope="col">Description</th><th scope="col" class="nombre">Montant</th>
          <th scope="col" class="no-print"><span class="visuellement-cache">Actions</span></th></tr>
      </thead>
      <tbody>
        ${lignes.map((c) => `
          <tr>
            <td>${formaterDate(c.date)}</td>
            <td>${echapper(c.vehicule.nom)} <span class="texte-discret">(${echapper(c.vehicule.matricule)})</span></td>
            <td>${echapper(c.libelle)}${detailCharge(c) ? `<br><span class="texte-discret">${detailCharge(c)}</span>` : ''}</td>
            <td class="cellule-description">${echapper(c.description ?? '')}</td>
            <td class="nombre">${formaterMontant(c.montant)}</td>
            <td class="no-print cellule-menu">${boutonCharge(c.vehicule, c)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><th scope="row" colspan="4">Total</th><td class="nombre">${formaterMontant(etat.resume.total)}</td><td class="no-print"></td></tr>
      </tfoot>
    </table></div>`;
}

function afficher() {
  zone.innerHTML = `
    ${tuiles()}
    <section class="carte" aria-labelledby="titre-liste">
      <h2 id="titre-liste">Liste des véhicules</h2>
      ${htmlListe()}
    </section>
    <section class="carte" aria-labelledby="titre-charges">
      <h2 id="titre-charges">Charges des véhicules</h2>
      ${htmlToutesCharges()}
    </section>`;
}

// --- "⋯" menu ----------------------------------------------------------------------------

const ACTIONS = [
  ['charge', 'Déclarer une charge'],
  ['document', 'Déclarer un document'],
  ['documents', 'Voir les documents'],
  ['infos', 'Informations du véhicule'],
  ['supprimer', 'Supprimer le véhicule'],
];

function fermerMenu() {
  document.querySelector('.menu-actions')?.remove();
  document.querySelector('[data-menu][aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
}

/** "⋯" menu under (or above) the button; `surAction(action)` runs the chosen one. */
function ouvrirMenuActions(bouton, actions, surAction) {
  fermerMenu();
  const menu = document.createElement('ul');
  menu.className = 'menu-actions';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = actions.map(([action, libelle]) => `
    <li role="none"><button type="button" role="menuitem" data-action="${action}"
      class="${action === 'supprimer' ? 'action-danger' : ''}">${libelle}</button></li>`).join('');
  // Inside an open dialog (the car sheet) the menu must be in that dialog, or it would stay behind it;
  // there it is fixed to the screen (the page behind a dialog doesn't scroll).
  const dans = bouton.closest('dialog');
  (dans ?? document.body).append(menu);
  const r = bouton.getBoundingClientRect();
  const decalageY = dans ? 0 : window.scrollY;
  const decalageX = dans ? 0 : window.scrollX;
  if (dans) menu.style.position = 'fixed';
  // Below the button if it fits on the screen, otherwise above it: no scrolling to see the last options.
  const enBas = r.bottom + 4 + menu.offsetHeight <= window.innerHeight - 8 || r.top - 4 - menu.offsetHeight < 8;
  menu.style.top = `${(enBas ? r.bottom + 4 : r.top - 4 - menu.offsetHeight) + decalageY}px`;
  menu.style.left = `${Math.max(8, r.right + decalageX - menu.offsetWidth)}px`;
  bouton.setAttribute('aria-expanded', 'true');
  menu.querySelector('button').focus();

  menu.addEventListener('click', (evt) => {
    const action = evt.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    fermerMenu();
    surAction(action);
  });
  menu.addEventListener('keydown', (evt) => {
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (evt.key === 'ArrowDown') { evt.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (evt.key === 'ArrowUp') { evt.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (evt.key === 'Escape') { fermerMenu(); bouton.focus(); }
  });
}

function ouvrirMenu(bouton) {
  const vehicule = etat.vehicules.find((v) => v.id === Number(bouton.dataset.menu));
  ouvrirMenuActions(bouton, ACTIONS, (action) => ({
    charge: declarerCharge, document: declarerDocument, documents: voirDocuments, infos: voirInfos, supprimer: supprimerVehicule,
  })[action](vehicule));
}

const ACTIONS_CHARGE = [['modifier', 'Modifier'], ['supprimer', 'Supprimer']];

/** "⋯" of one charge: data-menu-charge="<car id>:<charge id>". */
function ouvrirMenuCharge(bouton) {
  const [vid, cid] = bouton.dataset.menuCharge.split(':').map(Number);
  const vehicule = etat.vehicules.find((v) => v.id === vid);
  const charge = vehicule.charges.find((c) => c.id === cid);
  const fiche = bouton.closest('dialog');
  ouvrirMenuActions(bouton, ACTIONS_CHARGE, async (action) => {
    if (action === 'modifier') {
      fiche?.close();
      if (DOCUMENTS[charge.categorie]) declarerDocument(vehicule, charge.categorie, charge);
      else declarerCharge(vehicule, charge);
      return;
    }
    const ok = await supprimerCharge(vehicule, charge);
    if (ok && fiche) { fiche.close(); voirInfos(etat.vehicules.find((v) => v.id === vehicule.id)); }
  });
}

async function supprimerCharge(vehicule, c) {
  const nouvel = await confirmerAvecMotDePasse({
    titre: `Supprimer la charge « ${c.libelle} » ?`,
    avertissement: `${formaterMontant(c.montant)} du ${formaterDate(c.date)} pour ${vehicule.nom} (${vehicule.matricule}). `
      + 'Elle ne sera plus comptée dans le coût de la bande. Cette action est irréversible.',
    bouton: 'Supprimer la charge',
    action: (motDePasse) => api.supprimer(`/bandes/${bandeId}/vehicules/${vehicule.id}/charges/${c.id}`, { motDePasse }),
  });
  if (!nouvel) return false;
  etat = nouvel;
  afficher();
  afficherSucces(message, `Charge « ${c.libelle} » du ${formaterDate(c.date)} supprimée.`);
  return true;
}

document.addEventListener('click', (evt) => {
  const bouton = evt.target.closest('[data-menu]');
  if (bouton) { evt.stopPropagation(); ouvrirMenu(bouton); return; }
  const boutonCharge = evt.target.closest('[data-menu-charge]');
  if (boutonCharge) { evt.stopPropagation(); ouvrirMenuCharge(boutonCharge); return; }
  if (!evt.target.closest('.menu-actions')) fermerMenu();
});

// --- Dialogs -----------------------------------------------------------------------------

function dialogue(html, { large = false, tresLarge = false } = {}) {
  const d = document.createElement('dialog');
  d.className = `dialogue${large ? ' dialogue-large' : ''}${tresLarge ? ' dialogue-tres-large' : ''}`;
  d.innerHTML = html;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.querySelectorAll('[data-fermer]').forEach((b) => b.addEventListener('click', () => d.close()));
  d.showModal();
  return d;
}

/** Sends the form; on success replaces the page state and closes the dialog. */
async function envoyer(d, form, appel, correspondance = {}) {
  effacerErreursChamps(form);
  form.querySelector('.message').innerHTML = '';
  const bouton = form.querySelector('[type="submit"]');
  bouton.disabled = true;
  try {
    const resultat = await appel();
    etat = resultat;
    afficher();
    d.close();
    return resultat;
  } catch (e) {
    if (e.details && !e.details.contrainte) afficherErreursChamps(form, e.details, correspondance);
    else afficherErreur(form.querySelector('.message'), e);
    bouton.disabled = false;
    return null;
  }
}

function ajouterVehicule() {
  const d = dialogue(`
    <form method="dialog" novalidate autocomplete="off">
      <h2>Ajouter un véhicule</h2>
      <div class="message"></div>
      <div class="champ">
        <label for="nom">Nom du véhicule</label>
        <input id="nom" maxlength="60" placeholder="Ex. Camion, Pick-up, Tracteur">
      </div>
      <div class="champs-cote">
        <div class="champ">
          <label for="modele">Modèle</label>
          <input id="modele" maxlength="60" placeholder="Ex. Isuzu NPR">
        </div>
        <div class="champ">
          <label for="matricule">Matricule</label>
          <input id="matricule" maxlength="20" placeholder="Ex. 12345-A-6">
        </div>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">Ajouter le véhicule</button>
      </div>
    </form>`);
  const form = d.querySelector('form');
  form.nom.focus();
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const corps = { nom: form.nom.value, modele: form.modele.value, matricule: form.matricule.value };
    const ok = await envoyer(d, form, () => api.post(`/bandes/${bandeId}/vehicules`, corps));
    if (ok) afficherSucces(message, `Le véhicule « ${corps.nom.trim()} » a été ajouté.`);
  });
}

function declarerCharge(vehicule, charge = null) {
  const vid = charge?.categorie === 'vidange';
  const d = dialogue(`
    <form method="dialog" novalidate autocomplete="off">
      <h2>${charge ? `Modifier la charge « ${echapper(charge.libelle)} »` : 'Charge'} — ${echapper(titreVehicule(vehicule))}</h2>
      <p class="texte-discret">Matricule ${echapper(vehicule.matricule)}. Le montant est compté dans le coût de la bande.</p>
      <div class="message"></div>
      <fieldset class="champ choix" id="vidange">
        <legend>Est-ce une vidange ?</legend>
        <div class="options-ligne">
          <label><input type="radio" name="vidange" value="non"${vid ? '' : ' checked'}> Non, autre charge</label>
          <label><input type="radio" name="vidange" value="oui"${vid ? ' checked' : ''}> Oui, c’est une vidange</label>
        </div>
      </fieldset>
      <div class="champ">
        <label for="charge-libelle">Nom de la charge</label>
        <input id="charge-libelle" maxlength="100" value="${echapper(charge?.libelle ?? '')}" placeholder="Ex. pneus, carburant, réparation">
      </div>
      <div class="champs-cote" data-champs-vidange${vid ? '' : ' hidden'}>
        <div class="champ">
          <label for="charge-km">Kilométrage actuel (km)</label>
          <input id="charge-km" inputmode="numeric" value="${vid ? formaterNombre(charge.kilometrage) : ''}" placeholder="Ex. 115 000">
          ${vehicule.vidange && !charge ? `<span class="aide">Dernière vidange à ${formaterKm(vehicule.vidange.kilometrage)} le ${formaterDate(vehicule.vidange.date)}.</span>` : ''}
        </div>
        <div class="champ">
          <label for="charge-intervalle">Prochaine vidange dans (km)</label>
          <input id="charge-intervalle" inputmode="numeric" value="${formaterNombre(vid ? charge.intervalleKm : 10000)}">
          <span class="aide" data-prochaine></span>
        </div>
      </div>
      <div class="champs-cote">
        <div class="champ">
          <label for="charge-date">Date</label>
          <input id="charge-date" type="date" value="${echapper(charge?.date ?? aujourdhui())}" max="${aujourdhui()}">
        </div>
        <div class="champ">
          <label for="charge-montant">Montant (DH)</label>
          <input id="charge-montant" inputmode="decimal" value="${echapper(ecrireNombre(charge?.montant))}" placeholder="Ex. 450">
        </div>
      </div>
      <div class="champ">
        <label for="charge-description">Description <span class="texte-discret">(facultatif)</span></label>
        <textarea id="charge-description" rows="2" maxlength="500" placeholder="Ex. huile 15W40 + filtre, garage Atlas">${echapper(charge?.description ?? '')}</textarea>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">${charge ? 'Enregistrer' : 'Déclarer la charge'}</button>
      </div>
    </form>`, { large: true });
  const form = d.querySelector('form');
  const correspondance = {
    libelle: 'charge-libelle', date: 'charge-date', montant: 'charge-montant', description: 'charge-description',
    kilometrage: 'charge-km', intervalleKm: 'charge-intervalle', vidange: 'vidange',
  };
  const libelle = form.querySelector('#charge-libelle');
  const champsVidange = form.querySelector('[data-champs-vidange]');
  const estVidange = () => form.querySelector('[name="vidange"]:checked').value === 'oui';
  const km = (champ) => lireNombre(champ.value.replace(/km/i, '').replace(/\./g, ''));
  const apercu = () => {
    const actuel = km(form.querySelector('#charge-km'));
    const intervalle = km(form.querySelector('#charge-intervalle'));
    form.querySelector('[data-prochaine]').innerHTML = Number.isInteger(actuel) && Number.isInteger(intervalle) && intervalle > 0
      ? `Prochaine vidange à <strong>${formaterKm(actuel + intervalle)}</strong>` : '';
  };
  form.addEventListener('change', (evt) => {
    if (evt.target.name !== 'vidange') return;
    champsVidange.hidden = !estVidange();
    // "Vidange" as the name by default (can be changed: "Vidange + filtre à air"…).
    if (estVidange() && !libelle.value.trim()) libelle.value = 'Vidange';
    if (!estVidange() && libelle.value === 'Vidange') libelle.value = '';
    if (estVidange()) form.querySelector('#charge-km').focus();
  });
  form.addEventListener('input', apercu);
  apercu();
  libelle.focus();
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const champs = {};
    const montant = lireNombre(form.querySelector('#charge-montant').value);
    if (Number.isNaN(montant)) champs.montant = 'Le montant doit être un nombre (ex. 450 ou 1 200,50).';
    const corps = {
      libelle: libelle.value,
      date: form.querySelector('#charge-date').value,
      montant,
      description: form.querySelector('#charge-description').value,
    };
    if (estVidange()) {
      corps.vidange = true;
      corps.kilometrage = km(form.querySelector('#charge-km'));
      corps.intervalleKm = km(form.querySelector('#charge-intervalle'));
      if (Number.isNaN(corps.kilometrage)) champs.kilometrage = 'Le kilométrage doit être un nombre (ex. 115 000).';
      if (Number.isNaN(corps.intervalleKm)) champs.intervalleKm = 'Saisissez un nombre de km (ex. 10 000).';
    }
    if (Object.keys(champs).length) { afficherErreursChamps(form, champs, correspondance); return; }
    const chemin = `/bandes/${bandeId}/vehicules/${vehicule.id}/charges`;
    const resultat = await envoyer(d, form, () => (charge
      ? api.put(`${chemin}/${charge.id}`, corps)
      : api.post(chemin, corps)), correspondance);
    if (resultat && charge) {
      afficherSucces(message, `Charge « ${resultat.charge.libelle} » du ${formaterDate(resultat.charge.date)} modifiée (${vehicule.nom}).`);
    } else if (resultat) {
      const c = resultat.charge;
      afficherSucces(message, c.categorie === 'vidange'
        ? `Vidange déclarée pour ${vehicule.nom} le ${formaterDate(c.date)} à ${formaterKm(c.kilometrage)} (${formaterMontant(c.montant)}). `
          + `Prochaine vidange à ${formaterKm(c.prochaineKm)}.`
        : `Charge « ${c.libelle} » de ${formaterMontant(c.montant)} déclarée pour ${vehicule.nom} le ${formaterDate(c.date)}.`);
    }
  });
}

// --- Documents: visite, vignette, assurance, carte grise --------------------------------------

function declarerDocument(vehicule, choisi = 'visite', charge = null) {
  const d = dialogue(`
    <form method="dialog" novalidate autocomplete="off">
      <h2>${charge ? `Modifier : ${echapper(charge.libelle)} du ${formaterDate(charge.date)}` : 'Document'} — ${echapper(titreVehicule(vehicule))}</h2>
      <p class="texte-discret">Matricule ${echapper(vehicule.matricule)}. Le montant est compté dans le coût de la bande.</p>
      <div class="message"></div>
      <fieldset class="champ choix" id="document">
        <legend>Document</legend>
        <div class="options-ligne">
          ${Object.entries(DOCUMENTS).map(([cle, doc]) => `
            <label><input type="radio" name="document" value="${cle}"${cle === choisi ? ' checked' : ''}${charge && cle !== choisi ? ' disabled' : ''}> ${doc.libelle}</label>`).join('')}
        </div>
      </fieldset>
      <div class="champs-cote">
        <div class="champ">
          <label for="doc-date">Date</label>
          <input id="doc-date" type="date" value="${echapper(charge?.date ?? aujourdhui())}" max="${aujourdhui()}">
        </div>
        <div class="champ">
          <label for="doc-duree">Durée de validité</label>
          <div class="champ-avec-unite">
            <input id="doc-duree" type="number" min="1" step="1" inputmode="numeric">
            <select id="doc-unite" aria-label="Unité de la durée">
              <option value="ans">an(s)</option>
              <option value="mois">mois</option>
            </select>
          </div>
          <span class="aide" data-expire></span>
        </div>
      </div>
      <div class="champ">
        <label for="doc-montant">Montant (DH)</label>
        <input id="doc-montant" inputmode="decimal" value="${echapper(ecrireNombre(charge?.montant))}" placeholder="Ex. 3500">
      </div>
      <div class="champ">
        <label for="doc-description">Description <span class="texte-discret">(facultatif)</span></label>
        <textarea id="doc-description" rows="2" maxlength="500" placeholder="Ex. compagnie d’assurance, n° de police, centre de visite">${echapper(charge?.description ?? '')}</textarea>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">${charge ? 'Enregistrer' : 'Déclarer le document'}</button>
      </div>
    </form>`, { large: true });
  const form = d.querySelector('form');
  const correspondance = {
    document: 'document', date: 'doc-date', dureeMois: 'doc-duree', montant: 'doc-montant', description: 'doc-description',
  };
  const duree = form.querySelector('#doc-duree');
  const unite = form.querySelector('#doc-unite');
  const docChoisi = () => form.querySelector('[name="document"]:checked').value;
  // Default validity of the chosen document: 1 year, 10 years for the carte grise.
  const parDefaut = (mois = DOCUMENTS[docChoisi()].dureeMois) => {
    duree.value = mois % 12 === 0 ? mois / 12 : mois;
    unite.value = mois % 12 === 0 ? 'ans' : 'mois';
  };
  const dureeMois = () => {
    const n = Number(duree.value);
    return Number.isInteger(n) && n > 0 ? n * (unite.value === 'ans' ? 12 : 1) : null;
  };
  const apercu = () => {
    const jour = form.querySelector('#doc-date').value;
    const mois = dureeMois();
    form.querySelector('[data-expire]').innerHTML = jour && mois
      ? `Expire le <strong>${formaterDate(ajouterMois(jour, mois))}</strong>` : '';
  };
  form.addEventListener('change', (evt) => { if (evt.target.name === 'document') parDefaut(); apercu(); });
  form.addEventListener('input', apercu);
  parDefaut(charge?.dureeMois);
  apercu();
  form.querySelector('#doc-montant').focus();
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const montant = lireNombre(form.querySelector('#doc-montant').value);
    const champs = {};
    if (Number.isNaN(montant)) champs.montant = 'Le montant doit être un nombre (ex. 3500 ou 0).';
    if (!dureeMois()) champs.dureeMois = 'Saisissez une durée en nombre entier (ex. 1 an, 6 mois).';
    if (Object.keys(champs).length) { afficherErreursChamps(form, champs, correspondance); return; }
    const corps = {
      document: docChoisi(),
      date: form.querySelector('#doc-date').value,
      dureeMois: dureeMois(),
      montant,
      description: form.querySelector('#doc-description').value,
    };
    const resultat = await envoyer(d, form, () => (charge
      ? api.put(`/bandes/${bandeId}/vehicules/${vehicule.id}/charges/${charge.id}`, corps)
      : api.post(`/bandes/${bandeId}/vehicules/${vehicule.id}/documents`, corps)), correspondance);
    if (resultat && charge) {
      const c = resultat.charge;
      afficherSucces(message, `${c.libelle} modifiée (${vehicule.nom}) : valable ${dureeTexte(c.dureeMois)}, expire le ${formaterDate(c.expireLe)}.`);
    } else if (resultat) {
      const c = resultat.charge;
      afficherSucces(message, `${c.libelle} déclarée pour ${vehicule.nom} le ${formaterDate(c.date)} : `
        + `valable ${dureeTexte(c.dureeMois)}, expire le ${formaterDate(c.expireLe)} (${formaterMontant(c.montant)}).`);
    }
  });
}

/** The 4 documents of a car (the latest of each kind) and when they expire. */
function htmlDocuments(v, { actions = false } = {}) {
  return `
    <div class="recu fiche-vehicule">
      <div class="recu-entete">
        <strong>${echapper(nomExploitation)}</strong>
        <span>Documents du véhicule — ${formaterDate(aujourdhui())}</span>
      </div>
      <h2>${echapper(titreVehicule(v))} <span class="matricule">${echapper(v.matricule)}</span></h2>
      <div class="defilement-tableau"><table class="tableau tableau-documents">
        <thead>
          <tr><th scope="col">Document</th><th scope="col">Date</th><th scope="col">Validité</th>
            <th scope="col">Expire le</th><th scope="col">État</th><th scope="col" class="nombre">Montant</th>
            ${actions ? '<th scope="col" class="no-print"><span class="visuellement-cache">Actions</span></th>' : ''}</tr>
        </thead>
        <tbody>
          ${Object.entries(DOCUMENTS).map(([cle, doc]) => {
    const x = v.documents[cle];
    return `
            <tr>
              <th scope="row">${doc.libelle}${x?.description ? `<br><span class="texte-discret">${echapper(x.description)}</span>` : ''}</th>
              <td>${x ? formaterDate(x.date) : '—'}</td>
              <td>${x ? dureeTexte(x.dureeMois) : '—'}</td>
              <td>${x ? `<strong>${formaterDate(x.expireLe)}</strong>` : '—'}</td>
              <td>${badgeDocument(x)}</td>
              <td class="nombre">${x ? formaterMontant(x.montant) : '—'}</td>
              ${actions ? `<td class="no-print"><button type="button" class="bouton-lien" data-renouveler="${cle}">${x ? 'Renouveler' : 'Déclarer'}</button></td>` : ''}
            </tr>`;
  }).join('')}
        </tbody>
      </table></div>
    </div>`;
}

function voirDocuments(vehicule) {
  const d = dialogue(`
    <div>
      ${htmlDocuments(vehicule, { actions: true })}
      <p class="aide no-print">« Expire bientôt » à partir de 30 jours avant la date. Les anciens documents restent dans les charges du véhicule.</p>
      <div class="actions-dialogue no-print">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Fermer</button>
        <button type="button" class="bouton" data-imprimer-documents>Imprimer</button>
      </div>
    </div>`, { tresLarge: true });
  d.querySelector('[data-fermer]').focus();
  d.querySelector('[data-imprimer-documents]').addEventListener('click', () => imprimerHtml(htmlDocuments(vehicule)));
  d.addEventListener('click', (evt) => {
    const b = evt.target.closest('[data-renouveler]');
    if (!b) return;
    d.close();
    declarerDocument(vehicule, b.dataset.renouveler);
  });
}

/** Car sheet: its information and all its charges (on screen and on paper). */
function htmlFiche(v, { actions = false } = {}) {
  return `
    <div class="recu fiche-vehicule">
      <div class="recu-entete">
        <strong>${echapper(nomExploitation)}</strong>
        <span>Fiche véhicule — bande « ${echapper(etat.bande.nom)} »</span>
      </div>
      <h2>${echapper(titreVehicule(v))}</h2>
      <dl class="liste-cles">
        <dt>Nom</dt><dd>${echapper(v.nom)}</dd>
        <dt>Modèle</dt><dd>${echapper(v.modele)}</dd>
        <dt>Matricule</dt><dd><span class="matricule">${echapper(v.matricule)}</span></dd>
        <dt>Ajouté le</dt><dd>${formaterDate(v.creeLe.slice(0, 10))}</dd>
        <dt>Charges</dt><dd>${v.nombreCharges ? pluriel(v.nombreCharges, 'charge') : 'aucune'}</dd>
        <dt>Dernière vidange</dt><dd>${v.vidange
    ? `${formaterDate(v.vidange.date)} à ${formaterKm(v.vidange.kilometrage)} — prochaine à <strong>${formaterKm(v.vidange.prochaineKm)}</strong>`
    : 'aucune'}</dd>
      </dl>
      <h3>Charges du véhicule</h3>
      ${v.charges.length ? `
      <table class="tableau tableau-compact">
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Charge</th><th scope="col">Description</th>
            <th scope="col" class="nombre">Montant</th>${actions ? '<th scope="col" class="no-print"><span class="visuellement-cache">Actions</span></th>' : ''}</tr>
        </thead>
        <tbody>
          ${v.charges.map((c) => `
            <tr>
              <td>${formaterDate(c.date)}</td>
              <td>${echapper(c.libelle)}${detailCharge(c) ? `<br><span class="texte-discret">${detailCharge(c)}</span>` : ''}</td>
              <td class="cellule-description">${echapper(c.description ?? '')}</td>
              <td class="nombre">${formaterMontant(c.montant)}</td>
              ${actions ? `<td class="no-print cellule-menu">${boutonCharge(v, c)}</td>` : ''}
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><th scope="row" colspan="3">Total des charges</th><td class="nombre">${formaterMontant(v.totalCharges)}</td>${actions ? '<td class="no-print"></td>' : ''}</tr>
        </tfoot>
      </table>` : '<p class="texte-discret">Aucune charge déclarée pour ce véhicule.</p>'}
    </div>`;
}

function imprimerHtml(html) {
  const zoneRecu = document.getElementById('zone-recu');
  zoneRecu.innerHTML = html;
  zoneRecu.hidden = false;
  document.body.classList.add('impression-recu');
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('impression-recu');
    zoneRecu.hidden = true;
    zoneRecu.innerHTML = '';
  }, { once: true });
  window.print();
}

function voirInfos(vehicule) {
  const d = dialogue(`
    <div>
      <div class="message"></div>
      ${htmlFiche(vehicule, { actions: true })}
      <div class="actions-dialogue no-print">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Fermer</button>
        <button type="button" class="bouton" data-imprimer-fiche>Imprimer la fiche</button>
      </div>
    </div>`, { tresLarge: true });
  d.querySelector('[data-imprimer-fiche]').addEventListener('click', () => imprimerHtml(htmlFiche(vehicule)));
}

async function supprimerVehicule(vehicule) {
  const nouvel = await confirmerAvecMotDePasse({
    titre: `Supprimer le véhicule « ${vehicule.nom} » ?`,
    avertissement: `${titreVehicule(vehicule)}, matricule ${vehicule.matricule}.${vehicule.nombreCharges
      ? (vehicule.nombreCharges > 1
        ? ` Ses ${formaterNombre(vehicule.nombreCharges)} charges (${formaterMontant(vehicule.totalCharges)}) seront aussi supprimées`
          + ' et ne seront plus comptées dans le coût de la bande.'
        : ` Sa charge (${formaterMontant(vehicule.totalCharges)}) sera aussi supprimée`
          + ' et ne sera plus comptée dans le coût de la bande.')
      : ''} Cette action est irréversible.`,
    bouton: 'Supprimer le véhicule',
    action: (motDePasse) => api.supprimer(`/bandes/${bandeId}/vehicules/${vehicule.id}`, { motDePasse }),
  });
  if (!nouvel) return;
  etat = nouvel;
  afficher();
  afficherSucces(message, `Le véhicule « ${vehicule.nom} » a été supprimé.`);
}

// --- Start ------------------------------------------------------------------------------

document.getElementById('bouton-ajouter').addEventListener('click', ajouterVehicule);
document.getElementById('bouton-imprimer-page').addEventListener('click', () => window.print());

try {
  if (!Number.isInteger(bandeId) || bandeId <= 0) throw new Error('Bande introuvable. Revenez à la liste des bandes.');
  etat = await api.get(`/bandes/${bandeId}/vehicules`);
  monterLayout({ titre: `Véhicules — ${etat.bande.nom}`, bande: etat.bande });
  document.getElementById('sous-titre').textContent = `${etat.bande.nom} · début le ${formaterDate(etat.bande.dateDebut)}`;
  document.getElementById('bouton-ajouter').disabled = false;
  afficher();
  api.get('/auth/etat').then((x) => { nomExploitation = x.nomExploitation; }).catch(() => {});
} catch (e) {
  monterLayout({ titre: 'Véhicules' });
  zone.innerHTML = '<p><a href="/pages/bandes.html">← Retour à la liste des bandes</a></p>';
  afficherErreur(message, e);
}
