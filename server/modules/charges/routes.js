// /api/bandes/:bandeId/charges and /api/charges/suggestions — see docs/api.md, phase 5.
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { idParam } from '../../lib/validation.js';
import {
  lireCharges, ajouterCharge, modifierCharge, supprimerCharge, suggestions,
} from './service.js';

export const routesCharges = Router({ mergeParams: true });

function bandeId(req) {
  const v = idParam(req.params.bandeId);
  if (!v) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
  return v;
}

function chargeId(req) {
  const v = idParam(req.params.id);
  if (!v) throw erreurs.introuvable('Cette charge n’existe pas ou a été supprimée.');
  return v;
}

routesCharges.get('/', async (req, res) => {
  res.json({ data: await lireCharges(bandeId(req)) });
});

routesCharges.post('/', async (req, res) => {
  res.status(201).json({ data: await ajouterCharge(bandeId(req), req.body) });
});

routesCharges.put('/:id', async (req, res) => {
  res.json({ data: await modifierCharge(bandeId(req), chargeId(req), req.body) });
});

// The password travels in the body: { "motDePasse": "…" }
routesCharges.delete('/:id', async (req, res) => {
  res.json({ data: await supprimerCharge(bandeId(req), chargeId(req), req.body?.motDePasse, req.auth.utilisateurId) });
});

// GET /api/charges/suggestions?vendeur=… — sellers, types, products and units used before (all Bandes).
export const routesSuggestions = Router();
routesSuggestions.get('/suggestions', async (req, res) => {
  res.json({ data: await suggestions({ vendeur: req.query.vendeur ?? '' }) });
});
