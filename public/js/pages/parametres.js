// Paramètres: backup (download / restore), appearance (light / dark theme) and change the password.
// The server checks everything again;
// the checklist here only helps the farmer while typing.
import { monterLayout } from '../layout.js';
import { api, mode } from '../api.js';
import { formaterDateHeure, formaterDate } from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, brancherBasculesMotDePasse,
  confirmerAvecMotDePasse,
} from '../ui.js';

monterLayout({ titre: 'Paramètres' });
brancherBasculesMotDePasse();

// --- Sauvegarde: download a backup file, restore one (password) ----------------------------------
const zoneSauvegarde = document.getElementById('etat-sauvegarde');
const messageSauvegarde = document.getElementById('message-sauvegarde');
const champFichier = document.getElementById('fichier-sauvegarde');
const boutonRestaurer = document.getElementById('bouton-restaurer');
const apercuFichier = document.getElementById('apercu-fichier');
let enteteFichier = null;

const deux = (n) => String(n).padStart(2, '0');
const dateHeure = (iso) => {
  const d = new Date(iso);
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} à ${deux(d.getHours())}:${deux(d.getMinutes())}`;
};
function ilYa(iso) {
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}

const zoneAuto = document.getElementById('zone-automatique');
const tailleTexte = (o) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);

function htmlAutomatique(a) {
  if (!a) {
    return '<p class="texte-discret">Les sauvegardes automatiques fonctionnent avec l’application installée (pas en mode simulation).</p>';
  }
  const c = a.derniereCopie;
  return `
    <p>Chaque jour, l’application enregistre toute seule une sauvegarde sur ce PC et garde les ${a.aGarder} dernières, dans :
      <code class="chemin">${echapper(a.dossierLocal)}</code></p>
    <p>Dernière sauvegarde automatique : <strong>${a.derniereAuto ? `le ${dateHeure(a.derniereAuto)}` : 'pas encore'}</strong>
      <button type="button" class="bouton bouton-secondaire bouton-petit" id="bouton-auto-maintenant">Sauvegarder maintenant</button></p>

    <form id="form-dossier-copie" class="form-dossier-copie" novalidate>
      <div class="champ">
        <label for="dossier">Copier aussi chaque sauvegarde dans ce dossier <span class="texte-discret">(facultatif, recommandé)</span></label>
        <input id="dossier" value="${echapper(a.dossierCopie ?? '')}" placeholder="Ex. D:\Sauvegardes ferme  ou  C:\Users\…\OneDrive\Ferme">
        <span class="aide">Un autre disque, ou un dossier OneDrive / Google Drive : si ce PC tombe en panne, les copies restent.</span>
      </div>
      <div class="actions-dossier">
        <button type="submit" class="bouton bouton-secondaire">Enregistrer le dossier</button>
        ${a.dossierCopie ? '<button type="button" class="bouton-lien bouton-lien-danger" id="bouton-retirer-copie">Ne plus copier</button>' : ''}
      </div>
    </form>
    ${c ? `<div class="alerte ${c.ok ? 'alerte-succes' : 'alerte-erreur'} alerte-copie">${c.ok
    ? `Dernière copie réussie le ${dateHeure(c.le)} dans <code class="chemin">${echapper(c.dossier)}</code>.`
    : `La dernière copie a échoué (le ${dateHeure(c.le)}) : ${echapper(c.erreur)}`}</div>` : ''}

    ${a.fichiers.length ? `
    <details class="liste-auto">
      <summary>Voir les sauvegardes automatiques de ce PC (${a.fichiers.length})</summary>
      <table class="tableau tableau-compact">
        <thead><tr><th scope="col">Jour</th><th scope="col" class="nombre">Taille</th>
          <th scope="col"><span class="visuellement-cache">Actions</span></th></tr></thead>
        <tbody>
          ${a.fichiers.map((f) => `
            <tr>
              <td>${formaterDate(f.jour)}</td>
              <td class="nombre">${tailleTexte(f.taille)}</td>
              <td class="actions-ligne">
                <button type="button" class="bouton-lien" data-telecharger-auto="${echapper(f.nom)}">Télécharger</button>
                <button type="button" class="bouton-lien bouton-lien-danger" data-restaurer-auto="${echapper(f.nom)}" data-jour="${f.jour}">Restaurer</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </details>` : ''}`;
}

zoneAuto.addEventListener('click', async (evt) => {
  const b = evt.target.closest('#bouton-auto-maintenant, #bouton-retirer-copie, [data-telecharger-auto], [data-restaurer-auto]');
  if (!b) return;
  messageSauvegarde.innerHTML = '';
  try {
    if (b.id === 'bouton-auto-maintenant') {
      b.disabled = true;
      b.textContent = 'Sauvegarde en cours…';
      const { fait } = await api.post('/sauvegarde/automatiques');
      afficherSucces(messageSauvegarde, `Sauvegarde enregistrée sur ce PC (${fait.fichier})${fait.copie?.ok ? ' et copiée dans le dossier choisi' : ''}.`);
    } else if (b.id === 'bouton-retirer-copie') {
      await api.put('/sauvegarde/dossier-copie', { dossier: '' });
      afficherSucces(messageSauvegarde, 'Les sauvegardes ne sont plus copiées dans un autre dossier.');
    } else if (b.dataset.telechargerAuto) {
      await api.telecharger(`/sauvegarde/automatiques/${encodeURIComponent(b.dataset.telechargerAuto)}`);
      return;
    } else {
      const resultat = await confirmerAvecMotDePasse({
        titre: `Restaurer la sauvegarde du ${formaterDate(b.dataset.jour)} ?`,
        avertissement: `Toutes les données actuelles vont être remplacées par celles de la sauvegarde automatique du ${formaterDate(b.dataset.jour)}. `
          + 'Ce qui a été saisi après sera perdu. Conseil : cliquez d’abord sur « Sauvegarder maintenant ».',
        bouton: 'Restaurer',
        action: (motDePasse) => api.envoyerFichier(`/sauvegarde/automatiques/${encodeURIComponent(b.dataset.restaurerAuto)}/restaurer`, new Blob([]), motDePasse),
      });
      if (!resultat) return;
      afficherSucces(messageSauvegarde, `Données restaurées depuis la sauvegarde du ${dateHeure(resultat.restauration.sauvegardeDu)}. `
        + 'Toutes les pages affichent maintenant ces données.');
    }
  } catch (e) {
    afficherErreur(messageSauvegarde, e);
  }
  afficherEtatSauvegarde();
});

zoneAuto.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  const form = evt.target;
  effacerErreursChamps(form);
  messageSauvegarde.innerHTML = '';
  const bouton = form.querySelector('[type="submit"]');
  bouton.disabled = true;
  bouton.textContent = 'Vérification…';
  try {
    const a = await api.put('/sauvegarde/dossier-copie', { dossier: form.dossier.value });
    afficherSucces(messageSauvegarde, a.dossierCopie
      ? `Dossier enregistré : chaque sauvegarde sera aussi copiée dans « ${a.dossierCopie} ».`
      : 'Les sauvegardes ne sont plus copiées dans un autre dossier.');
    afficherEtatSauvegarde();
  } catch (e) {
    if (e.details) afficherErreursChamps(form, e.details);
    else afficherErreur(messageSauvegarde, e);
    bouton.disabled = false;
    bouton.textContent = 'Enregistrer le dossier';
  }
});

async function afficherEtatSauvegarde() {
  try {
    const e = await api.get('/sauvegarde');
    zoneAuto.innerHTML = htmlAutomatique(e.automatique);
    const ancienne = !e.derniereSauvegarde || Date.now() - new Date(e.derniereSauvegarde).getTime() > 7 * 864e5;
    zoneSauvegarde.innerHTML = `
      <p class="${ancienne ? 'sauvegarde-ancienne' : ''}">Dernière sauvegarde téléchargée :
        <strong>${e.derniereSauvegarde ? `le ${dateHeure(e.derniereSauvegarde)} (${ilYa(e.derniereSauvegarde)})` : 'aucune'}</strong>
        ${ancienne ? '<br>Pensez à en télécharger une, au moins une fois par semaine.' : ''}</p>
      ${e.derniereRestauration ? `<p class="texte-discret">Dernière restauration : le ${dateHeure(e.derniereRestauration.le)},
        depuis la sauvegarde du ${dateHeure(e.derniereRestauration.sauvegardeDu)}.</p>` : ''}`;
  } catch (e) {
    afficherErreur(zoneSauvegarde, e);
    zoneAuto.innerHTML = '';
  }
}

document.getElementById('bouton-telecharger').addEventListener('click', async (evt) => {
  const bouton = evt.currentTarget;
  bouton.disabled = true;
  bouton.textContent = 'Préparation du fichier…';
  messageSauvegarde.innerHTML = '';
  try {
    const nom = await api.telecharger('/sauvegarde/fichier');
    afficherSucces(messageSauvegarde, `Sauvegarde téléchargée : « ${nom} ». Elle se trouve dans le dossier Téléchargements : `
      + 'copiez-la sur une clé USB ou un autre support.');
    afficherEtatSauvegarde();
  } catch (e) {
    afficherErreur(messageSauvegarde, e);
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Télécharger une sauvegarde';
  }
});

/** Reads the header of a backup file in the browser, to show what it contains before restoring. */
async function lireEntete(fichier) {
  const debut = new Uint8Array(await fichier.slice(0, 2).arrayBuffer());
  let texte;
  if (debut[0] === 0x1f && debut[1] === 0x8b) {
    // gzip: decompress only the beginning (the header is the first line).
    const lecteur = fichier.stream().pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
    texte = '';
    while (!texte.includes('\n')) {
      const { value, done } = await lecteur.read();
      if (done) break;
      texte += value;
      if (texte.length > 5e6) break;
    }
    lecteur.cancel().catch(() => {});
    texte = texte.slice(0, texte.indexOf('\n'));
  } else {
    texte = await fichier.text(); // simulation file (mock mode): plain JSON
  }
  const e = JSON.parse(texte);
  if (!String(e.format).startsWith('plateforme-avicole-sauvegarde')) throw new Error('format');
  return e;
}

champFichier.addEventListener('change', async () => {
  enteteFichier = null;
  boutonRestaurer.disabled = true;
  apercuFichier.innerHTML = '';
  const fichier = champFichier.files[0];
  if (!fichier) return;
  try {
    enteteFichier = await lireEntete(fichier);
    const n = enteteFichier.nombres ?? {};
    const total = Object.values(n).reduce((t, x) => t + x, 0);
    apercuFichier.innerHTML = `Sauvegarde du <strong>${dateHeure(enteteFichier.creeLe)}</strong>`
      + `${enteteFichier.nomExploitation ? ` — ${echapper(enteteFichier.nomExploitation)}` : ''}`
      + `${enteteFichier.application ? ` — version ${echapper(enteteFichier.application)}` : ''}`
      + `${n.bande !== undefined ? ` — ${n.bande} bande${n.bande > 1 ? 's' : ''}, ${total.toLocaleString('fr-FR')} enregistrements` : ''}.`;
    boutonRestaurer.disabled = false;
  } catch {
    apercuFichier.innerHTML = '<span class="reste-trop">Ce fichier n’est pas une sauvegarde de la plateforme. '
      + 'Choisissez un fichier .avicole téléchargé depuis cette page.</span>';
  }
});

boutonRestaurer.addEventListener('click', async () => {
  const fichier = champFichier.files[0];
  if (!fichier || !enteteFichier) return;
  const resultat = await confirmerAvecMotDePasse({
    titre: 'Restaurer cette sauvegarde ?',
    avertissement: `Toutes les données actuelles vont être remplacées par celles de la sauvegarde du ${dateHeure(enteteFichier.creeLe)}. `
      + 'Ce qui a été saisi après cette date sera perdu. Conseil : téléchargez d’abord une sauvegarde des données actuelles.',
    bouton: 'Restaurer',
    action: (motDePasse) => api.envoyerFichier('/sauvegarde/restaurer', fichier, motDePasse),
  });
  if (!resultat) return;
  champFichier.value = '';
  apercuFichier.innerHTML = '';
  boutonRestaurer.disabled = true;
  afficherSucces(messageSauvegarde, `Données restaurées depuis la sauvegarde du ${dateHeure(resultat.restauration.sauvegardeDu)}. `
    + 'Toutes les pages affichent maintenant ces données.');
  afficherEtatSauvegarde();
});

afficherEtatSauvegarde();

// Apparence: light / dark / like Windows (js/theme.js applies it on every page).
const choixTheme = document.getElementById('choix-theme');
const radioActuel = choixTheme.querySelector(`[value="${window.themeAvicole?.lire() ?? 'clair'}"]`);
if (radioActuel) radioActuel.checked = true;
choixTheme.addEventListener('change', (evt) => window.themeAvicole?.choisir(evt.target.value));

const formulaire = document.getElementById('formulaire-mdp');
const message = document.getElementById('message');
const bouton = document.getElementById('bouton-enregistrer');
const nouveau = document.getElementById('nouveau');

const REGLES = {
  longueur: (m) => m.length >= 10,
  minuscule: (m) => /[a-z]/.test(m),
  majuscule: (m) => /[A-Z]/.test(m),
  chiffre: (m) => /\d/.test(m),
  special: (m) => /[^A-Za-z0-9]/.test(m),
};

nouveau.addEventListener('input', () => {
  for (const li of document.querySelectorAll('#regles li')) {
    li.classList.toggle('ok', REGLES[li.dataset.regle](nouveau.value));
  }
});

formulaire.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  message.innerHTML = '';
  effacerErreursChamps(formulaire);
  bouton.disabled = true;

  try {
    await api.put('/auth/mot-de-passe', {
      actuel: formulaire.actuel.value,
      nouveau: formulaire.nouveau.value,
      confirmation: formulaire.confirmation.value,
    });
    formulaire.reset();
    document.querySelectorAll('#regles li').forEach((li) => li.classList.remove('ok'));
    afficherSucces(message, 'Mot de passe modifié. Utilisez-le à la prochaine connexion.', 6000);
  } catch (e) {
    if (e.details) afficherErreursChamps(formulaire, e.details);
    else afficherErreur(message, e);
  } finally {
    bouton.disabled = false;
  }
});

// --- À propos: version and database, useful when something needs checking ----
const zone = document.getElementById('etat-serveur');
try {
  const sante = await api.get('/sante');
  zone.innerHTML = `
    <dl class="liste-cles">
      <dt>Statut</dt><dd><span class="badge badge-ok">${echapper(sante.statut)}</span></dd>
      <dt>Exploitation</dt><dd>${echapper(sante.nomExploitation)}</dd>
      <dt>Version</dt><dd>${echapper(sante.application)}</dd>
      <dt>Base de données</dt><dd>${echapper(sante.base)}</dd>
      <dt>Heure du serveur</dt><dd>${echapper(formaterDateHeure(sante.heure))}</dd>
      ${mode === 'mock' ? '<dt>Mode API</dt><dd>Simulation</dd>' : ''}
    </dl>`;
} catch (e) {
  afficherErreur(zone, e);
}
