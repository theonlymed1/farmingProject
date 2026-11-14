// Login page. On success, goes back to the page that was asked for (or the dashboard).
import { api } from '../api.js';
import {
  afficherErreur, afficherErreursChamps, effacerErreursChamps, brancherBasculesMotDePasse,
} from '../ui.js';

const formulaire = document.getElementById('formulaire-connexion');
const message = document.getElementById('message');
const bouton = document.getElementById('bouton-connexion');

brancherBasculesMotDePasse();

// Only allow returning to one of our own pages (never an outside address).
function pageDeRetour() {
  const retour = new URLSearchParams(location.search).get('retour');
  return retour && /^\/pages\/[\w-]+(\.html)?(\?[^#]*)?$/.test(retour) && !retour.startsWith('/pages/connexion')
    ? retour
    : '/pages/tableau-de-bord.html';
}

try {
  const etat = await api.get('/auth/etat');
  if (etat.connecte) location.replace(pageDeRetour());
  document.getElementById('nom-exploitation').textContent = etat.nomExploitation;
} catch (e) {
  afficherErreur(message, e);
}

formulaire.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  message.innerHTML = '';
  effacerErreursChamps(formulaire);
  bouton.disabled = true;
  bouton.textContent = 'Connexion…';

  try {
    await api.post('/auth/connexion', {
      identifiant: formulaire.identifiant.value,
      motDePasse: formulaire.motDePasse.value,
    });
    location.replace(pageDeRetour());
  } catch (e) {
    if (e.details) afficherErreursChamps(formulaire, e.details, { motDePasse: 'mot-de-passe' });
    else afficherErreur(message, e);
    formulaire.motDePasse.value = '';
    formulaire.motDePasse.focus();
    bouton.disabled = false;
    bouton.textContent = 'Se connecter';
  }
});
