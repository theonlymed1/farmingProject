// /api/bandes/:bandeId/volaille — see docs/api.md, phase 3 (Mortalité et malades).
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { idParam } from '../../lib/validation.js';
import { lireSante, declarer, supprimerMouvement } from './service.js';

const router = Router({ mergeParams: true });

function bandeId(req) {
  const v = idParam(req.params.bandeId);
  if (!v) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
  return v;
}

router.get('/', async (req, res) => {
  res.json({ data: await lireSante(bandeId(req)) });
});

router.post('/', async (req, res) => {
  res.status(201).json({ data: await declarer(bandeId(req), req.body) });
});

router.delete('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) throw erreurs.introuvable('Cette déclaration n’existe pas ou a déjà été supprimée.');
  await supprimerMouvement(bandeId(req), id);
  res.status(204).end();
});

export default router;
