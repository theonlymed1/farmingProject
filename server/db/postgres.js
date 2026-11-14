// Starts the embedded PostgreSQL that ships with the app, and exposes the connection pool.
// Nobody installs PostgreSQL: the binaries come from the `embedded-postgres` npm package.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import config from '../config.js';

// --- Type parsing --------------------------------------------------------
// DATE (1082): keep 'YYYY-MM-DD' as a string. Converting to a JS Date shifts it by the timezone.
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC (1700): amounts and weights come back as numbers, not strings.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// BIGINT (20): ids and COUNT(*) stay far below 2^53, so a number is safe.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

const { db } = config;
const connexion = { host: '127.0.0.1', port: db.port, user: db.user, password: db.password };

let embarque = null; // the instance we started ourselves (null if we reused a running one)
let pool = null;

async function serveurDejaDemarre() {
  const client = new pg.Client({ ...connexion, database: 'postgres', connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function creerBaseSiAbsente() {
  if (!/^[a-z_]+$/.test(db.name)) throw new Error(`Nom de base invalide : ${db.name}`);
  const client = new pg.Client({ ...connexion, database: 'postgres' });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db.name]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE ${db.name} ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`[db] Base « ${db.name} » créée`);
    }
  } finally {
    await client.end();
  }
}

export async function demarrerBase() {
  // In dev, `node --watch` restarts the server; PostgreSQL may still be running from the
  // previous run. Reuse it instead of starting a second one on the same folder.
  if (await serveurDejaDemarre()) {
    console.log(`[db] PostgreSQL déjà en marche sur le port ${db.port}, réutilisation`);
  } else {
    fs.mkdirSync(path.dirname(db.dataDir), { recursive: true });
    embarque = new EmbeddedPostgres({
      databaseDir: db.dataDir,
      user: db.user,
      password: db.password,
      port: db.port,
      persistent: true, // never delete the data folder on stop
      initdbFlags: ['--encoding=UTF8', '--no-locale'],
      onLog: (m) => { if (config.debug) console.log('[postgres]', m); },
      onError: (e) => console.error('[postgres]', e),
    });

    if (!fs.existsSync(path.join(db.dataDir, 'PG_VERSION'))) {
      console.log(`[db] Premier lancement : initialisation dans ${db.dataDir}`);
      await embarque.initialise();
    }
    await embarque.start();
    console.log(`[db] PostgreSQL démarré sur 127.0.0.1:${db.port}`);
  }

  await creerBaseSiAbsente();

  pool = new pg.Pool({ ...connexion, database: db.name, max: 5 });
  pool.on('error', (e) => console.error('[db] Erreur de connexion inactive :', e.message));
}

export async function arreterBase() {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
  if (embarque) {
    await embarque.stop().catch((e) => console.error('[db] Arrêt de PostgreSQL :', e.message));
    embarque = null;
    console.log('[db] PostgreSQL arrêté');
  }
}

/** Single query outside a transaction (reads, simple statements). */
export function query(texte, params) {
  if (!pool) throw new Error('La base de données n’est pas démarrée');
  return pool.query(texte, params);
}

/**
 * Runs `fn(client)` inside one transaction. Use it for EVERY write, so the change and its
 * history row are saved together or not at all.
 *
 *   await transaction(async (client) => {
 *     const { rows } = await client.query('INSERT … RETURNING *', [...]);
 *     await journaliser(client, { … });
 *     return rows[0];
 *   });
 */
export async function transaction(fn) {
  if (!pool) throw new Error('La base de données n’est pas démarrée');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await fn(client);
    await client.query('COMMIT');
    return resultat;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
