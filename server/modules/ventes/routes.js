// /api/bandes/:bandeId/ventes and /api/ventes/clients — see docs/api.md, phase 7b.
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { idParam } from '../../lib/validation.js';
import {
  lireVentes, ajouterVente, modifierVente, supprimerVente, clients,
} from './service.js';

export const routesVentes = Router({ mergeParams: true });

function bandeId(req) {
  const v = idParam(req.params.bandeId);
  if (!v) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
  return v;
}

function venteId(req) {
  const v = idParam(req.params.id);
  if (!v) throw erreurs.introuvable('Cette vente n’existe pas ou a été supprimée.');
  return v;
}

routesVentes.get('/', async (req, res) => {
  res.json({ data: await lireVentes(bandeId(req)) });
});

routesVentes.post('/', async (req, res) => {
  res.status(201).json({ data: await ajouterVente(bandeId(req), req.body) });
});

routesVentes.put('/:id', async (req, res) => {
  res.json({ data: await modifierVente(bandeId(req), venteId(req), req.body) });
});

// The password travels in the body: { "motDePasse": "…" }
routesVentes.delete('/:id', async (req, res) => {
  res.json({ data: await supprimerVente(bandeId(req), venteId(req), req.body?.motDePasse, req.auth.utilisateurId) });
});

// GET /api/ventes/clients — customers of earlier sales (all Bandes), for suggestions.
export const routesClients = Router();
routesClients.get('/clients', async (req, res) => {
  res.json({ data: await clients() });
});
