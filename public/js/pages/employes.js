// Employés (?bande=…): add / edit workers, search by name, and from the "⋯" menu:
// declare an advance (with a printable receipt), declare a rest day, see the worker's info
// (advances, rest days), edit, or "Supprimer" = the worker leaves
// (password + departure date) with a printable receipt of what he is owed.
import { monterLayout } from '../layout.js';
import { imprimerHtml } from '../impression.js';
import { api } from '../api.js';
import {
  formaterDate, formaterMontant, formaterNombre, aujourdhui,
} from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, brancherBasculesMotDePasse,
  confirmerAvecMotDePasse,
} from '../ui.js';
import { calculerCompte } from '../employes-calcul.js';

const bandeId = Number(new URLSearchParams(location.search).get('bande'));
const zone = document.getElementById('contenu-employes');
const message = document.getElementById('message');
let etat = null; // { bande, employes, resume }
let recherche = '';
let nomExploitation = '';

/** "de Brahim" / "d’Ahmed" */
const de = (nom) => (/^[aeiouyhéèêâàîô]/i.test(nom) ? `d’${nom}` : `de ${nom}`);
const sansAccents = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pluriel = (n, mot) => `${formaterNombre(n)} ${mot}${n > 1 ? 's' : ''}`;
const lireMontant = (t) => {
  const s = String(t ?? '').trim().replace(/[\s  ]/g, '').replace(/dh$/i, '').replace(',', '.');
  if (s === '') return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};
const ecrireMontant = (n) => (n == null ? '' : String(n).replace('.', ','));

function soldeTexte(solde) {
  return solde >= 0 ? formaterMontant(solde) : `<span class="solde-negatif">doit ${formaterMontant(-solde)}</span>`;
}

// --- Page ----------------------------------------------------------------------------

function tuiles() {
  const r = etat.resume;
  return `
    <section class="indicateurs">
      <div class="indicateur">
        <span class="indicateur-libelle">Employés actuels</span>
        <span class="indicateur-valeur">${formaterNombre(r.nombreActifs)}</span>
        <span class="indicateur-detail">${r.nombrePartis ? `${pluriel(r.nombrePartis, 'ancien')} employé${r.nombrePartis > 1 ? 's' : ''}` : 'aucun départ'}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Avances versées</span>
        <span class="indicateur-valeur">${formaterMontant(r.totalAvances)}</span>
        <span class="indicateur-detail">${r.nombreAvances ? pluriel(r.nombreAvances, 'avance') : 'aucune avance'}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Reste à payer aux employés actuels</span>
        <span class="indicateur-valeur">${formaterMontant(r.soldeActifs)}</span>
        <span class="indicateur-detail explication">s’ils partaient aujourd’hui</span>
      </div>
      <div class="indicateur indicateur-fort">
        <span class="indicateur-libelle">Coût pour la bande</span>
        <span class="indicateur-valeur">${formaterMontant(r.cout)}</span>
        <span class="indicateur-detail explication">avances + soldes des départs</span>
      </div>
    </section>`;
}

function ligneActif(e) {
  const c = e.compte;
  return `
    <tr data-id="${e.id}">
      <th scope="row">${echapper(e.nom)}</th>
      <td class="nombre">${e.age} ans</td>
      <td>${echapper(e.cin)}</td>
      <td>${formaterDate(e.dateDebut)}</td>
      <td class="nombre">${formaterNombre(c.joursTravailles)}</td>
      <td class="nombre">${formaterNombre(c.joursRepos)}</td>
      <td class="nombre">${formaterMontant(c.totalAvances)}</td>
      <td class="nombre">${formaterMontant(e.salaireJournalier)}</td>
      <td class="nombre">${soldeTexte(c.solde)}</td>
      <td class="no-print cellule-menu">
        <button type="button" class="bouton-menu" data-menu="${e.id}" aria-haspopup="menu" aria-label="Actions pour ${echapper(e.nom)}">⋯</button>
      </td>
    </tr>`;
}

function ligneParti(e) {
  const c = e.compte;
  return `
    <tr>
      <th scope="row">${echapper(e.nom)}</th>
      <td>${echapper(e.cin)}</td>
      <td>${formaterDate(e.dateDebut)} → ${formaterDate(e.dateDepart)}</td>
      <td class="nombre">${formaterNombre(c.joursTravailles)}</td>
      <td class="nombre">${formaterMontant(c.salaireTotal)}</td>
      <td class="nombre">${formaterMontant(c.totalAvances)}</td>
      <td class="nombre">${soldeTexte(c.solde)}</td>
      <td class="no-print"><button type="button" class="bouton-lien" data-recu="${e.id}">Voir le reçu</button></td>
    </tr>`;
}

function afficherListes() {
  const filtre = (e) => !recherche || sansAccents(e.nom).includes(sansAccents(recherche));
  const actifs = etat.employes.filter((e) => e.actif && filtre(e));
  const partis = etat.employes.filter((e) => !e.actif && filtre(e));
  const aucunActif = !etat.employes.some((e) => e.actif);

  document.getElementById('liste-actifs').innerHTML = aucunActif
    ? '<p class="texte-discret">Aucun employé pour le moment. Cliquez sur « Ajouter un employé ».</p>'
    : !actifs.length ? '<p class="texte-discret">Aucun employé ne correspond à la recherche.</p>' : `
      <div class="defilement-tableau"><table class="tableau tableau-employes">
        <thead>
          <tr>
            <th scope="col">Nom complet</th><th scope="col" class="nombre">Âge</th><th scope="col">CIN</th>
            <th scope="col">Début</th><th scope="col" class="nombre">Jours trav.</th><th scope="col" class="nombre">Repos</th>
            <th scope="col" class="nombre">Avances</th><th scope="col" class="nombre">Salaire /jour</th>
            <th scope="col" class="nombre">À payer</th><th scope="col" class="no-print"><span class="visuellement-cache">Actions</span></th>
          </tr>
        </thead>
        <tbody>${actifs.map(ligneActif).join('')}</tbody>
      </table></div>`;

  const blocPartis = document.getElementById('bloc-partis');
  blocPartis.hidden = !etat.employes.some((e) => !e.actif);
  document.getElementById('liste-partis').innerHTML = !partis.length
    ? '<p class="texte-discret">Aucun ancien employé ne correspond à la recherche.</p>' : `
      <div class="defilement-tableau"><table class="tableau tableau-employes">
        <thead>
          <tr>
            <th scope="col">Nom complet</th><th scope="col">CIN</th><th scope="col">Période</th>
            <th scope="col" class="nombre">Jours travaillés</th><th scope="col" class="nombre">Salaire total</th>
            <th scope="col" class="nombre">Avances</th><th scope="col" class="nombre">Solde réglé</th>
            <th scope="col" class="no-print"><span class="visuellement-cache">Reçu</span></th>
          </tr>
        </thead>
        <tbody>${partis.map(ligneParti).join('')}</tbody>
      </table></div>`;
}

function afficher() {
  zone.innerHTML = `
    ${tuiles()}
    <section class="carte" aria-labelledby="titre-actifs">
      <div class="titre-section">
        <h2 id="titre-actifs">Employés actuels</h2>
        <input type="search" id="recherche" class="champ-recherche no-print" placeholder="Rechercher par nom…"
          value="${echapper(recherche)}" aria-label="Rechercher un employé par son nom">
      </div>
      <div id="liste-actifs"></div>
    </section>
    <section class="carte" id="bloc-partis" aria-labelledby="titre-partis">
      <h2 id="titre-partis">Anciens employés</h2>
      <div id="liste-partis"></div>
    </section>`;
  zone.querySelector('#recherche').addEventListener('input', (e) => { recherche = e.target.value; afficherListes(); });
  afficherListes();
}

// --- "⋯" menu --------------------------------------------------------------------------

const ACTIONS = [
  ['avance', 'Déclarer une avance'],
  ['repos', 'Déclarer un jour de repos'],
  ['infos', 'Voir les informations'],
  ['modifier', 'Modifier'],
  ['supprimer', 'Supprimer (départ)'],
];

function fermerMenu() {
  document.querySelector('.menu-actions')?.remove();
  document.querySelector('[data-menu][aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
}

function ouvrirMenu(bouton) {
  fermerMenu();
  const employe = etat.employes.find((e) => e.id === Number(bouton.dataset.menu));
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
    ({
      avance: declarerAvance, repos: declarerRepos, infos: voirInfos, modifier: () => ouvrirFormulaire(employe), supprimer: enregistrerDepart,
    })[action](employe);
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
  const recu = evt.target.closest('[data-recu]');
  if (recu) montrerRecu(etat.employes.find((e) => e.id === Number(recu.dataset.recu)));
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

function ouvrirFormulaire(employe = null) {
  const v = employe ?? {
    nom: '', age: '', cin: '', dateDebut: aujourdhui(), salaireJournalier: null,
  };
  const d = dialogue(`
    <form method="dialog" novalidate autocomplete="off">
      <h2>${employe ? 'Modifier l’employé' : 'Ajouter un employé'}</h2>
      <div class="message"></div>
      <div class="champ">
        <label for="nom">Nom complet</label>
        <input id="nom" maxlength="100" value="${echapper(v.nom)}" placeholder="Ex. Ahmed Alaoui">
      </div>
      <div class="champs-cote">
        <div class="champ">
          <label for="age">Âge</label>
          <input id="age" type="number" min="15" max="90" step="1" inputmode="numeric" value="${echapper(v.age)}">
        </div>
        <div class="champ">
          <label for="cin">CIN</label>
          <input id="cin" maxlength="20" value="${echapper(v.cin)}" placeholder="Ex. AB123456">
        </div>
      </div>
      <div class="champs-cote">
        <div class="champ">
          <label for="dateDebut">Date de début du travail</label>
          <input id="dateDebut" type="date" value="${echapper(v.dateDebut)}">
        </div>
        <div class="champ">
          <label for="salaireJournalier">Salaire par jour (DH)</label>
          <input id="salaireJournalier" inputmode="decimal" value="${echapper(ecrireMontant(v.salaireJournalier))}" placeholder="Ex. 100">
          <span class="aide">Payé au départ : jours travaillés × salaire − avances.</span>
        </div>
      </div>
      <p class="aide">Les avances se déclarent une par une, avec le menu « ⋯ » de l’employé → « Déclarer une avance ».</p>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">${employe ? 'Enregistrer' : 'Ajouter l’employé'}</button>
      </div>
    </form>`, { large: true });
  const form = d.querySelector('form');
  form.nom.focus();
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const salaire = lireMontant(form.salaireJournalier.value);
    const champs = {};
    if (Number.isNaN(salaire)) champs.salaireJournalier = 'Le salaire doit être un nombre (ex. 100).';
    if (Object.keys(champs).length) { afficherErreursChamps(form, champs); return; }
    const corps = {
      nom: form.nom.value,
      age: form.age.value === '' ? null : Number(form.age.value),
      cin: form.cin.value,
      dateDebut: form.dateDebut.value,
      salaireJournalier: salaire,
    };
    const ok = await envoyer(d, form, () => (employe
      ? api.put(`/bandes/${bandeId}/employes/${employe.id}`, corps)
      : api.post(`/bandes/${bandeId}/employes`, corps)));
    if (ok) afficherSucces(message, employe ? 'Employé modifié.' : `${corps.nom.trim()} a été ajouté.`);
  });
}

function declarerAvance(employe) {
  const d = dialogue(`
    <form method="dialog" novalidate autocomplete="off">
      <h2>Avance — ${echapper(employe.nom)}</h2>
      <div class="message"></div>
      <div class="champs-cote">
        <div class="champ">
          <label for="avance-montant">Montant (DH)</label>
          <input id="avance-montant" inputmode="decimal" placeholder="Ex. 200">
        </div>
        <div class="champ">
          <label for="avance-date">Date</label>
          <input id="avance-date" type="date" value="${aujourdhui()}" min="${employe.dateDebut}" max="${aujourdhui()}">
        </div>
      </div>
      <div class="champ">
        <label for="avance-note">Remarque <span class="texte-discret">(facultatif)</span></label>
        <input id="avance-note" maxlength="200" placeholder="Ex. pour le souk, médicaments…">
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">Confirmer l’avance</button>
      </div>
    </form>`);
  const form = d.querySelector('form');
  const champMontant = form.querySelector('#avance-montant');
  const champDate = form.querySelector('#avance-date');
  champMontant.focus();
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const montant = lireMontant(champMontant.value);
    if (Number.isNaN(montant)) {
      afficherErreursChamps(form, { montant: 'Le montant doit être un nombre (ex. 200 ou 150,50).' }, { montant: 'avance-montant' });
      return;
    }
    const resultat = await envoyer(d, form, () => api.post(`/bandes/${bandeId}/employes/${employe.id}/avances`, {
      montant, date: champDate.value, note: form.querySelector('#avance-note').value,
    }), { montant: 'avance-montant', date: 'avance-date', note: 'avance-note' });
    if (!resultat) return;
    const a = resultat.avance;
    afficherSucces(message, `Avance de ${formaterMontant(a.montant)} donnée à ${employe.nom} le ${formaterDate(a.date)}.`);
    montrerRecuAvance(resultat.employes.find((e) => e.id === employe.id), a);
  });
}

function declarerRepos(employe) {
  const d = dialogue(`
    <form method="dialog" novalidate>
      <h2>Jour de repos — ${echapper(employe.nom)}</h2>
      <p class="texte-discret">Ce jour ne sera pas payé : il est retiré des jours travaillés.</p>
      <div class="message"></div>
      <div class="champ">
        <label for="repos-date">Date du repos</label>
        <input id="repos-date" type="date" value="${aujourdhui()}" min="${employe.dateDebut}" max="${aujourdhui()}">
      </div>
      <div class="champ">
        <label for="repos-note">Remarque <span class="texte-discret">(facultatif)</span></label>
        <input id="repos-note" maxlength="200" placeholder="Ex. malade, fête…">
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">Déclarer le repos</button>
      </div>
    </form>`);
  const form = d.querySelector('form');
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const jour = form.querySelector('#repos-date').value;
    const ok = await envoyer(d, form, () => api.post(`/bandes/${bandeId}/employes/${employe.id}/repos`, {
      date: jour, note: form.querySelector('#repos-note').value,
    }), { date: 'repos-date', note: 'repos-note' });
    if (ok) afficherSucces(message, `Jour de repos déclaré pour ${employe.nom} le ${formaterDate(jour)}.`);
  });
}

function htmlCompte(e, c) {
  return `
    <dl class="liste-cles">
      <dt>Période</dt><dd>du ${formaterDate(e.dateDebut)} au ${formaterDate(c.jusquAu)} (${pluriel(c.joursPeriode, 'jour')})</dd>
      <dt>Jours de repos</dt><dd>${formaterNombre(c.joursRepos)}</dd>
      <dt>Jours travaillés</dt><dd><strong>${formaterNombre(c.joursTravailles)}</strong></dd>
      <dt>Salaire</dt><dd>${formaterNombre(c.joursTravailles)} × ${formaterMontant(e.salaireJournalier)} = <strong>${formaterMontant(c.salaireTotal)}</strong></dd>
      <dt>Avances</dt><dd>${c.nombreAvances ? `${pluriel(c.nombreAvances, 'avance')} = ` : 'aucune : '}<strong>${formaterMontant(c.totalAvances)}</strong></dd>
      <dt>${c.solde >= 0 ? 'Reste à payer' : 'L’employé doit'}</dt>
      <dd class="montant-final ${c.solde < 0 ? 'solde-negatif' : ''}">${formaterMontant(Math.abs(c.solde))}</dd>
    </dl>`;
}

/** The employee on paper: identity, account to date, advances and days off (no buttons). */
function htmlFicheEmploye(e) {
  const tableau = (titre, colonnes, lignes) => `
      <h3>${titre}</h3>
      ${lignes.length ? `
      <table class="tableau tableau-compact">
        <thead><tr>${colonnes.map(([c, nombre]) => `<th scope="col"${nombre ? ' class="nombre"' : ''}>${c}</th>`).join('')}</tr></thead>
        <tbody>${lignes.join('')}</tbody>
      </table>` : '<p class="texte-discret">Aucun.</p>'}`;
  return `
    <div class="recu">
      <div class="recu-entete">
        <strong>${echapper(nomExploitation)}</strong>
        <span>Fiche employé — bande « ${echapper(etat.bande.nom)} »</span>
      </div>
      <h2>${echapper(e.nom)}</h2>
      <dl class="liste-cles">
        <dt>CIN</dt><dd>${echapper(e.cin)}</dd>
        <dt>Âge</dt><dd>${e.age} ans</dd>
        <dt>Début du travail</dt><dd>${formaterDate(e.dateDebut)}</dd>
        ${e.dateDepart ? `<dt>Départ</dt><dd>${formaterDate(e.dateDepart)}</dd>` : ''}
        <dt>Salaire par jour</dt><dd>${formaterMontant(e.salaireJournalier)}</dd>
      </dl>
      <h3>${e.dateDepart ? 'Compte au départ' : 'Compte à ce jour'}</h3>
      ${htmlCompte(e, e.compte)}
      ${tableau(`Avances (${e.avances.length})`, [['Date'], ['Montant', true], ['Note']], [...e.avances].reverse().map((a) => `
        <tr><td>${formaterDate(a.date)}</td><td class="nombre">${formaterMontant(a.montant)}</td><td>${echapper(a.note ?? '')}</td></tr>`))}
      ${tableau(`Jours de repos (${e.joursRepos.length})`, [['Date'], ['Note']], e.joursRepos.map((j) => `
        <tr><td>${formaterDate(j.date)}</td><td>${echapper(j.note ?? '')}</td></tr>`))}
    </div>`;
}

function voirInfos(employe) {
  const repos = employe.joursRepos;
  const d = dialogue(`
    <div>
      <h2>${echapper(employe.nom)}</h2>
      <div class="message"></div>
      <dl class="liste-cles">
        <dt>Âge</dt><dd>${employe.age} ans</dd>
        <dt>CIN</dt><dd>${echapper(employe.cin)}</dd>
        <dt>Début du travail</dt><dd>${formaterDate(employe.dateDebut)}</dd>
        <dt>Salaire par jour</dt><dd>${formaterMontant(employe.salaireJournalier)}</dd>
      </dl>
      <h3>Compte à ce jour</h3>
      ${htmlCompte(employe, employe.compte)}
      <h3>Avances (${employe.avances.length})</h3>
      ${employe.avances.length ? `<ul class="liste-repos">${[...employe.avances].reverse().map((a) => `
        <li><span>${formaterDate(a.date)} — <strong>${formaterMontant(a.montant)}</strong>${a.note
    ? ` <span class="texte-discret">— ${echapper(a.note)}</span>` : ''}</span>
          <span class="actions-ligne">
            <button type="button" class="bouton-lien" data-recu-avance="${a.id}">Reçu</button>
            ${employe.actif ? `<button type="button" class="bouton-lien bouton-lien-danger" data-supprimer-avance="${a.id}">Supprimer</button>` : ''}
          </span></li>`).join('')}</ul>`
    : '<p class="texte-discret">Aucune avance.</p>'}
      <h3>Jours de repos (${repos.length})</h3>
      ${repos.length ? `<ul class="liste-repos">${repos.map((j) => `
        <li><span>${formaterDate(j.date)}${j.note ? ` <span class="texte-discret">— ${echapper(j.note)}</span>` : ''}</span>
          <button type="button" class="bouton-lien bouton-lien-danger" data-annuler-repos="${j.date}">Annuler</button></li>`).join('')}</ul>`
    : '<p class="texte-discret">Aucun jour de repos.</p>'}
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Fermer</button>
        <button type="button" class="bouton" data-imprimer-fiche>Imprimer la fiche</button>
      </div>
    </div>`, { large: true });
  d.querySelector('[data-imprimer-fiche]').addEventListener('click', () => imprimerHtml(htmlFicheEmploye(employe)));
  d.addEventListener('click', async (evt) => {
    const recu = evt.target.closest('[data-recu-avance]');
    if (recu) {
      montrerRecuAvance(employe, employe.avances.find((a) => a.id === Number(recu.dataset.recuAvance)));
      return;
    }
    const suppr = evt.target.closest('[data-supprimer-avance]');
    if (suppr) {
      const a = employe.avances.find((x) => x.id === Number(suppr.dataset.supprimerAvance));
      const nouvel = await confirmerAvecMotDePasse({
        titre: `Supprimer l’avance de ${formaterMontant(a.montant)} ?`,
        avertissement: `Avance du ${formaterDate(a.date)} donnée à ${employe.nom}. Elle ne sera plus comptée `
          + 'dans ses avances ni dans les coûts. Cette action est irréversible.',
        bouton: 'Supprimer l’avance',
        action: (motDePasse) => api.supprimer(`/bandes/${bandeId}/employes/${employe.id}/avances/${a.id}`, { motDePasse }),
      });
      if (!nouvel) return;
      etat = nouvel;
      afficher();
      d.close();
      afficherSucces(message, `Avance de ${formaterMontant(a.montant)} du ${formaterDate(a.date)} supprimée.`);
      voirInfos(etat.employes.find((e) => e.id === employe.id));
      return;
    }
    const b = evt.target.closest('[data-annuler-repos]');
    if (!b) return;
    try {
      etat = await api.supprimer(`/bandes/${bandeId}/employes/${employe.id}/repos/${b.dataset.annulerRepos}`);
      afficher();
      d.close();
      voirInfos(etat.employes.find((e) => e.id === employe.id));
    } catch (e) {
      afficherErreur(d.querySelector('.message'), e);
    }
  });
}

function enregistrerDepart(employe) {
  const d = dialogue(`
    <form method="dialog" novalidate>
      <h2>Départ ${echapper(de(employe.nom))}</h2>
      <div class="alerte alerte-erreur">L’employé sera retiré de la liste et son compte sera réglé.
        Il restera dans « Anciens employés » avec son reçu.</div>
      <div class="message"></div>
      <div class="champ">
        <label for="dateDepart">Date de départ (dernier jour)</label>
        <input id="dateDepart" type="date" value="${aujourdhui()}" min="${employe.dateDebut}" max="${aujourdhui()}">
      </div>
      <div id="apercu-compte"></div>
      <div class="champ">
        <label for="mdp-depart">Mot de passe, pour confirmer</label>
        <div class="mot-de-passe-groupe">
          <input id="mdp-depart" type="password" autocomplete="current-password">
          <button type="button" class="bouton bouton-secondaire" data-basculer="mdp-depart">Afficher</button>
        </div>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton bouton-danger">Confirmer le départ</button>
      </div>
    </form>`, { large: true });
  brancherBasculesMotDePasse(d);
  const form = d.querySelector('form');
  const champDate = form.querySelector('#dateDepart');
  const apercu = () => {
    if (!champDate.value) { form.querySelector('#apercu-compte').innerHTML = ''; return; }
    const c = calculerCompte({ ...employe, dateDepart: champDate.value }, employe.joursRepos.map((j) => j.date), employe.avances, aujourdhui());
    form.querySelector('#apercu-compte').innerHTML = htmlCompte(employe, c);
  };
  champDate.addEventListener('input', apercu);
  apercu();
  form.querySelector('#mdp-depart').focus();
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const resultat = await envoyer(d, form, () => api.post(`/bandes/${bandeId}/employes/${employe.id}/depart`, {
      dateDepart: champDate.value, motDePasse: form.querySelector('#mdp-depart').value,
    }), { dateDepart: 'dateDepart', motDePasse: 'mdp-depart' });
    if (!resultat) {
      form.querySelector('#mdp-depart').value = '';
      return;
    }
    afficherSucces(message, `Départ ${de(employe.nom)} enregistré.`);
    montrerRecu(resultat.depart);
  });
}

// --- Receipt ----------------------------------------------------------------------------

function htmlRecu(e) {
  const c = e.compte;
  return `
    <div class="recu">
      <div class="recu-entete">
        <strong>${echapper(nomExploitation)}</strong>
        <span>Reçu de fin de travail — ${formaterDate(e.dateDepart)}</span>
      </div>
      <h2>Règlement ${echapper(de(e.nom))}</h2>
      <dl class="liste-cles">
        <dt>Nom complet</dt><dd>${echapper(e.nom)}</dd>
        <dt>CIN</dt><dd>${echapper(e.cin)}</dd>
        <dt>Âge</dt><dd>${e.age} ans</dd>
        <dt>Bande</dt><dd>${echapper(etat.bande.nom)}</dd>
      </dl>
      ${htmlCompte(e, c)}
      <p class="recu-phrase">${c.solde >= 0
    ? `Somme versée à ${echapper(e.nom)} pour solde de tout compte : <strong>${formaterMontant(c.solde)}</strong>.`
    : `${echapper(e.nom)} doit à l’exploitation : <strong>${formaterMontant(-c.solde)}</strong>.`}</p>
      <div class="recu-signatures">
        <div>Signature de l’employé</div>
        <div>Signature du responsable</div>
      </div>
    </div>`;
}

/** Receipt for one advance: who, which Bande, date, amount, and the two signatures. */
function htmlRecuAvance(e, a) {
  return `
    <div class="recu">
      <div class="recu-entete">
        <strong>${echapper(nomExploitation)}</strong>
        <span>Reçu d’avance — ${formaterDate(a.date)}</span>
      </div>
      <h2>Avance sur salaire</h2>
      <dl class="liste-cles">
        <dt>Nom complet</dt><dd>${echapper(e.nom)}</dd>
        <dt>CIN</dt><dd>${echapper(e.cin)}</dd>
        <dt>Bande</dt><dd>${echapper(etat.bande.nom)}</dd>
        <dt>Date de l’avance</dt><dd>${formaterDate(a.date)}</dd>
        ${a.note ? `<dt>Remarque</dt><dd>${echapper(a.note)}</dd>` : ''}
      </dl>
      <p class="facture-total">Montant de l’avance : <strong>${formaterMontant(a.montant)}</strong></p>
      <div class="recu-signatures">
        <div>Signature de l’employé</div>
        <div>Signature du responsable</div>
      </div>
    </div>`;
}

function montrerRecuAvance(e, a) {
  const d = dialogue(`
    <div>
      ${htmlRecuAvance(e, a)}
      <div class="actions-dialogue no-print">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Fermer</button>
        <button type="button" class="bouton" data-imprimer-recu>Imprimer le reçu</button>
      </div>
    </div>`, { large: true });
  d.querySelector('[data-imprimer-recu]').addEventListener('click', () => imprimerHtml(htmlRecuAvance(e, a)));
}

function imprimerRecu(e) {
  imprimerHtml(htmlRecu(e));
}

function montrerRecu(e) {
  const d = dialogue(`
    <div>
      ${htmlRecu(e)}
      <div class="actions-dialogue no-print">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Fermer</button>
        <button type="button" class="bouton" data-imprimer-recu>Imprimer le reçu</button>
      </div>
    </div>`, { large: true });
  d.querySelector('[data-imprimer-recu]').addEventListener('click', () => imprimerRecu(e));
}

// --- Start ------------------------------------------------------------------------------

document.getElementById('bouton-ajouter').addEventListener('click', () => ouvrirFormulaire());
document.getElementById('bouton-imprimer-page').addEventListener('click', () => window.print());

try {
  if (!Number.isInteger(bandeId) || bandeId <= 0) throw new Error('Bande introuvable. Revenez à la liste des bandes.');
  etat = await api.get(`/bandes/${bandeId}/employes`);
  monterLayout({ titre: `Employés — ${etat.bande.nom}`, bande: etat.bande });
  document.getElementById('sous-titre').textContent = `${etat.bande.nom} · début le ${formaterDate(etat.bande.dateDebut)}`;
  document.getElementById('bouton-ajouter').disabled = false;
  afficher();
  api.get('/auth/etat').then((x) => { nomExploitation = x.nomExploitation; }).catch(() => {});
} catch (e) {
  monterLayout({ titre: 'Employés' });
  zone.innerHTML = '<p><a href="/pages/bandes.html">← Retour à la liste des bandes</a></p>';
  afficherErreur(message, e);
}
