// Builds the Express app: JSON API under /api, the frontend files from public/.
// Express 5 forwards errors thrown in async handlers to the error handler by itself.
import express from 'express';
import config from './config.js';
import { gestionnaireErreurs, routeApiInconnue } from './lib/erreurs.js';
import authRoutes from './modules/auth/routes.js';
import { exigerConnexion, protegerPages } from './modules/auth/middleware.js';
import santeRoutes from './modules/sante/routes.js';
import bandesRoutes from './modules/bandes/routes.js';
import volailleRoutes from './modules/volaille/routes.js';
import croissanceRoutes from './modules/croissance/routes.js';

export function creerApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // --- API ---------------------------------------------------------------
  const api = express.Router();

  // Public routes (login page) — BEFORE the guard.
  api.use('/auth', authRoutes);

  // Everything below requires a logged-in session.
  api.use(exigerConnexion);
  api.use('/sante', santeRoutes);
  api.use('/bandes/:bandeId/volaille', volailleRoutes);
  api.use('/bandes/:bandeId/croissance', croissanceRoutes);
  api.use('/bandes', bandesRoutes);
  // New modules are mounted here, one line each, as phases land:
  // api.use('/bandes/:bandeId/charges', chargesRoutes) // phase 6 …

  api.use(routeApiInconnue);
  app.use('/api', api);

  // --- Frontend ------------------------------------------------------------
  // Pages need a session (except the login page); CSS/JS files stay public.
  app.use(protegerPages);
  // `extensions` lets /pages/bandes serve pages/bandes.html.
  app.use(express.static(config.publicDir, { extensions: ['html'] }));

  app.use(gestionnaireErreurs);
  return app;
}
