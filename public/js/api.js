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
import { repondreMock, sauvegardeMock, restaurerMock } from './mock/index.js';

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

function injoignable() {
  return new ErreurApi(0, 'SERVEUR_INJOIGNABLE',
    'Impossible de joindre le serveur. Vérifiez que l’application est bien démarrée.');
}

/** Error of a non-JSON call (file download / upload): same handling as requete(). */
async function erreurDe(reponse, chemin) {
  let json = null;
  try { json = await reponse.json(); } catch { /* not JSON */ }
  if (reponse.status === 401) allerALaConnexion();
  const e = json?.erreur;
  return new ErreurApi(reponse.status, e?.code ?? 'ERREUR', e?.message ?? `Une erreur inattendue est survenue (${chemin}).`, e?.details);
}

/** Saves the file the server sends (backup) in the browser's downloads. Returns its name. */
async function telecharger(chemin) {
  let nom;
  let blob;
  if (mode === 'mock') {
    ({ nom, blob } = sauvegardeMock());
  } else {
    let reponse;
    try {
      reponse = await fetch(`/api${chemin}`, { credentials: 'same-origin' });
    } catch {
      throw injoignable();
    }
    if (!reponse.ok) throw await erreurDe(reponse, chemin);
    const dispo = reponse.headers.get('Content-Disposition') ?? '';
    const m = /filename\*=UTF-8''([^;]+)/i.exec(dispo) ?? /filename="([^"]+)"/i.exec(dispo);
    nom = m ? decodeURIComponent(m[1]) : 'sauvegarde.avicole';
    blob = await reponse.blob();
  }
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return nom;
}

/** Sends a file as the body (backup restore); the password goes in the X-Mot-De-Passe header. */
async function envoyerFichier(chemin, fichier, motDePasse) {
  if (mode === 'mock') return restaurerMock(await fichier.text(), motDePasse);
  let reponse;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Mot-De-Passe': encodeURIComponent(motDePasse ?? '') },
      body: fichier,
      credentials: 'same-origin',
    });
  } catch {
    throw injoignable();
  }
  if (!reponse.ok) throw await erreurDe(reponse, chemin);
  return (await reponse.json())?.data ?? null;
}

export const api = {
  telecharger,
  envoyerFichier,
  get: (chemin) => requete('GET', chemin),
  post: (chemin, corps) => requete('POST', chemin, corps ?? {}),
  put: (chemin, corps) => requete('PUT', chemin, corps ?? {}),
  // Body is optional, e.g. the password that confirms deleting a Bande.
  supprimer: (chemin, corps) => requete('DELETE', chemin, corps),
};
