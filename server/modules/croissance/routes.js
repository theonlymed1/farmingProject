// /api/bandes/:bandeId/croissance — see docs/api.md, phase 4 (Croissance et pesées).
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { idParam } from '../../lib/validation.js';
import { lireCroissance, configurer, enregistrerValeurs } from './service.js';

const router = Router({ mergeParams: true });

function bandeId(req) {
  const v = idParam(req.params.bandeId);
  if (!v) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
  return v;
}

router.get('/', async (req, res) => {
  res.json({ data: await lireCroissance(bandeId(req)) });
});

router.put('/config', async (req, res) => {
  res.json({ data: await configurer(bandeId(req), req.body) });
});

router.put('/valeurs', async (req, res) => {
  res.json({ data: await enregistrerValeurs(bandeId(req), req.body) });
});

export default router;
