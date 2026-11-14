// Shared by the Bandes list and the Bande page: status labels, add/edit dialog, delete dialog.
import { api } from './api.js';
import {
  formaterDate, formaterNombre, formaterMontant, aujourdhui,
} from './format.js';
import {
  echapper, afficherErreur, afficherErreursChamps, effacerErreursChamps, brancherBasculesMotDePasse,
} from './ui.js';

// 'a_venir' (start date in the future) counts as current: green, like 'en_cours'.
export const STATUTS = {
  en_cours: { libelle: 'En cours', classe: 'statut-en-cours' },
  a_venir: { libelle: 'À venir', classe: 'statut-en-cours' },
  terminee: { libelle: 'Terminée', classe: 'statut-terminee' },
};

export function badgeStatut(bande) {
  const s = STATUTS[bande.statut] ?? STATUTS.en_cours;
  return `<span class="badge badge-${s.classe}">${s.libelle}</span>`;
}

/** 'Jour 23 · semaine 4', 'Commence le 01/12/2026' or 'Terminée le 14/03/2027'. */
export function libelleAge(bande) {
  if (bande.statut === 'a_venir') return `Commence le ${formaterDate(bande.dateDebut)}`;
  if (bande.statut === 'terminee') return `Terminée le ${formaterDate(bande.dateFin)}`;
  return `Jour ${formaterNombre(bande.ageJours)} · semaine ${Math.ceil(bande.ageJours / 7)}`;
}

/** Same rule as PostgreSQL: 31/01 + 1 month = 28/02 (or 29/02). */
export function ajouterMois(iso, mois) {
  const [a, m, j] = iso.split('-').map(Number);
  const total = m - 1 + mois;
  const annee = a + Math.floor(total / 12);
  const moisFin = (total % 12) + 1;
  const dernierJour = new Date(Date.UTC(annee, moisFin, 0)).getUTCDate();
  const p = (n) => String(n).padStart(2, '0');
  return `${annee}-${p(moisFin)}-${p(Math.min(j, dernierJour))}`;
}

// --- Dialog helpers ----------------------------------------------------------

function creerDialogue(html) {
  const dialogue = document.createElement('dialog');
  dialogue.className = 'dialogue';
  dialogue.innerHTML = html;
  document.body.append(dialogue);
  dialogue.addEventListener('close', () => dialogue.remove());
  dialogue.querySelectorAll('[data-fermer]').forEach((b) => b.addEventListener('click', () => dialogue.close()));
  return dialogue;
}

/**
 * Add (no argument) or edit (with a Bande) form in a dialog.
 * Resolves with the saved Bande, or null if cancelled.
 */
export function ouvrirFormulaireBande(bande = null) {
  const valeurs = bande ?? {
    nom: '', dateDebut: aujourdhui(), dureeMois: 4, nombreMales: '', nombreFemelles: '', prixPoussins: null,
  };
  const dialogue = creerDialogue(`
    <form method="dialog" novalidate>
      <h2>${bande ? 'Modifier la bande' : 'Ajouter une bande'}</h2>
      <div class="message"></div>
      <div class="champ">
        <label for="nom">Nom de la bande</label>
        <input id="nom" maxlength="60" required value="${echapper(valeurs.nom)}" placeholder="Ex. Bande 1">
      </div>
      <div class="champ">
        <label for="dateDebut">Date de début</label>
        <input id="dateDebut" type="date" required value="${echapper(valeurs.dateDebut)}">
      </div>
      <div class="champ">
        <label for="dureeMois">Durée (mois)</label>
        <input id="dureeMois" type="number" min="1" max="12" step="1" required value="${echapper(valeurs.dureeMois)}">
        <span class="aide" id="fin-prevue"></span>
      </div>
      <div class="champs-cote">
        <div class="champ">
          <label for="nombreMales">Poussins mâles</label>
          <input id="nombreMales" type="number" min="0" max="1000000" step="1" inputmode="numeric" value="${echapper(valeurs.nombreMales)}">
        </div>
        <div class="champ">
          <label for="nombreFemelles">Poussins femelles</label>
          <input id="nombreFemelles" type="number" min="0" max="1000000" step="1" inputmode="numeric" value="${echapper(valeurs.nombreFemelles)}">
        </div>
      </div>
      <p class="aide total-poussins" id="total-poussins"></p>
      <div class="champ">
        <label for="prixPoussins">Prix total des poussins (DH)</label>
        <input id="prixPoussins" inputmode="decimal" placeholder="Ex. 32 500" value="${valeurs.prixPoussins == null ? '' : echapper(String(valeurs.prixPoussins).replace('.', ','))}">
        <span class="aide" id="prix-unitaire"></span>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">${bande ? 'Enregistrer' : 'Confirmer'}</button>
      </div>
    </form>`);

  const form = dialogue.querySelector('form');
  const message = dialogue.querySelector('.message');
  const finPrevue = dialogue.querySelector('#fin-prevue');

  const majFin = () => {
    const d = form.dateDebut.value;
    const n = Number(form.dureeMois.value);
    finPrevue.textContent = d && Number.isInteger(n) && n >= 1 && n <= 12
      ? `Fin prévue le ${formaterDate(ajouterMois(d, n))}`
      : '';
  };
  form.dateDebut.addEventListener('input', majFin);
  form.dureeMois.addEventListener('input', majFin);
  majFin();

  const totalPoussins = dialogue.querySelector('#total-poussins');
  const majTotal = () => {
    const total = (Number(form.nombreMales.value) || 0) + (Number(form.nombreFemelles.value) || 0);
    totalPoussins.textContent = `Total : ${formaterNombre(total)} poussins`;
  };
  const prixUnitaire = dialogue.querySelector('#prix-unitaire');
  const lirePrix = () => {
    const t = form.prixPoussins.value.trim().replace(/[\s\u202f\u00a0]/g, '').replace(/dh$/i, '').replace(',', '.');
    if (t === '') return null;
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  };
  const majPrix = () => {
    const prix = lirePrix();
    const total = (Number(form.nombreMales.value) || 0) + (Number(form.nombreFemelles.value) || 0);
    prixUnitaire.textContent = prix != null && !Number.isNaN(prix) && total > 0
      ? `soit ${formaterMontant(Math.round((prix / total) * 100) / 100)} par poussin` : '';
  };
  for (const champ of [form.nombreMales, form.nombreFemelles]) {
    champ.addEventListener('input', majTotal);
    champ.addEventListener('input', majPrix);
  }
  form.prixPoussins.addEventListener('input', majPrix);
  majTotal();
  majPrix();

  return new Promise((resoudre) => {
    let resultat = null;
    dialogue.addEventListener('close', () => resoudre(resultat));

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      message.innerHTML = '';
      effacerErreursChamps(form);
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;
      const corps = {
        nom: form.nom.value,
        dateDebut: form.dateDebut.value,
        dureeMois: form.dureeMois.value === '' ? null : Number(form.dureeMois.value),
        nombreMales: form.nombreMales.value === '' ? 0 : Number(form.nombreMales.value),
        nombreFemelles: form.nombreFemelles.value === '' ? 0 : Number(form.nombreFemelles.value),
        prixPoussins: lirePrix(),
      };
      if (Number.isNaN(corps.prixPoussins)) {
        afficherErreursChamps(form, { prixPoussins: 'Le prix doit être un nombre (ex. 32500 ou 32 500,50).' });
        bouton.disabled = false;
        return;
      }
      try {
        resultat = bande ? await api.put(`/bandes/${bande.id}`, corps) : await api.post('/bandes', corps);
        dialogue.close();
      } catch (e) {
        if (e.details && !e.details.contrainte) afficherErreursChamps(form, e.details);
        else afficherErreur(message, e);
        bouton.disabled = false;
      }
    });

    dialogue.showModal();
    form.nom.focus();
  });
}

/** Asks for the password, then deletes. Resolves true if the Bande was deleted. */
export function confirmerSuppressionBande(bande) {
  const dialogue = creerDialogue(`
    <form method="dialog" novalidate>
      <h2>Supprimer la bande « ${echapper(bande.nom)} » ?</h2>
      <div class="alerte alerte-erreur">
        Toutes les informations de cette bande seront définitivement supprimées
        (${formaterNombre(bande.nombrePoussins)} poussins, début le ${formaterDate(bande.dateDebut)}).
        Cette action est irréversible.
      </div>
      <div class="message"></div>
      <div class="champ">
        <label for="motDePasse">Mot de passe, pour confirmer</label>
        <div class="mot-de-passe-groupe">
          <input id="motDePasse" type="password" autocomplete="current-password" required>
          <button type="button" class="bouton bouton-secondaire" data-basculer="motDePasse">Afficher</button>
        </div>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton bouton-danger">Supprimer définitivement</button>
      </div>
    </form>`);

  const form = dialogue.querySelector('form');
  const message = dialogue.querySelector('.message');
  brancherBasculesMotDePasse(dialogue);

  return new Promise((resoudre) => {
    let supprimee = false;
    dialogue.addEventListener('close', () => resoudre(supprimee));

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      message.innerHTML = '';
      effacerErreursChamps(form);
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;
      try {
        await api.supprimer(`/bandes/${bande.id}`, { motDePasse: form.motDePasse.value });
        supprimee = true;
        dialogue.close();
      } catch (e) {
        if (e.details) afficherErreursChamps(form, e.details);
        else afficherErreur(message, e);
        form.motDePasse.value = '';
        form.motDePasse.focus();
        bouton.disabled = false;
      }
    });

    dialogue.showModal();
    form.motDePasse.focus();
  });
}
