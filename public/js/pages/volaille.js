// Mortalité et malades (?bande=…): four declaration forms — malades, guérisons, morts (males,
// females and non-sexed birds) and "Déclarer le sexe" (how many healthy non-sexed birds are
// males / females) — plus the flock table and the list of declarations.
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
    type: 'sexage',
    titre: 'Déclarer le sexe',
    aide: 'Parmi les oiseaux non sexés en bonne santé, indiquez combien sont des mâles et des femelles.',
    bouton: 'Déclarer le sexe',
    classe: 'declaration-sexage',
  },
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
  sexage: 'Sexe déclaré',
  maladie: 'Malades',
  guerison: 'Guérisons',
  mort: 'Morts',
};

function libelleOiseaux(males, femelles, nonSexes = 0) {
  const parts = [];
  if (males) parts.push(`${formaterNombre(males)} mâle${males > 1 ? 's' : ''}`);
  if (femelles) parts.push(`${formaterNombre(femelles)} femelle${femelles > 1 ? 's' : ''}`);
  if (nonSexes) parts.push(`${formaterNombre(nonSexes)} non sexé${nonSexes > 1 ? 's' : ''}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : parts.join('');
}

const nombreSaisi = (input) => (input && input.value !== '' ? Number(input.value) : 0);

// --- Forms -------------------------------------------------------------------

function htmlFormulaire(f) {
  const id = (champ) => `${f.type}-${champ}`;
  const champNombre = (nom, libelle) => `
          <div class="champ">
            <label for="${id(nom)}">${libelle}</label>
            <input id="${id(nom)}" name="${nom}" type="number" min="0" step="1" inputmode="numeric" placeholder="0">
          </div>`;
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
        <div class="${f.type === 'sexage' ? 'champs-cote' : 'champs-trois'}">
          ${champNombre('males', 'Mâles')}
          ${champNombre('femelles', 'Femelles')}
          ${f.type === 'sexage' ? '' : champNombre('nonSexes', 'Non sexés')}
        </div>
        <p class="aide disponibles" data-disponibles></p>
        ${f.type === 'sexage' ? '<p class="aide reste-non-sexes" data-reste></p>' : ''}
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

/** Birds available as the source of each declaration, and what the sexing will leave. */
function majDisponibles() {
  const { males, femelles, nonSexes } = etat.bande.sante;
  for (const form of document.querySelectorAll('#declarations form')) {
    const { type } = form.dataset;
    const zone = form.querySelector('[data-disponibles]');
    if (type === 'sexage') {
      zone.textContent = `Oiseaux non sexés en bonne santé : ${formaterNombre(nonSexes.sains)}.`;
      const reste = nonSexes.sains - nombreSaisi(form.males) - nombreSaisi(form.femelles);
      const r = form.querySelector('[data-reste]');
      r.textContent = reste >= 0
        ? `Il en restera ${formaterNombre(reste)} non sexé${reste > 1 ? 's' : ''}.`
        : `C’est ${formaterNombre(-reste)} de trop.`;
      r.classList.toggle('reste-trop', reste < 0);
      continue;
    }
    let groupe = type === 'guerison' ? 'malades' : 'sains';
    if (type === 'mort') groupe = form.provenance.value;
    zone.textContent = `Disponibles : ${formaterNombre(males[groupe])} mâles, ${formaterNombre(femelles[groupe])} femelles `
      + `et ${formaterNombre(nonSexes[groupe])} non sexés ${groupe === 'sains' ? 'en bonne santé' : 'malades'}.`;
  }
}

function preparerFormulaires() {
  const zone = document.getElementById('declarations');
  zone.innerHTML = FORMULAIRES.map(htmlFormulaire).join('');

  for (const form of zone.querySelectorAll('form')) {
    const { type } = form.dataset;
    form.date.value = aujourdhui();
    form.date.max = aujourdhui();
    form.date.min = etat.bande.dateDebut;
    form.querySelectorAll('[name="provenance"]').forEach((r) => r.addEventListener('change', majDisponibles));
    if (type === 'sexage') [form.males, form.femelles].forEach((i) => i.addEventListener('input', majDisponibles));

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const boite = form.closest('.declaration').querySelector('.message');
      boite.innerHTML = '';
      effacerErreursChamps(form);
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;

      const corps = {
        type,
        date: form.date.value,
        males: nombreSaisi(form.males),
        femelles: nombreSaisi(form.femelles),
        nonSexes: nombreSaisi(form.nonSexes),
        provenance: form.provenance?.value,
        note: form.note.value,
      };
      try {
        etat = await api.post(`/bandes/${bandeId}/volaille`, corps);
        form.males.value = '';
        form.femelles.value = '';
        if (form.nonSexes) form.nonSexes.value = '';
        form.note.value = '';
        afficherEtat();
        const oiseaux = libelleOiseaux(corps.males, corps.femelles, corps.nonSexes);
        const detail = {
          sexage: `Sexe déclaré : ${oiseaux}`, mort: `${oiseaux} morts`, maladie: `${oiseaux} malades`, guerison: `${oiseaux} guéris`,
        }[type];
        afficherSucces(boite, `Enregistré : ${detail} le ${formaterDate(corps.date)}.`, 6000);
      } catch (e) {
        const correspondance = Object.fromEntries(['date', 'males', 'femelles', 'nonSexes', 'note', 'provenance']
          .map((c) => [c, `${type}-${c}`]));
        if (e.details && !e.details.contrainte) afficherErreursChamps(form, e.details, correspondance);
        else afficherErreur(boite, e);
      } finally {
        bouton.disabled = false;
      }
    });
  }
}

// --- Table + list ----------------------------------------------------------------

function precisionType(m) {
  if (m.type === 'mort') return `(${m.provenance === 'malades' ? 'étaient malades' : 'étaient en bonne santé'})`;
  if (m.type === 'sexage') return '(parmi les non sexés)';
  return '';
}

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
          <th scope="col" class="nombre">Non sexés</th>
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
              <span class="texte-discret">${precisionType(m)}</span></td>
            <td class="nombre">${formaterNombre(m.males)}</td>
            <td class="nombre">${formaterNombre(m.femelles)}</td>
            <td class="nombre">${m.type === 'sexage' ? '—' : formaterNombre(m.nonSexes)}</td>
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
    message: `${LIBELLES_TYPE[m.type]} du ${formaterDate(m.date)} : ${libelleOiseaux(m.males, m.femelles, m.nonSexes)}. `
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
