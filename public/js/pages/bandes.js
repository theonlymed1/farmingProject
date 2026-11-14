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
        <dt>Poussins</dt><dd>${formaterNombre(b.nombrePoussins)}</dd>
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

async function charger() {
  try {
    bandes = await api.get('/bandes');
    afficher();
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
