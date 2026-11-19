// Ventes (?bande=…): declare, edit, delete (password) and print the sales of the Bande,
// with a printable invoice (facture) for each sale. Sold birds leave the flock.
import { monterLayout } from '../layout.js';
import { imprimerHtml } from '../impression.js';
import { api } from '../api.js';
import {
  formaterDate, formaterMontant, formaterNombre, aujourdhui,
} from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, confirmerAvecMotDePasse,
} from '../ui.js';
import { lireNombre, ecrireNombre } from '../charges-commun.js';
import { tuilesVentes, formaterKg, TYPES_CLIENT } from '../ventes-commun.js';

const bandeId = Number(new URLSearchParams(location.search).get('bande'));
const zone = document.getElementById('contenu-ventes');
const message = document.getElementById('message');
let etat = null; // { bande, ventes, resume }
let nomExploitation = 'Ferme Sidi Aidi';
let recherche = '';

/** '3 mâles, 2 femelles et 4 non sexés' */
function libelleOiseaux(v) {
  const parts = [];
  if (v.males) parts.push(`${formaterNombre(v.males)} mâle${v.males > 1 ? 's' : ''}`);
  if (v.femelles) parts.push(`${formaterNombre(v.femelles)} femelle${v.femelles > 1 ? 's' : ''}`);
  if (v.nonSexes) parts.push(`${formaterNombre(v.nonSexes)} non sexé${v.nonSexes > 1 ? 's' : ''}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : parts.join('');
}

/** "1 250,5", "1250.5 kg", "800 g", "1,2 t" → kg ; '' → null ; nonsense → NaN (same rules as the server). */
function lirePoids(texte) {
  const m = /^(.*?)\s*(kg|g|t)?\s*$/i.exec(String(texte ?? '').trim());
  const n = lireNombre(m[1]);
  if (n == null || Number.isNaN(n)) return n;
  return Math.round(n * { kg: 1, g: 0.001, t: 1000 }[(m[2] ?? 'kg').toLowerCase()] * 1000) / 1000;
}

// --- List ---------------------------------------------------------------------------

function ventesFiltrees() {
  const q = recherche.trim().toLowerCase();
  return q ? etat.ventes.filter((v) => v.client.toLowerCase().includes(q) || v.numero.toLowerCase().includes(q)) : etat.ventes;
}

function htmlListe() {
  if (!etat.ventes.length) {
    return `<div class="etat-vide-charges"><p>Aucune vente pour le moment.</p>
      <p class="texte-discret">Cliquez sur « Déclarer une vente » quand un client achète des oiseaux.</p></div>`;
  }
  const liste = ventesFiltrees();
  if (!liste.length) return '<p class="texte-discret">Aucune vente ne correspond à la recherche.</p>';
  const somme = (cle) => liste.reduce((t, v) => t + v[cle], 0);
  return `
    <div class="defilement-tableau">
    <table class="tableau tableau-charges tableau-ventes">
      <thead>
        <tr>
          <th scope="col">N°</th>
          <th scope="col">Date</th>
          <th scope="col">Client</th>
          <th scope="col">Oiseaux</th>
          <th scope="col" class="nombre">Poids total</th>
          <th scope="col" class="nombre">Prix total</th>
          <th scope="col">Description</th>
          <th scope="col" class="no-print"><span class="visuellement-cache">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${liste.map((v) => `
          <tr>
            <td class="cellule-numero">${echapper(v.numero)}</td>
            <td>${formaterDate(v.date)}</td>
            <td>${echapper(v.client)}<br><span class="badge badge-client">${TYPES_CLIENT[v.typeClient]}</span></td>
            <td><strong>${formaterNombre(v.oiseaux)}</strong><br><span class="detail-cellule">${libelleOiseaux(v)}</span></td>
            <td class="nombre">${formaterKg(v.poidsTotalKg)}<br><span class="detail-cellule">≈ ${formaterKg(v.poidsMoyenKg)} / oiseau</span></td>
            <td class="nombre"><strong>${formaterMontant(v.prixTotal)}</strong><br><span class="detail-cellule">≈ ${formaterMontant(v.prixParOiseau)} / oiseau</span></td>
            <td class="cellule-description">${echapper(v.description ?? '')}</td>
            <td class="no-print actions-ligne">
              <button type="button" class="bouton-lien" data-facture="${v.id}">Facture</button>
              <button type="button" class="bouton-lien" data-modifier="${v.id}">Modifier</button>
              <button type="button" class="bouton-lien bouton-lien-danger" data-supprimer="${v.id}">Supprimer</button>
            </td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colspan="3">Total${recherche.trim() ? ' (recherche)' : ''} — ${liste.length} vente${liste.length > 1 ? 's' : ''}</th>
          <td><strong>${formaterNombre(somme('oiseaux'))}</strong></td>
          <td class="nombre">${formaterKg(Math.round(somme('poidsTotalKg') * 1000) / 1000)}</td>
          <td class="nombre">${formaterMontant(somme('prixTotal'))}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
    </div>`;
}

function afficher() {
  document.getElementById('sous-titre').textContent = `${etat.bande.nom} · début le ${formaterDate(etat.bande.dateDebut)}`
    + ` · ${formaterNombre(etat.bande.effectifActuel)} oiseaux sur la ferme`;
  zone.innerHTML = `
    ${tuilesVentes(etat.resume)}

    <section class="carte" aria-labelledby="titre-liste">
      <div class="titre-section">
        <h2 id="titre-liste">Liste des ventes</h2>
        ${recherche.trim() ? `<span class="texte-discret seulement-impression">Recherche : « ${echapper(recherche.trim())} »</span>` : ''}
      </div>
      ${etat.ventes.length ? `
      <div class="filtres no-print">
        <label>Rechercher :
          <input id="recherche" type="search" class="champ-recherche" placeholder="Nom du client ou n° de facture" value="${echapper(recherche)}">
        </label>
      </div>` : ''}
      <div id="liste">${htmlListe()}</div>
    </section>`;
  const champ = zone.querySelector('#recherche');
  champ?.addEventListener('input', () => {
    recherche = champ.value;
    zone.querySelector('#liste').innerHTML = htmlListe();
  });
}

// --- Form (add / edit) ----------------------------------------------------------------

async function ouvrirFormulaire(vente = null) {
  const v = vente ?? {
    date: aujourdhui(), client: '', typeClient: 'particulier', males: 0, femelles: 0, nonSexes: 0,
    poidsTotalKg: null, prixTotal: null, description: '',
  };
  const nombreInitial = (n) => (n ? String(n) : '');
  const d = document.createElement('dialog');
  d.className = 'dialogue dialogue-large';
  d.innerHTML = `
    <form method="dialog" novalidate autocomplete="off">
      <h2>${vente ? `Modifier la vente n° ${echapper(vente.numero)}` : 'Déclarer une vente'}</h2>
      <div class="message"></div>
      <div class="champs-cote">
        <div class="champ">
          <label for="client">Nom du client</label>
          <input id="client" list="liste-clients" maxlength="100" value="${echapper(v.client)}" placeholder="Ex. Hassan Alaoui ou Ferme Atlas SARL">
          <datalist id="liste-clients"></datalist>
        </div>
        <div class="champ">
          <label for="date">Date</label>
          <input id="date" type="date" value="${echapper(v.date)}" min="${etat.bande.dateDebut}" max="${aujourdhui()}">
        </div>
      </div>
      <fieldset class="champ choix choix-ligne" id="typeClient">
        <legend>Type de client</legend>
        <div class="options-ligne">
          <label><input type="radio" name="typeClient" value="particulier"${v.typeClient === 'particulier' ? ' checked' : ''}> Particulier (une personne)</label>
          <label><input type="radio" name="typeClient" value="societe"${v.typeClient === 'societe' ? ' checked' : ''}> Société</label>
        </div>
      </fieldset>
      <fieldset class="champ choix">
        <legend>Oiseaux vendus</legend>
        <div class="champs-trois">
          <div class="champ"><label for="males">Mâles</label>
            <input id="males" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${nombreInitial(v.males)}"></div>
          <div class="champ"><label for="femelles">Femelles</label>
            <input id="femelles" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${nombreInitial(v.femelles)}"></div>
          <div class="champ"><label for="nonSexes">Non sexés</label>
            <input id="nonSexes" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${nombreInitial(v.nonSexes)}"></div>
        </div>
        <p class="aide disponibles" data-disponibles></p>
        <p class="aide" data-total-oiseaux></p>
      </fieldset>
      <div class="champs-cote">
        <div class="champ">
          <label for="poidsTotalKg">Poids total (kg)</label>
          <input id="poidsTotalKg" inputmode="decimal" value="${echapper(ecrireNombre(v.poidsTotalKg))}" placeholder="Ex. 1250 ou 1 250,5">
          <span class="aide" data-poids-moyen></span>
        </div>
        <div class="champ">
          <label for="prixTotal">Prix total (DH)</label>
          <input id="prixTotal" inputmode="decimal" value="${echapper(ecrireNombre(v.prixTotal))}" placeholder="Ex. 18000">
          <span class="aide" data-prix-moyen></span>
        </div>
      </div>
      <div class="champ">
        <label for="description">Description <span class="texte-discret">(facultatif)</span></label>
        <textarea id="description" rows="2" maxlength="500" placeholder="Ex. Payé en espèces, reste 2 000 DH à payer">${echapper(v.description ?? '')}</textarea>
      </div>
      <div class="actions-dialogue">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Annuler</button>
        <button type="submit" class="bouton">${vente ? 'Enregistrer' : 'Déclarer la vente'}</button>
      </div>
    </form>`;
  document.body.append(d);
  const form = d.querySelector('form');
  d.querySelector('[data-fermer]').addEventListener('click', () => d.close());

  // Birds that can be sold: healthy ones still on the farm (+ this sale's own birds when editing).
  const { males, femelles, nonSexes } = etat.bande.sante;
  const dispo = {
    males: males.sains + (vente?.males ?? 0),
    femelles: femelles.sains + (vente?.femelles ?? 0),
    nonSexes: nonSexes.sains + (vente?.nonSexes ?? 0),
  };
  const compte = (input) => (input.value === '' ? 0 : Number(input.value));
  function apercu() {
    d.querySelector('[data-disponibles]').textContent = `Disponibles (en bonne santé) : ${formaterNombre(dispo.males)} mâles, `
      + `${formaterNombre(dispo.femelles)} femelles et ${formaterNombre(dispo.nonSexes)} non sexés.`;
    const n = compte(form.males) + compte(form.femelles) + compte(form.nonSexes);
    const trop = ['males', 'femelles', 'nonSexes'].filter((k) => compte(form[k]) > dispo[k]);
    const total = d.querySelector('[data-total-oiseaux]');
    total.innerHTML = trop.length
      ? `<span class="reste-trop">Plus d’oiseaux que disponibles (${trop.map((k) => ({ males: 'mâles', femelles: 'femelles', nonSexes: 'non sexés' })[k]).join(', ')}).</span>`
      : `Total : <strong>${formaterNombre(Number.isFinite(n) ? n : 0)}</strong> oiseau${n > 1 ? 'x' : ''}.`;

    const kg = lirePoids(form.poidsTotalKg.value);
    const prix = lireNombre(form.prixTotal.value);
    const okN = Number.isFinite(n) && n > 0;
    d.querySelector('[data-poids-moyen]').textContent = okN && kg > 0
      ? `Poids estimé par oiseau : ${formaterKg(Math.round((kg / n) * 1000) / 1000)}` : 'Le poids estimé par oiseau s’affiche ici.';
    d.querySelector('[data-prix-moyen]').textContent = okN && prix != null && !Number.isNaN(prix)
      ? `Prix estimé par oiseau : ${formaterMontant(Math.round((prix / n) * 100) / 100)}`
        + `${kg > 0 ? ` · ${formaterMontant(Math.round((prix / kg) * 100) / 100)} le kg` : ''}`
      : 'Le prix estimé par oiseau s’affiche ici.';
  }
  form.addEventListener('input', apercu);
  apercu();

  // Customers of earlier sales; a known customer fills in their usual type.
  let clientsConnus = [];
  api.get('/ventes/clients').then((liste) => {
    clientsConnus = liste;
    d.querySelector('#liste-clients').innerHTML = liste.map((c) => `<option value="${echapper(c.client)}"></option>`).join('');
  }).catch(() => { /* suggestions are a help, never a blocker */ });
  form.client.addEventListener('change', () => {
    const c = clientsConnus.find((x) => x.client.toLowerCase() === form.client.value.trim().toLowerCase());
    if (c) form.querySelector(`[name="typeClient"][value="${c.typeClient}"]`).checked = true;
  });

  return new Promise((resoudre) => {
    let resultat = null;
    d.addEventListener('close', () => { d.remove(); resoudre(resultat); });
    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      effacerErreursChamps(form);
      form.querySelector('.message').innerHTML = '';
      const champs = {};
      const kg = lirePoids(form.poidsTotalKg.value);
      const prix = lireNombre(form.prixTotal.value);
      if (Number.isNaN(kg)) champs.poidsTotalKg = 'Le poids doit être un nombre (ex. 1250 ou 1 250,5 kg).';
      if (Number.isNaN(prix)) champs.prixTotal = 'Le prix doit être un nombre (ex. 18000 ou 18 000,50).';
      if (Object.keys(champs).length) { afficherErreursChamps(form, champs); return; }

      const corps = {
        date: form.date.value,
        client: form.client.value,
        typeClient: form.querySelector('[name="typeClient"]:checked')?.value,
        males: form.males.value,
        femelles: form.femelles.value,
        nonSexes: form.nonSexes.value,
        poidsTotalKg: kg,
        prixTotal: prix,
        description: form.description.value,
      };
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;
      try {
        resultat = vente
          ? await api.put(`/bandes/${bandeId}/ventes/${vente.id}`, corps)
          : await api.post(`/bandes/${bandeId}/ventes`, corps);
        d.close();
      } catch (e) {
        if (e.details && !e.details.contrainte) afficherErreursChamps(form, e.details);
        else afficherErreur(form.querySelector('.message'), e);
        bouton.disabled = false;
      }
    });
    d.showModal();
    (vente ? form.prixTotal : form.client).focus();
  });
}

// --- Facture (invoice) --------------------------------------------------------------------

function htmlFacture(v) {
  const lignes = [['Mâles', v.males], ['Femelles', v.femelles], ['Non sexés', v.nonSexes]].filter(([, n]) => n > 0);
  return `
    <div class="recu facture">
      <div class="recu-entete">
        <div>
          <strong class="facture-exploitation">${echapper(nomExploitation)}</strong><br>
          <span class="texte-discret">Bande « ${echapper(etat.bande.nom)} »</span>
        </div>
        <div class="facture-numero">
          <strong>Facture n° ${echapper(v.numero)}</strong><br>
          <span>Date : ${formaterDate(v.date)}</span>
        </div>
      </div>
      <dl class="liste-cles">
        <dt>Client</dt><dd><strong>${echapper(v.client)}</strong></dd>
        <dt>Type de client</dt><dd>${TYPES_CLIENT[v.typeClient]}</dd>
      </dl>
      <table class="tableau tableau-facture">
        <thead>
          <tr><th scope="col">Désignation</th><th scope="col" class="nombre">Nombre d’oiseaux</th></tr>
        </thead>
        <tbody>
          ${lignes.map(([libelle, n]) => `<tr><td>Poulets — ${libelle.toLowerCase()}</td><td class="nombre">${formaterNombre(n)}</td></tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><th scope="row">Total des oiseaux</th><td class="nombre">${formaterNombre(v.oiseaux)}</td></tr>
        </tfoot>
      </table>
      <dl class="liste-cles">
        <dt>Poids total</dt><dd>${formaterKg(v.poidsTotalKg)}</dd>
        <dt>Poids estimé par oiseau</dt><dd>${formaterKg(v.poidsMoyenKg)}</dd>
        <dt>Prix estimé par oiseau</dt><dd>${formaterMontant(v.prixParOiseau)}</dd>
        <dt>Prix au kg</dt><dd>${formaterMontant(v.prixParKg)}</dd>
      </dl>
      <p class="facture-total">Montant total : <strong>${formaterMontant(v.prixTotal)}</strong></p>
      ${v.description ? `<p class="recu-phrase"><strong>Description :</strong> ${echapper(v.description)}</p>` : ''}
      <p class="texte-discret facture-note">Le poids et le prix par oiseau sont des estimations : poids total et prix total ÷ nombre d’oiseaux.</p>
      <div class="recu-signatures">
        <div>Signature du client</div>
        <div>Signature et cachet du vendeur</div>
      </div>
    </div>`;
}

function imprimerFacture(v) {
  imprimerHtml(htmlFacture(v));
}

function montrerFacture(v) {
  const d = document.createElement('dialog');
  d.className = 'dialogue dialogue-large';
  d.innerHTML = `
    <div>
      ${htmlFacture(v)}
      <div class="actions-dialogue no-print">
        <button type="button" class="bouton bouton-secondaire" data-fermer>Fermer</button>
        <button type="button" class="bouton" data-imprimer-facture>Imprimer la facture</button>
      </div>
    </div>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.querySelector('[data-fermer]').addEventListener('click', () => d.close());
  d.querySelector('[data-imprimer-facture]').addEventListener('click', () => imprimerFacture(v));
  d.showModal();
}

// --- Actions ------------------------------------------------------------------------

document.getElementById('bouton-ajouter').addEventListener('click', async () => {
  const nouvel = await ouvrirFormulaire();
  if (!nouvel) return;
  etat = nouvel;
  afficher();
  const v = nouvel.vente;
  afficherSucces(message, `Vente n° ${v.numero} déclarée : ${formaterNombre(v.oiseaux)} oiseau${v.oiseaux > 1 ? 'x' : ''} à ${v.client}, ${formaterMontant(v.prixTotal)}.`);
  montrerFacture(v);
});

zone.addEventListener('click', async (evt) => {
  const bouton = evt.target.closest('[data-facture], [data-modifier], [data-supprimer]');
  if (!bouton) return;
  const [action, valeur] = Object.entries(bouton.dataset)[0];
  const vente = etat.ventes.find((v) => v.id === Number(valeur));
  if (action === 'facture') {
    montrerFacture(vente);
    return;
  }
  if (action === 'modifier') {
    const nouvel = await ouvrirFormulaire(vente);
    if (!nouvel) return;
    etat = nouvel;
    afficher();
    afficherSucces(message, `Vente n° ${vente.numero} modifiée.`);
    return;
  }
  const nouvel = await confirmerAvecMotDePasse({
    titre: `Supprimer la vente n° ${vente.numero} ?`,
    avertissement: `${formaterNombre(vente.oiseaux)} oiseau${vente.oiseaux > 1 ? 'x' : ''} à ${vente.client}, le ${formaterDate(vente.date)}`
      + ` — ${formaterMontant(vente.prixTotal)}. Les oiseaux reviendront dans le troupeau. Cette action est irréversible.`,
    bouton: 'Supprimer la vente',
    action: (motDePasse) => api.supprimer(`/bandes/${bandeId}/ventes/${vente.id}`, { motDePasse }),
  });
  if (!nouvel) return;
  etat = nouvel;
  afficher();
  afficherSucces(message, `Vente n° ${vente.numero} supprimée.`);
});

document.getElementById('bouton-imprimer-page').addEventListener('click', () => window.print());

try {
  if (!Number.isInteger(bandeId) || bandeId <= 0) throw new Error('Bande introuvable. Revenez à la liste des bandes.');
  etat = await api.get(`/bandes/${bandeId}/ventes`);
  monterLayout({ titre: `Ventes — ${etat.bande.nom}`, bande: etat.bande });
  document.getElementById('bouton-ajouter').disabled = false;
  afficher();
  api.get('/auth/etat').then((x) => { nomExploitation = x.nomExploitation; }).catch(() => {});
} catch (e) {
  monterLayout({ titre: 'Ventes' });
  zone.innerHTML = '<p><a href="/pages/bandes.html">← Retour à la liste des bandes</a></p>';
  afficherErreur(message, e);
}
