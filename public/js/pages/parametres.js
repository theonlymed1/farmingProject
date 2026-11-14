// Paramètres: change the password. The server checks everything again;
// the checklist here only helps the farmer while typing.
import { monterLayout } from '../layout.js';
import { api, mode } from '../api.js';
import { formaterDateHeure } from '../format.js';
import {
  echapper, afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, brancherBasculesMotDePasse,
} from '../ui.js';

monterLayout({ titre: 'Paramètres' });
brancherBasculesMotDePasse();

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
