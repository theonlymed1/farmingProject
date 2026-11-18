// /api/sauvegarde — download a backup of all the data, restore one (Paramètres). See docs/api.md.
import express, { Router } from 'express';
import { etatSauvegarde, creerSauvegarde, restaurerSauvegarde } from './service.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json({ data: await etatSauvegarde() });
});

// The file itself (the browser saves it in Téléchargements).
router.get('/fichier', async (req, res) => {
  const { nomFichier, contenu } = await creerSauvegarde();
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${nomFichier}"; filename*=UTF-8''${encodeURIComponent(nomFichier)}`,
    'Cache-Control': 'no-store',
  });
  res.send(contenu);
});

// Body = the file (application/octet-stream). The password travels in the header
// X-Mot-De-Passe (URI-encoded), since the body is the file.
router.post('/restaurer', express.raw({ type: () => true, limit: '500mb' }), async (req, res) => {
  let motDePasse = req.get('X-Mot-De-Passe') ?? '';
  try { motDePasse = decodeURIComponent(motDePasse); } catch { /* sent as is */ }
  res.json({ data: await restaurerSauvegarde(req.body, motDePasse, req.auth.utilisateurId) });
});

export default router;
