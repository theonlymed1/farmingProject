// Applies the SQL files in server/db/migrations/ once each, in name order, at every start.
//
// Rules:
//  - File names: 3 digits + underscore + description (001_init.sql, 002_bandes.sql, …).
//  - NEVER edit a file that has already been applied: add a new one instead.
//    The farmer's database only ever moves forward.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, transaction } from './postgres.js';

const dossier = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function appliquerMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nom          TEXT PRIMARY KEY,
      appliquee_le TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const deja = new Set((await query('SELECT nom FROM schema_migrations')).rows.map((r) => r.nom));
  const fichiers = fs.readdirSync(dossier).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();

  for (const fichier of fichiers) {
    if (deja.has(fichier)) continue;
    const sql = fs.readFileSync(path.join(dossier, fichier), 'utf8');
    await transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (nom) VALUES ($1)', [fichier]);
    });
    console.log(`[migrations] appliquée : ${fichier}`);
  }
}
