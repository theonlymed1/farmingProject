// /api/bandes/:bandeId/employes — see docs/api.md, phase 6.
import { Router } from 'express';
import { erreurs } from '../../lib/erreurs.js';
import { idParam } from '../../lib/validation.js';
import {
  lireEmployes, ajouterEmploye, modifierEmploye, declarerRepos, annulerRepos, enregistrerDepart,
  declarerAvance, supprimerAvance,
} from './service.js';

const router = Router({ mergeParams: true });

function bandeId(req) {
  const v = idParam(req.params.bandeId);
  if (!v) throw erreurs.introuvable('Cette bande n’existe pas ou a été supprimée.');
  return v;
}

function employeId(req) {
  const v = idParam(req.params.id);
  if (!v) throw erreurs.introuvable('Cet employé n’existe pas.');
  return v;
}

router.get('/', async (req, res) => {
  res.json({ data: await lireEmployes(bandeId(req)) });
});

router.post('/', async (req, res) => {
  res.status(201).json({ data: await ajouterEmploye(bandeId(req), req.body) });
});

router.put('/:id', async (req, res) => {
  res.json({ data: await modifierEmploye(bandeId(req), employeId(req), req.body) });
});

router.post('/:id/repos', async (req, res) => {
  res.status(201).json({ data: await declarerRepos(bandeId(req), employeId(req), req.body) });
});

router.delete('/:id/repos/:jour', async (req, res) => {
  res.json({ data: await annulerRepos(bandeId(req), employeId(req), req.params.jour) });
});

// Advance: { "montant": 300, "date": "2026-11-18", "note": "" } → 201 + "avance" for the receipt
router.post('/:id/avances', async (req, res) => {
  res.status(201).json({ data: await declarerAvance(bandeId(req), employeId(req), req.body) });
});

// The password travels in the body: { "motDePasse": "…" }
router.delete('/:id/avances/:avanceId', async (req, res) => {
  const avanceId = idParam(req.params.avanceId);
  if (!avanceId) throw erreurs.introuvable('Cette avance n’existe pas ou a déjà été supprimée.');
  res.json({ data: await supprimerAvance(bandeId(req), employeId(req), avanceId, req.body?.motDePasse, req.auth.utilisateurId) });
});

// Departure ("Supprimer"): { "dateDepart": "2026-11-30", "motDePasse": "…" }
router.post('/:id/depart', async (req, res) => {
  res.json({ data: await enregistrerDepart(bandeId(req), employeId(req), req.body, req.auth.utilisateurId) });
});

export default router;
