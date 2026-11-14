// Health check: proves that Express AND PostgreSQL answer. Also serves as the template
// for every feature module (one folder per feature: routes.js, service.js, validation.js).
import { Router } from 'express';
import { query } from '../../db/postgres.js';
import config from '../../config.js';

const router = Router();

// GET /api/sante
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT current_setting('server_version') AS version_pg,
            now() AS heure,
            (SELECT valeur FROM parametre WHERE cle = 'nom_exploitation') AS nom_exploitation`,
  );
  const r = rows[0];
  res.json({
    data: {
      statut: 'ok',
      application: config.version,
      base: `PostgreSQL ${r.version_pg}`,
      nomExploitation: r.nom_exploitation,
      heure: r.heure,
    },
  });
});

export default router;
