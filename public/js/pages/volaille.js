// Mortalité et malades (?bande=…): three declaration forms (malades, guérisons, morts),
// males and females separately, the flock table and the list of declarations.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import { formaterDate, formaterNombre, aujourdhui } from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, confirmer,
} from '../ui.js';
import { tableauSante } from '../volaille-commun.js';

const bandeId = Number(new URLSearchParams(location.search).get('bande'));
const message = document.getElementById('message');
let etat = null; // { bande, mouvements }

const FORMULAIRES = [
  {
    type: 'maladie',
    titre: 'Déclarer des malades',
    aide: 'Des oiseaux en bonne santé tombent malades et sont mis à part.',
    bouton: 'Déclarer malades',
    classe: 'declaration-maladie',
  },
  {
    type: 'guerison',
    titre: 'Déclarer des guérisons',
    aide: 'Des oiseaux malades sont guéris et rejoignent les oiseaux en bonne santé.',
    bouton: 'Déclarer guéris',
    classe: 'declaration-guerison',
  },
  {
    type: 'mort',
    titre: 'Déclarer des morts',
    aide: 'Des oiseaux sont morts.',
    bouton: 'Déclarer morts',
    classe: 'declaration-mort',
  },
];

const LIBELLES_TYPE = {
  maladie: 'Malades',
  guerison: 'Guérisons',
  mort: 'Morts',
};

function libelleOiseaux(males, femelles) {
  const parts = [];
  if (males) parts.push(`${formaterNombre(males)} mâle${males > 1 ? 's' : ''}`);
  if (femelles) parts.push(`${formaterNombre(femelles)} femelle${femelles > 1 ? 's' : ''}`);
  return parts.join(' et ');
}

// --- Forms -------------------------------------------------------------------

function htmlFormulaire(f) {
  const id = (champ) => `${f.type}-${champ}`;
  return `
    <section class="carte declaration ${f.classe}" aria-labelledby="${id('titre')}">
      <h2 id="${id('titre')}">${f.titre}</h2>
      <p class="aide-declaration">${f.aide}</p>
      <div class="message" aria-live="polite"></div>
      <form data-type="${f.type}" novalidate>
        <div class="champ">
          <label for="${id('date')}">Date</label>
          <input id="${id('date')}" name="date" type="date" required>
        </div>
        <div class="champs-cote">
          <div class="champ">
            <label for="${id('males')}">Mâles</label>
            <input id="${id('males')}" name="males" type="number" min="0" step="1" inputmode="numeric" placeholder="0">
          </div>
          <div class="champ">
            <label for="${id('femelles')}">Femelles</label>
            <input id="${id('femelles')}" name="femelles" type="number" min="0" step="1" inputmode="numeric" placeholder="0">
          </div>
        </div>
        <p class="aide disponibles" data-disponibles></p>
        ${f.type === 'mort' ? `
        <fieldset class="champ choix" id="${id('provenance')}">
          <legend>Avant de mourir, ces oiseaux étaient :</legend>
          <label><input type="radio" name="provenance" value="sains" checked> en bonne santé</label>
          <label><input type="radio" name="provenance" value="malades"> malades</label>
        </fieldset>` : ''}
        <div class="champ">
          <label for="${id('note')}">Remarque <span class="texte-discret">(facultatif)</span></label>
          <input id="${id('note')}" name="note" maxlength="200" placeholder="${f.type === 'mort' ? 'Ex. coup de chaleur' : ''}">
        </div>
        <button type="submit" class="bouton">${f.bouton}</button>
      </form>
    </section>`;
}

/** Healthy / sick birds available as the source of each declaration. */
function majDisponibles() {
  const { males, femelles } = etat.bande.sante;
  const texte = (groupe, mot) => `Disponibles : ${formaterNombre(males[groupe])} mâles et ${formaterNombre(femelles[groupe])} femelles ${mot}.`;
  for (const form of document.querySelectorAll('#declarations form')) {
    let groupe = form.dataset.type === 'guerison' ? 'malades' : 'sains';
    if (form.dataset.type === 'mort') groupe = form.provenance.value;
    form.querySelector('[data-disponibles]').textContent = texte(groupe, groupe === 'sains' ? 'en bonne santé' : 'malades');
  }
}

function preparerFormulaires() {
  const zone = document.getElementById('declarations');
  zone.innerHTML = FORMULAIRES.map(htmlFormulaire).join('');

  for (const form of zone.querySelectorAll('form')) {
    form.date.value = aujourdhui();
    form.date.max = aujourdhui();
    form.date.min = etat.bande.dateDebut;
    form.querySelectorAll('[name="provenance"]').forEach((r) => r.addEventListener('change', majDisponibles));

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const boite = form.closest('.declaration').querySelector('.message');
      boite.innerHTML = '';
      effacerErreursChamps(form);
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;

      const corps = {
        type: form.dataset.type,
        date: form.date.value,
        males: form.males.value === '' ? 0 : Number(form.males.value),
        femelles: form.femelles.value === '' ? 0 : Number(form.femelles.value),
        provenance: form.provenance?.value,
        note: form.note.value,
      };
      try {
        etat = await api.post(`/bandes/${bandeId}/volaille`, corps);
        afficherEtat();
        form.males.value = '';
        form.femelles.value = '';
        form.note.value = '';
        const detail = corps.type === 'mort' ? ' morts' : corps.type === 'maladie' ? ' malades' : ' guéris';
        afficherSucces(boite, `Enregistré : ${libelleOiseaux(corps.males, corps.femelles)}${detail} le ${formaterDate(corps.date)}.`, 6000);
      } catch (e) {
        const correspondance = { date: `${corps.type}-date`, males: `${corps.type}-males`, femelles: `${corps.type}-femelles`, note: `${corps.type}-note`, provenance: `${corps.type}-provenance` };
        if (e.details && !e.details.contrainte) afficherErreursChamps(form, e.details, correspondance);
        else afficherErreur(boite, e);
      } finally {
        bouton.disabled = false;
      }
    });
  }
}

// --- Table + list ----------------------------------------------------------------

function afficherJournal() {
  const zone = document.getElementById('journal');
  if (!etat.mouvements.length) {
    zone.innerHTML = '<p class="texte-discret">Aucune déclaration pour cette bande.</p>';
    return;
  }
  zone.innerHTML = `
    <table class="tableau">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Déclaration</th>
          <th scope="col" class="nombre">Mâles</th>
          <th scope="col" class="nombre">Femelles</th>
          <th scope="col" class="nombre">Total</th>
          <th scope="col">Remarque</th>
          <th scope="col" class="no-print"><span class="visuellement-cache">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${etat.mouvements.map((m) => `
          <tr>
            <td>${formaterDate(m.date)}</td>
            <td><span class="badge badge-${m.type}">${LIBELLES_TYPE[m.type]}</span>
              ${m.type === 'mort' ? `<span class="texte-discret">(${m.provenance === 'malades' ? 'étaient malades' : 'étaient en bonne santé'})</span>` : ''}</td>
            <td class="nombre">${formaterNombre(m.males)}</td>
            <td class="nombre">${formaterNombre(m.femelles)}</td>
            <td class="nombre">${formaterNombre(m.total)}</td>
            <td>${echapper(m.note ?? '')}</td>
            <td class="no-print"><button type="button" class="bouton-lien bouton-lien-danger" data-annuler="${m.id}">Annuler</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function afficherEtat() {
  document.getElementById('etat').innerHTML = tableauSante(etat.bande.sante);
  afficherJournal();
  majDisponibles();
}

document.getElementById('journal').addEventListener('click', async (evt) => {
  const bouton = evt.target.closest('[data-annuler]');
  if (!bouton) return;
  const m = etat.mouvements.find((x) => x.id === Number(bouton.dataset.annuler));
  const ok = await confirmer({
    titre: 'Annuler cette déclaration ?',
    message: `${LIBELLES_TYPE[m.type]} du ${formaterDate(m.date)} : ${libelleOiseaux(m.males, m.femelles)}. `
      + 'Les nombres du troupeau seront recalculés.',
    bouton: 'Annuler la déclaration',
    danger: true,
  });
  if (!ok) return;
  try {
    await api.supprimer(`/bandes/${bandeId}/volaille/${m.id}`);
    etat = await api.get(`/bandes/${bandeId}/volaille`);
    afficherEtat();
    afficherSucces(message, 'Déclaration annulée.');
  } catch (e) {
    afficherErreur(message, e);
  }
});

document.getElementById('bouton-imprimer-page').addEventListener('click', () => window.print());

try {
  if (!Number.isInteger(bandeId) || bandeId <= 0) throw new Error('Bande introuvable. Revenez à la liste des bandes.');
  etat = await api.get(`/bandes/${bandeId}/volaille`);
  monterLayout({ titre: `Mortalité et malades — ${etat.bande.nom}`, bande: etat.bande });
  document.getElementById('sous-titre').textContent = `${etat.bande.nom} · début le ${formaterDate(etat.bande.dateDebut)}`;
  preparerFormulaires();
  afficherEtat();
} catch (e) {
  monterLayout({ titre: 'Mortalité et malades' });
  document.getElementById('etat').innerHTML = '<p><a href="/pages/bandes.html">← Retour à la liste des bandes</a></p>';
  afficherErreur(message, e);
}
