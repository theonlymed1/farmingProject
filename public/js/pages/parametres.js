// Paramètres: backup (download / restore), appearance (light / dark theme) and change the password.
// The server checks everything again;
// the checklist here only helps the farmer while typing.
import { monterLayout } from '../layout.js';
import { api, mode } from '../api.js';
import { formaterDateHeure } from '../format.js';
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

async function afficherEtatSauvegarde() {
  try {
    const e = await api.get('/sauvegarde');
    const ancienne = !e.derniereSauvegarde || Date.now() - new Date(e.derniereSauvegarde).getTime() > 7 * 864e5;
    zoneSauvegarde.innerHTML = `
      <p class="${ancienne ? 'sauvegarde-ancienne' : ''}">Dernière sauvegarde téléchargée :
        <strong>${e.derniereSauvegarde ? `le ${dateHeure(e.derniereSauvegarde)} (${ilYa(e.derniereSauvegarde)})` : 'aucune'}</strong>
        ${ancienne ? '<br>Pensez à en télécharger une, au moins une fois par semaine.' : ''}</p>
      ${e.derniereRestauration ? `<p class="texte-discret">Dernière restauration : le ${dateHeure(e.derniereRestauration.le)},
        depuis la sauvegarde du ${dateHeure(e.derniereRestauration.sauvegardeDu)}.</p>` : ''}`;
  } catch (e) {
    afficherErreur(zoneSauvegarde, e);
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
