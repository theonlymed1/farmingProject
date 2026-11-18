// /api/construction — charges of the new farm being built (no link with the Bandes). See docs/api.md.
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { idParam } from '../../lib/validation.js';
import {
  lireConstruction, ajouterCharge, modifierCharge, supprimerCharge,
} from './service.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json({ data: await lireConstruction() });
});

// charge générale:   { "type": "grosse", "date", "nom", "quantite" (text), "montantTotal", "description"? }
// charge spécifique: { "type": "petite", "date", "nom", "unite", "quantite" (number), "prixUnitaire", "description"? }
router.post('/charges', async (req, res) => {
  res.status(201).json({ data: await ajouterCharge(req.body) });
});

// Same body as POST ("type" is ignored: a charge keeps its kind).
router.put('/charges/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) throw erreurs.introuvable('Cette charge n’existe pas ou a été supprimée.');
  res.json({ data: await modifierCharge(id, req.body) });
});

// The password travels in the body: { "motDePasse": "…" }
router.delete('/charges/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) throw erreurs.introuvable('Cette charge n’existe pas ou a déjà été supprimée.');
  res.json({ data: await supprimerCharge(id, req.body?.motDePasse, req.auth.utilisateurId) });
});

export default router;
