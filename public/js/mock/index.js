// Fake API used when api.js runs in 'mock' mode.
// One entry per endpoint from docs/api.md: copy the example response from the contract.
// When the real endpoint is merged, keep the mock: it stays useful for demos and testing.
import { ErreurApi } from '../erreurs.js';

const routes = [
  {
    methode: 'GET',
    motif: /^\/sante$/,
    reponse: () => ({
      statut: 'ok',
      application: '0.1.0 (simulation)',
      base: 'PostgreSQL (simulé)',
      nomExploitation: 'Exploitation avicole',
      heure: new Date().toISOString(),
    }),
  },
  // Phase 2 example:
  // { methode: 'GET', motif: /^\/bandes$/, reponse: () => [ { id: 1, nom: 'Bande 1', … } ] },
  // { methode: 'GET', motif: /^\/bandes\/(\d+)$/, reponse: ({ params: [id] }) => ({ id: Number(id), … }) },
];

export async function repondreMock(methode, chemin, corps) {
  await new Promise((ok) => setTimeout(ok, 150)); // feel of a real request

  const route = routes.find((r) => r.methode === methode && r.motif.test(chemin));
  if (!route) {
    throw new ErreurApi(404, 'ROUTE_INCONNUE', `Simulation absente pour ${methode} ${chemin} (à ajouter dans js/mock/index.js).`);
  }
  const params = chemin.match(route.motif).slice(1);
  return structuredClone(route.reponse({ params, corps }));
}
