// /api/bandes — see docs/api.md, phase 2.
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { idParam } from '../../lib/validation.js';
import {
  listerBandes, lireBande, creerBande, modifierBande, supprimerBande,
} from './service.js';

const router = Router();

function id(req) {
  const v = idParam(req.params.id);
  if (!v) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
  return v;
}

router.get('/', async (req, res) => {
  res.json({ data: await listerBandes() });
});

router.post('/', async (req, res) => {
  res.status(201).json({ data: await creerBande(req.body) });
});

router.get('/:id', async (req, res) => {
  res.json({ data: await lireBande(id(req)) });
});

router.put('/:id', async (req, res) => {
  res.json({ data: await modifierBande(id(req), req.body) });
});

// The password travels in the body: { "motDePasse": "…" }
router.delete('/:id', async (req, res) => {
  await supprimerBande(id(req), req.body?.motDePasse, req.auth.utilisateurId);
  res.status(204).end();
});

export default router;
