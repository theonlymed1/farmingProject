// One Bande (?id=…): its dashboard, actions (Imprimer, Modifier, Supprimer) and the
// entry point to its features. The printout is the Bande's full information sheet;
// each new feature adds its section here.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import { formaterDate, formaterNombre, formaterDateHeure } from '../format.js';
import { echapper, afficherErreur, afficherSucces } from '../ui.js';
import { tableauSante } from '../volaille-commun.js';
import { resumeDernierControle } from '../croissance-commun.js';
import { tuilesCharges, tableauParType } from '../charges-commun.js';
import {
  STATUTS, badgeStatut, ouvrirFormulaireBande, confirmerSuppressionBande,
} from '../bandes-commun.js';

const fiche = document.getElementById('fiche');
const message = document.getElementById('message');
const id = Number(new URLSearchParams(location.search).get('id'));

// page = null while the feature isn't built yet.
const FONCTIONNALITES = [
  ['Mortalité et malades', 'Déclarer des malades, des guérisons et des morts', 'volaille'],
  ['Croissance et pesées', 'Guide du fournisseur et poids observés', 'croissance'],
  ['Charges', 'Achats et services : aliment, gaz, vaccins…', 'charges'],
  ['Employés', 'Avances, jours travaillés, règlement', null],
  ['Historique', 'Toutes les opérations de la bande', null],
];

const valeurAge = (b) => ({ a_venir: '—', terminee: 'Terminée' }[b.statut] ?? `Jour ${formaterNombre(b.ageJours)}`);
const detailAge = (b) => ({
  a_venir: `commence le ${formaterDate(b.dateDebut)}`,
  terminee: `le ${formaterDate(b.dateFin)}`,
}[b.statut] ?? `semaine ${Math.ceil(b.ageJours / 7)}`);

function afficher(b) {
  const s = STATUTS[b.statut] ?? STATUTS.en_cours;
  fiche.innerHTML = `
    <div class="titre-page">
      <h1>${echapper(b.nom)} ${badgeStatut(b)}</h1>
      <div class="actions-page no-print">
        <button type="button" class="bouton" id="bouton-imprimer-fiche">Imprimer la fiche</button>
        <button type="button" class="bouton bouton-secondaire" id="bouton-modifier">Modifier</button>
        <button type="button" class="bouton bouton-danger" id="bouton-supprimer">Supprimer</button>
      </div>
    </div>

    <section class="indicateurs">
      <div class="indicateur ${s.classe}">
        <span class="indicateur-libelle">Effectif actuel</span>
        <span class="indicateur-valeur">${formaterNombre(b.effectifActuel)}</span>
        <span class="indicateur-detail">sur ${formaterNombre(b.nombrePoussins)} poussins reçus</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Malades / morts</span>
        <span class="indicateur-valeur">${formaterNombre(b.sante.total.malades)} / ${formaterNombre(b.sante.total.morts)}</span>
        <span class="indicateur-detail">mortalité ${b.sante.total.tauxMortalite.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Âge</span>
        <span class="indicateur-valeur">${valeurAge(b)}</span>
        <span class="indicateur-detail">${detailAge(b)}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Fin prévue</span>
        <span class="indicateur-valeur">${formaterDate(b.dateFin)}</span>
        <span class="indicateur-detail">durée ${b.dureeMois} mois</span>
      </div>
    </section>

    <section class="carte" aria-labelledby="titre-infos">
      <h2 id="titre-infos">Informations de la bande</h2>
      <dl class="liste-cles">
        <dt>Nom</dt><dd>${echapper(b.nom)}</dd>
        <dt>Statut</dt><dd>${s.libelle}</dd>
        <dt>Date de début</dt><dd>${formaterDate(b.dateDebut)}</dd>
        <dt>Durée</dt><dd>${b.dureeMois} mois</dd>
        <dt>Fin prévue</dt><dd>${formaterDate(b.dateFin)}</dd>
        <dt>Poussins reçus</dt><dd>${formaterNombre(b.nombrePoussins)}
          (${formaterNombre(b.nombreMales)} mâles, ${formaterNombre(b.nombreFemelles)} femelles)</dd>
        <dt>Créée le</dt><dd>${formaterDateHeure(b.creeLe)}</dd>
        ${b.modifieLe ? `<dt>Dernière modification</dt><dd>${formaterDateHeure(b.modifieLe)}</dd>` : ''}
      </dl>
    </section>

    <section class="carte" aria-labelledby="titre-sante">
      <div class="titre-section">
        <h2 id="titre-sante">État du troupeau</h2>
        <a class="no-print" href="/pages/volaille.html?bande=${b.id}">Mortalité et malades →</a>
      </div>
      ${tableauSante(b.sante)}
    </section>

    <section class="carte" aria-labelledby="titre-croissance">
      <div class="titre-section">
        <h2 id="titre-croissance">Croissance</h2>
        <a class="no-print" href="/pages/croissance.html?bande=${b.id}">Croissance et pesées →</a>
      </div>
      <div id="resume-croissance">Chargement…</div>
    </section>

    <section class="carte" aria-labelledby="titre-charges">
      <div class="titre-section">
        <h2 id="titre-charges">Charges</h2>
        <a class="no-print" href="/pages/charges.html?bande=${b.id}">Charges →</a>
      </div>
      <div id="resume-charges">Chargement…</div>
    </section>

    <section class="carte no-print" aria-labelledby="titre-fonctions">
      <h2 id="titre-fonctions">Gestion de la bande</h2>
      <div class="grille-fonctions">
        ${FONCTIONNALITES.map(([titre, detail, page]) => (page ? `
          <a class="tuile-fonction" href="/pages/${page}.html?bande=${b.id}">
            <strong>${titre}</strong><span>${detail}</span>
          </a>` : `
          <div class="tuile-fonction tuile-bientot">
            <strong>${titre}</strong><span>${detail}</span><small>Bientôt disponible</small>
          </div>`)).join('')}
      </div>
    </section>`;

  document.getElementById('bouton-imprimer-fiche').addEventListener('click', () => window.print());

  api.get(`/bandes/${b.id}/charges`)
    .then((etat) => {
      document.getElementById('resume-charges').innerHTML = etat.resume.nombre
        ? `${tuilesCharges(etat.resume)}${tableauParType(etat.resume)}`
        : '<p class="texte-discret">Aucune charge déclarée pour cette bande.</p>';
    })
    .catch((e) => afficherErreur(document.getElementById('resume-charges'), e));

  api.get(`/bandes/${b.id}/croissance`)
    .then((etat) => { document.getElementById('resume-croissance').innerHTML = resumeDernierControle(etat); })
    .catch((e) => afficherErreur(document.getElementById('resume-croissance'), e));

  document.getElementById('bouton-modifier').addEventListener('click', async () => {
    // Reload so the menu, the page title and the print header show the new name too.
    if (await ouvrirFormulaireBande(b)) location.replace(`/pages/bande.html?id=${b.id}&modifiee=1`);
  });

  document.getElementById('bouton-supprimer').addEventListener('click', async () => {
    if (await confirmerSuppressionBande(b)) location.replace('/pages/bandes.html');
  });
}

try {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Bande introuvable. Revenez à la liste des bandes.');
  const bande = await api.get(`/bandes/${id}`);
  monterLayout({ titre: `Fiche de la bande « ${bande.nom} »`, bande });
  afficher(bande);
  if (new URLSearchParams(location.search).has('modifiee')) {
    afficherSucces(message, 'Bande modifiée.');
    history.replaceState(null, '', `/pages/bande.html?id=${id}`);
  }
} catch (e) {
  monterLayout({ titre: 'Bande' });
  fiche.innerHTML = '<p><a href="/pages/bandes.html">← Retour à la liste des bandes</a></p>';
  afficherErreur(message, e);
}
