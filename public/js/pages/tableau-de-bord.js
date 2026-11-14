// Dashboard. Phase 0: shows that the frontend reaches the API (or the mock).
// Phase 3 replaces the health block with the Bande indicators.
import { monterLayout, definirNomExploitation } from '../layout.js';
import { api, mode } from '../api.js';
import { formaterDateHeure } from '../format.js';
import { afficherErreur, echapper } from '../ui.js';

monterLayout({ titre: 'Tableau de bord' });

const zone = document.getElementById('etat-serveur');

try {
  const sante = await api.get('/sante');
  definirNomExploitation(sante.nomExploitation);
  zone.innerHTML = `
    <dl class="liste-cles">
      <dt>Statut</dt><dd><span class="badge badge-ok">${echapper(sante.statut)}</span></dd>
      <dt>Exploitation</dt><dd>${echapper(sante.nomExploitation)}</dd>
      <dt>Version</dt><dd>${echapper(sante.application)}</dd>
      <dt>Base de données</dt><dd>${echapper(sante.base)}</dd>
      <dt>Heure du serveur</dt><dd>${echapper(formaterDateHeure(sante.heure))}</dd>
      <dt>Mode API</dt><dd>${mode === 'mock' ? 'Simulation' : 'Réel'}</dd>
    </dl>`;
} catch (e) {
  afficherErreur(zone, e);
}
