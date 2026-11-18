// Home page after login: the list of Bandes. Green = current, red = duration passed.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import { formaterDate, formaterNombre } from '../format.js';
import { echapper, afficherErreur, afficherSucces } from '../ui.js';
import {
  STATUTS, badgeStatut, libelleAge, ouvrirFormulaireBande, confirmerSuppressionBande,
} from '../bandes-commun.js';

monterLayout({ titre: 'Liste des bandes' });

const liste = document.getElementById('liste-bandes');
const message = document.getElementById('message');
let bandes = [];

function carte(b) {
  const s = STATUTS[b.statut] ?? STATUTS.en_cours;
  return `
    <article class="carte-bande ${s.classe}">
      <a class="lien-carte" href="/pages/bande.html?id=${b.id}" aria-label="Ouvrir la bande ${echapper(b.nom)}"></a>
      <div class="carte-bande-entete">
        <h2>${echapper(b.nom)}</h2>
        ${badgeStatut(b)}
      </div>
      <p class="carte-bande-age">${echapper(libelleAge(b))}</p>
      <dl class="liste-cles">
        <dt>Début</dt><dd>${formaterDate(b.dateDebut)}</dd>
        <dt>Fin prévue</dt><dd>${formaterDate(b.dateFin)}</dd>
        <dt>Durée</dt><dd>${b.dureeMois} mois</dd>
        <dt>Vivants</dt><dd>${formaterNombre(b.effectifActuel)} sur ${formaterNombre(b.nombrePoussins)}</dd>
        <dt>Malades</dt><dd>${formaterNombre(b.sante.total.malades)}</dd>
      </dl>
      <div class="carte-bande-actions no-print">
        <button type="button" class="bouton-lien bouton-lien-danger" data-supprimer="${b.id}">Supprimer</button>
      </div>
    </article>`;
}

function afficher() {
  if (!bandes.length) {
    liste.innerHTML = `
      <div class="carte etat-vide">
        <h2>Aucune bande pour le moment</h2>
        <p>Cliquez sur « Ajouter une bande » pour enregistrer votre première bande.</p>
      </div>`;
    return;
  }
  liste.innerHTML = bandes.map(carte).join('');
}

/**
 * Reminder when nothing was saved OFF this PC for 7 days: no backup downloaded and no successful copy
 * to the copy folder. Also says when the automatic copy fails (disk unplugged…).
 */
async function rappelSauvegarde() {
  if (!bandes.length) return;
  try {
    const { derniereSauvegarde, automatique } = await api.get('/sauvegarde');
    const copie = automatique?.derniereCopie;
    const dates = [derniereSauvegarde, copie?.ok ? copie.le : null].filter(Boolean).map((d) => new Date(d).getTime());
    const jours = dates.length ? Math.floor((Date.now() - Math.max(...dates)) / 864e5) : null;
    const lien = '<a href="/pages/parametres.html#titre-sauvegarde">Paramètres → Sauvegarde</a>';
    let texte = '';
    if (copie && !copie.ok) {
      texte = `La copie automatique des sauvegardes n’a pas pu être faite : ${echapper(copie.erreur)} Voir ${lien}.`;
    } else if (jours === null || jours >= 7) {
      texte = `${jours === null ? 'Aucune sauvegarde des données n’a encore été mise hors de ce PC.' : `Dernière sauvegarde mise hors de ce PC : il y a ${jours} jours.`}
        Si le PC tombe en panne, une sauvegarde permet de tout récupérer : ${lien}.`;
    }
    if (texte) document.getElementById('rappel-sauvegarde').innerHTML = `<div class="alerte alerte-info rappel-sauvegarde">${texte}</div>`;
  } catch { /* the reminder is a help, never a blocker */ }
}

async function charger() {
  try {
    bandes = await api.get('/bandes');
    afficher();
    rappelSauvegarde();
  } catch (e) {
    liste.innerHTML = '';
    afficherErreur(message, e);
  }
}

document.getElementById('bouton-ajouter').addEventListener('click', async () => {
  const bande = await ouvrirFormulaireBande();
  if (!bande) return;
  await charger();
  afficherSucces(message, `La bande « ${bande.nom} » a été ajoutée.`);
});

liste.addEventListener('click', async (evt) => {
  const bouton = evt.target.closest('[data-supprimer]');
  if (!bouton) return;
  const bande = bandes.find((b) => b.id === Number(bouton.dataset.supprimer));
  if (bande && await confirmerSuppressionBande(bande)) {
    await charger();
    afficherSucces(message, `La bande « ${bande.nom} » a été supprimée.`);
  }
});

charger();
