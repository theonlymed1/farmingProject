// Véhicules (?bande=…): the work cars of the Bande. "+ Ajouter un véhicule" (name, model, plate),
// then from the "⋯" menu: declare a charge (oil change…), see the car's information and charges
// (printable sheet), or delete the car (password). The charges count in the cost of the Bande.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import {
  formaterDate, formaterMontant, formaterNombre, aujourdhui,
} from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, confirmerAvecMotDePasse,
} from '../ui.js';
import { lireNombre } from '../charges-commun.js';

const bandeId = Number(new URLSearchParams(location.search).get('bande'));
const zone = document.getElementById('contenu-vehicules');
const message = document.getElementById('message');
let etat = null; // { bande, vehicules, resume }
let nomExploitation = 'Ferme Sidi Aidi';

const pluriel = (n, mot) => `${formaterNombre(n)} ${mot}${n > 1 ? 's' : ''}`;
const titreVehicule = (v) => `${v.nom} — ${v.modele}`;

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
            <th scope="row">${echapper(v.nom)}</th>
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

/** Every charge of every car, newest first (on screen and on paper). */
function htmlToutesCharges() {
  const lignes = etat.vehicules.flatMap((v) => v.charges.map((c) => ({ ...c, vehicule: v })))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  if (!lignes.length) return '<p class="texte-discret">Aucune charge déclarée. Utilisez le menu « ⋯ » d’un véhicule → « Déclarer une charge ».</p>';
  return `
    <div class="defilement-tableau"><table class="tableau">
      <thead>
        <tr><th scope="col">Date</th><th scope="col">Véhicule</th><th scope="col">Charge</th>
          <th scope="col">Description</th><th scope="col" class="nombre">Montant</th></tr>
      </thead>
      <tbody>
        ${lignes.map((c) => `
          <tr>
            <td>${formaterDate(c.date)}</td>
            <td>${echapper(c.vehicule.nom)} <span class="texte-discret">(${echapper(c.vehicule.matricule)})</span></td>
            <td>${echapper(c.libelle)}</td>
            <td class="cellule-description">${echapper(c.description ?? '')}</td>
            <td class="nombre">${formaterMontant(c.montant)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><th scope="row" colspan="4">Total</th><td class="nombre">${formaterMontant(etat.resume.total)}</td></tr>
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
  ['infos', 'Informations du véhicule'],
  ['supprimer', 'Supprimer le véhicule'],
];

function fermerMenu() {
  document.querySelector('.menu-actions')?.remove();
  document.querySelector('[data-menu][aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
}

function ouvrirMenu(bouton) {
  fermerMenu();
  const vehicule = etat.vehicules.find((v) => v.id === Number(bouton.dataset.menu));
  const menu = document.createElement('ul');
  menu.className = 'menu-actions';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = ACTIONS.map(([action, libelle]) => `
    <li role="none"><button type="button" role="menuitem" data-action="${action}"
      class="${action === 'supprimer' ? 'action-danger' : ''}">${libelle}</button></li>`).join('');
  document.body.append(menu);
  const r = bouton.getBoundingClientRect();
  // Below the button if it fits on the screen, otherwise above it: no scrolling to see the last options.
  const enBas = r.bottom + 4 + menu.offsetHeight <= window.innerHeight - 8 || r.top - 4 - menu.offsetHeight < 8;
  menu.style.top = `${(enBas ? r.bottom + 4 : r.top - 4 - menu.offsetHeight) + window.scrollY}px`;
  menu.style.left = `${Math.max(8, r.right + window.scrollX - menu.offsetWidth)}px`;
  bouton.setAttribute('aria-expanded', 'true');
  menu.querySelector('button').focus();

  menu.addEventListener('click', (evt) => {
    const action = evt.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    fermerMenu();
    ({ charge: declarerCharge, infos: voirInfos, supprimer: supprimerVehicule })[action](vehicule);
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

// --- Dialogs -----------------------------------------------------------------------------

function dialogue(html, { large = false } = {}) {
  const d = document.createElement('dialog');
  d.className = `dialogue${large ? ' dialogue-large' : ''}`;
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

function declarerCharge(vehicule) {
  const d = dialogue(`
    <form method="dialog" novalidate autocomplete="off">
      <h2>Charge — ${echapper(titreVehicule(vehicule))}</h2>
      <p class="texte-discret">Matricule ${echapper(vehicule.matricule)}. Le montant est compté dans le coût de la bande.</p>
      <div class="message"></div>
      <div class="champ">
        <label for="charge-libelle">Nom de la charge</label>
        <input id="charge-libelle" maxlength="100" placeholder="Ex. Vidange, pneus, carburant, réparation">
      </div>
      <div class="champs-cote">
        <div class="champ">
          <label for="charge-date">Date</label>
          <input id="charge-date" type="date" value="${aujourdhui()}" max="${aujourdhui()}">
        </div>
        <div class="champ">
          <label for="charge-montant">Montant (DH)</label>
          <input id="charge-montant" inputmode="decimal" placeholder="Ex. 450">
        </div>
      </div>
      <div class="champ">
        <label for="charge-description">Description <span class="texte-discret">(facultatif)</span></label>
        <textarea id="charge-description" rows="2" maxlength="500" placeholder="Ex. huile 15W40 + filtre, garage Atlas"></textarea>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">Déclarer la charge</button>
      </div>
    </form>`, { large: true });
  const form = d.querySelector('form');
  const correspondance = {
    libelle: 'charge-libelle', date: 'charge-date', montant: 'charge-montant', description: 'charge-description',
  };
  form.querySelector('#charge-libelle').focus();
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const montant = lireNombre(form.querySelector('#charge-montant').value);
    if (Number.isNaN(montant)) {
      afficherErreursChamps(form, { montant: 'Le montant doit être un nombre (ex. 450 ou 1 200,50).' }, correspondance);
      return;
    }
    const resultat = await envoyer(d, form, () => api.post(`/bandes/${bandeId}/vehicules/${vehicule.id}/charges`, {
      libelle: form.querySelector('#charge-libelle').value,
      date: form.querySelector('#charge-date').value,
      montant,
      description: form.querySelector('#charge-description').value,
    }), correspondance);
    if (resultat) {
      const c = resultat.charge;
      afficherSucces(message, `Charge « ${c.libelle} » de ${formaterMontant(c.montant)} déclarée pour ${vehicule.nom} le ${formaterDate(c.date)}.`);
    }
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
              <td>${echapper(c.libelle)}</td>
              <td class="cellule-description">${echapper(c.description ?? '')}</td>
              <td class="nombre">${formaterMontant(c.montant)}</td>
              ${actions ? `<td class="no-print"><button type="button" class="bouton-lien bouton-lien-danger" data-supprimer-charge="${c.id}">Supprimer</button></td>` : ''}
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
    </div>`, { large: true });
  d.querySelector('[data-imprimer-fiche]').addEventListener('click', () => imprimerHtml(htmlFiche(vehicule)));
  d.addEventListener('click', async (evt) => {
    const b = evt.target.closest('[data-supprimer-charge]');
    if (!b) return;
    const c = vehicule.charges.find((x) => x.id === Number(b.dataset.supprimerCharge));
    const nouvel = await confirmerAvecMotDePasse({
      titre: `Supprimer la charge « ${c.libelle} » ?`,
      avertissement: `${formaterMontant(c.montant)} du ${formaterDate(c.date)} pour ${vehicule.nom} (${vehicule.matricule}). `
        + 'Elle ne sera plus comptée dans le coût de la bande. Cette action est irréversible.',
      bouton: 'Supprimer la charge',
      action: (motDePasse) => api.supprimer(`/bandes/${bandeId}/vehicules/${vehicule.id}/charges/${c.id}`, { motDePasse }),
    });
    if (!nouvel) return;
    etat = nouvel;
    afficher();
    d.close();
    afficherSucces(message, `Charge « ${c.libelle} » du ${formaterDate(c.date)} supprimée.`);
    voirInfos(etat.vehicules.find((v) => v.id === vehicule.id));
  });
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
