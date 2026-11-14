// The ONLY file that talks to the server. Pages call api.get('/bandes'), never fetch().
//
// Two modes:
//   'reel' – calls the Express API.
//   'mock' – answers from js/mock/, using the example JSON from docs/api.md.
//            Lets the frontend move ahead before the backend endpoint exists.
//
// Switch without editing code: open any page with ?mode=mock or ?mode=reel.
// The choice is remembered in this browser until you switch again.
import { ErreurApi } from './erreurs.js';
import { repondreMock } from './mock/index.js';

const MODE_PAR_DEFAUT = 'reel';

function lireMode() {
  const demande = new URLSearchParams(location.search).get('mode');
  try {
    if (demande === 'mock' || demande === 'reel') localStorage.setItem('api-mode', demande);
    return localStorage.getItem('api-mode') || MODE_PAR_DEFAUT;
  } catch {
    return demande || MODE_PAR_DEFAUT;
  }
}

export const mode = lireMode();

export function allerALaConnexion() {
  const retour = location.pathname + location.search;
  location.replace(`/pages/connexion.html?retour=${encodeURIComponent(retour)}`);
}

async function requete(methode, chemin, corps) {
  if (mode === 'mock') {
    try {
      return await repondreMock(methode, chemin, corps);
    } catch (e) {
      if (e.status === 401 && !chemin.startsWith('/auth/')) allerALaConnexion();
      throw e;
    }
  }

  let reponse;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: methode,
      headers: corps !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErreurApi(0, 'SERVEUR_INJOIGNABLE',
      'Impossible de joindre le serveur. Vérifiez que l’application est bien démarrée.');
  }

  if (reponse.status === 204) return null;

  let json = null;
  try { json = await reponse.json(); } catch { /* empty or non-JSON body */ }

  if (!reponse.ok) {
    const e = json?.erreur;
    // Session expired (5 h idle) or logged out in another tab → back to the login page,
    // then return here after logging in. /auth/* calls handle their own 401.
    if (reponse.status === 401 && !chemin.startsWith('/auth/')) allerALaConnexion();
    throw new ErreurApi(reponse.status, e?.code ?? 'ERREUR', e?.message ?? 'Une erreur inattendue est survenue.', e?.details);
  }
  return json?.data ?? null;
}

export const api = {
  get: (chemin) => requete('GET', chemin),
  post: (chemin, corps) => requete('POST', chemin, corps ?? {}),
  put: (chemin, corps) => requete('PUT', chemin, corps ?? {}),
  supprimer: (chemin) => requete('DELETE', chemin),
};
