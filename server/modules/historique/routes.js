// /api/historique — list with filters, delete one line, clear all (password). See docs/api.md, phase 7.
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { idParam } from '../../lib/validation.js';
import { listerHistorique, supprimerEntree, effacerHistorique } from './service.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json({ data: await listerHistorique(req.query) });
});

// Clear all: { "motDePasse": "…", "bande": 12 } (bande optional: without it, the whole history).
router.post('/effacer', async (req, res) => {
  res.json({ data: await effacerHistorique(req.body ?? {}, req.auth.utilisateurId) });
});

// One line: { "motDePasse": "…" }
router.delete('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) throw erreurs.introuvable('Cette opération n’existe pas.');
  res.json({ data: await supprimerEntree(id, req.body?.motDePasse, req.auth.utilisateurId) });
});

export default router;
