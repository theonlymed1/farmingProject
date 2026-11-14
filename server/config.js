// Central configuration. Everything that differs between dev and the farmer's PC lives here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prod = process.env.NODE_ENV === 'production';

// Dev: data stays inside the project (.donnees/, git-ignored).
// Production: C:\ProgramData\PlateformeAvicole, which survives app updates.
const dossierDonnees = prod
  ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'PlateformeAvicole')
  : path.join(racine, '.donnees');

const pkg = JSON.parse(fs.readFileSync(path.join(racine, 'package.json'), 'utf8'));

const config = {
  prod,
  version: pkg.version,
  debug: process.env.DEBUG === '1',

  // Listen on localhost only: nothing is exposed to the network.
  host: '127.0.0.1',
  port: Number(process.env.PORT) || 3000,

  racine,
  publicDir: path.join(racine, 'public'),
  dossierDonnees,
  sauvegardesDir: path.join(dossierDonnees, 'sauvegardes'),

  auth: {
    // Username of the single account, created automatically on first start.
    identifiantParDefaut: 'admin',
    // The session ends after this much inactivity (or on "Se déconnecter").
    inactiviteMs: 5 * 60 * 60 * 1000,
    nomCookie: 'avicole_session',
  },

  db: {
    dataDir: path.join(dossierDonnees, 'data'),
    // Non-standard port so we never collide with another PostgreSQL on the PC.
    port: Number(process.env.DB_PORT) || 54329,
    user: 'avicole',
    // Local-only cluster bound to 127.0.0.1; this password never leaves the PC.
    password: 'avicole-local',
    name: 'avicole',
  },
};

export default config;
