// Builds the Express app: JSON API under /api, the frontend files from public/.
// Express 5 forwards errors thrown in async handlers to the error handler by itself.
import express from 'express';
import config from './config.js';
import { gestionnaireErreurs, routeApiInconnue } from './lib/erreurs.js';
import santeRoutes from './modules/sante/routes.js';

export function creerApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // --- API ---------------------------------------------------------------
  const api = express.Router();
  api.use('/sante', santeRoutes);
  // New modules are mounted here, one line each, as phases land:
  // api.use('/auth', authRoutes);                     // phase 1
  // api.use('/bandes', bandesRoutes);                 // phase 2
  // api.use('/bandes/:bandeId/charges', chargesRoutes) // phase 6 …
  api.use(routeApiInconnue);
  app.use('/api', api);

  // --- Frontend ------------------------------------------------------------
  // `extensions` lets /pages/bandes serve pages/bandes.html.
  app.use(express.static(config.publicDir, { extensions: ['html'] }));

  app.use(gestionnaireErreurs);
  return app;
}
