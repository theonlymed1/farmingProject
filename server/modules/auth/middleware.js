// Cookie handling + guards for the API and the HTML pages.
import config from '../../config.js';
import { erreurs } from '../../lib/erreurs.js';
import { verifierSession } from './service.js';

const { nomCookie, inactiviteMs } = config.auth;

export function lireJeton(req) {
  const entete = req.headers.cookie;
  if (!entete) return null;
  for (const morceau of entete.split(';')) {
    const [nom, ...valeur] = morceau.trim().split('=');
    if (nom === nomCookie) return decodeURIComponent(valeur.join('='));
  }
  return null;
}

export function poserCookie(res, jeton) {
  // httpOnly: page scripts can't read it. sameSite strict: other sites can't use it.
  // Max-Age is pushed forward on activity, so the browser forgets it after 5 h idle too.
  res.cookie(nomCookie, jeton, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: inactiviteMs });
}

export function effacerCookie(res) {
  res.clearCookie(nomCookie, { httpOnly: true, sameSite: 'strict', path: '/' });
}

/** Sets req.auth if the cookie holds a valid session; returns it or null. */
export async function chargerSession(req, res) {
  if (req.auth !== undefined) return req.auth;
  const jeton = lireJeton(req);
  let session = null;
  if (jeton) {
    session = await verifierSession(jeton);
    if (!session) effacerCookie(res);
    else if (session.rafraichie) poserCookie(res, jeton);
  }
  req.auth = session;
  return session;
}

/** API guard: 401 when not logged in. */
export async function exigerConnexion(req, res, next) {
  if (await chargerSession(req, res)) return next();
  return next(erreurs.nonAutorise('Votre session a expiré. Veuillez vous reconnecter.'));
}

/**
 * Page guard, mounted before express.static:
 *  - /pages/connexion(.html): open; already logged in → list of Bandes.
 *  - any other /pages/*: not logged in → login page, then back to the page asked for.
 */
export async function protegerPages(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const m = /^\/pages\/([\w-]+)(?:\.html)?$/.exec(req.path);
  if (!m) return next();

  const session = await chargerSession(req, res);
  if (m[1] === 'connexion') {
    return session ? res.redirect('/pages/bandes.html') : next();
  }
  if (!session) {
    return res.redirect(`/pages/connexion.html?retour=${encodeURIComponent(req.originalUrl)}`);
  }
  // Don't let the browser show a protected page from cache after logout.
  res.set('Cache-Control', 'no-store');
  return next();
}
