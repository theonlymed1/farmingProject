// /api/bandes/:bandeId/vehicules — see docs/api.md, "Véhicules".
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { idParam } from '../../lib/validation.js';
import {
  lireVehicules, ajouterVehicule, declarerCharge, supprimerCharge, supprimerVehicule,
} from './service.js';

const router = Router({ mergeParams: true });

function id(req, cle, message) {
  const v = idParam(req.params[cle]);
  if (!v) throw erreurs.introuvable(message);
  return v;
}
const bandeId = (req) => id(req, 'bandeId', 'Cette bande n’existe pas ou a été supprimée.');
const vehiculeId = (req) => id(req, 'id', 'Ce véhicule n’existe pas ou a été supprimé.');

router.get('/', async (req, res) => {
  res.json({ data: await lireVehicules(bandeId(req)) });
});

// { "nom": "Camion", "modele": "Isuzu NPR", "matricule": "12345-A-6" }
router.post('/', async (req, res) => {
  res.status(201).json({ data: await ajouterVehicule(bandeId(req), req.body) });
});

// The password travels in the body: { "motDePasse": "…" }
router.delete('/:id', async (req, res) => {
  res.json({ data: await supprimerVehicule(bandeId(req), vehiculeId(req), req.body?.motDePasse, req.auth.utilisateurId) });
});

// { "libelle": "Vidange", "date": "2026-11-18", "montant": 450, "description": "" }
router.post('/:id/charges', async (req, res) => {
  res.status(201).json({ data: await declarerCharge(bandeId(req), vehiculeId(req), req.body) });
});

router.delete('/:id/charges/:chargeId', async (req, res) => {
  const chargeId = id(req, 'chargeId', 'Cette charge n’existe pas ou a déjà été supprimée.');
  res.json({ data: await supprimerCharge(bandeId(req), vehiculeId(req), chargeId, req.body?.motDePasse, req.auth.utilisateurId) });
});

export default router;
