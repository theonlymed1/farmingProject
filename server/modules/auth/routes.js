// /api/auth — see docs/api.md, phase 1.
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { lireParametre } from '../../lib/parametres.js';
import { connecter, deconnecter, changerMotDePasse } from './service.js';
import {
  chargerSession, exigerConnexion, lireJeton, poserCookie, effacerCookie,
} from './middleware.js';

const router = Router();

// GET /api/auth/etat — public: is someone logged in? (+ farm name for the login page)
router.get('/etat', async (req, res) => {
  const session = await chargerSession(req, res);
  res.json({
    data: {
      connecte: Boolean(session),
      identifiant: session?.identifiant ?? null,
      nomExploitation: await lireParametre('nom_exploitation', ''),
    },
  });
});

// POST /api/auth/connexion — public
router.post('/connexion', async (req, res) => {
  const { identifiant, motDePasse } = req.body ?? {};
  const champs = {};
  if (typeof identifiant !== 'string' || !identifiant.trim()) champs.identifiant = 'Saisissez votre identifiant.';
  if (typeof motDePasse !== 'string' || !motDePasse) champs.motDePasse = 'Saisissez votre mot de passe.';
  if (Object.keys(champs).length) throw erreurs.validation('Vérifiez les champs indiqués.', champs);

  const resultat = await connecter(identifiant, motDePasse);
  poserCookie(res, resultat.jeton);
  res.json({ data: { identifiant: resultat.identifiant } });
});

// POST /api/auth/deconnexion — always succeeds, even if the session had already expired
router.post('/deconnexion', async (req, res) => {
  const jeton = lireJeton(req);
  if (jeton) await deconnecter(jeton);
  effacerCookie(res);
  res.status(204).end();
});

// PUT /api/auth/mot-de-passe — logged in only
router.put('/mot-de-passe', exigerConnexion, async (req, res) => {
  const { actuel, nouveau, confirmation } = req.body ?? {};
  await changerMotDePasse(req.auth, {
    actuel: typeof actuel === 'string' ? actuel : '',
    nouveau: typeof nouveau === 'string' ? nouveau : '',
    confirmation: typeof confirmation === 'string' ? confirmation : '',
  });
  res.json({ data: { message: 'Mot de passe modifié.' } });
});

export default router;
