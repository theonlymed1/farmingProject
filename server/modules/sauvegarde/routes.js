// /api/sauvegarde — backups (Paramètres): download one, restore one, automatic daily backups
// and the copy folder. See docs/api.md.
import express, { Router } from 'express';
import { etatSauvegarde, creerSauvegarde, restaurerSauvegarde } from './service.js';
import {
  etatAutomatique, sauvegarderMaintenant, definirDossierCopie, lireFichierAutomatique,
} from './automatique.js';

const router = Router();

function envoyerFichier(res, nomFichier, contenu) {
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${nomFichier}"; filename*=UTF-8''${encodeURIComponent(nomFichier)}`,
    'Cache-Control': 'no-store',
  });
  res.send(contenu);
}

function motDePasse(req) {
  const brut = req.get('X-Mot-De-Passe') ?? '';
  try { return decodeURIComponent(brut); } catch { return brut; }
}

router.get('/', async (req, res) => {
  res.json({ data: { ...(await etatSauvegarde()), automatique: await etatAutomatique() } });
});

// A new file with all the data, made now (the browser saves it in Téléchargements).
router.get('/fichier', async (req, res) => {
  const { nomFichier, contenu } = await creerSauvegarde();
  envoyerFichier(res, nomFichier, contenu);
});

// Body = the file (application/octet-stream). The password travels in the header
// X-Mot-De-Passe (URI-encoded), since the body is the file.
router.post('/restaurer', express.raw({ type: () => true, limit: '500mb' }), async (req, res) => {
  res.json({ data: await restaurerSauvegarde(req.body, motDePasse(req), req.auth.utilisateurId) });
});

// Automatic backup now (and its copy), even if today's one exists.
router.post('/automatiques', async (req, res) => {
  const fait = await sauvegarderMaintenant({ forcer: true });
  res.status(201).json({ data: { fait, automatique: await etatAutomatique() } });
});

router.get('/automatiques/:nom', async (req, res) => {
  envoyerFichier(res, req.params.nom, lireFichierAutomatique(req.params.nom));
});

// Restore one of the automatic backups of this PC: password in the header, like /restaurer.
router.post('/automatiques/:nom/restaurer', async (req, res) => {
  res.json({ data: await restaurerSauvegarde(lireFichierAutomatique(req.params.nom), motDePasse(req), req.auth.utilisateurId) });
});

// { "dossier": "D:\\Sauvegardes ferme" } — '' removes the copy.
router.put('/dossier-copie', async (req, res) => {
  res.json({ data: await definirDossierCopie(req.body?.dossier) });
});

export default router;
