// GET /api/historique?bande=&module=&action=&du=&au=&q=&limite=&decalage= — see docs/api.md, phase 7.
import { Router } from 'express';
import { listerHistorique } from './service.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json({ data: await listerHistorique(req.query) });
});

export default router;
