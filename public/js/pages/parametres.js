// Paramètres: change the password. The server checks everything again;
// the checklist here only helps the farmer while typing.
import { monterLayout } from '../layout.js';
import { api } from '../api.js';
import {
  afficherErreur, afficherSucces, afficherErreursChamps, effacerErreursChamps, brancherBasculesMotDePasse,
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
