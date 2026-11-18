// Applies the SQL files in server/db/migrations/ once each, in name order, at every start.
//
// Rules:
//  - File names: 3 digits + underscore + description (001_init.sql, 002_bandes.sql, …).
//  - NEVER edit a file that has already been applied: add a new one instead.
//    The farmer's database only ever moves forward.
//
// The restore of a backup (modules/sauvegarde) also uses these functions, inside its own transaction.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, transaction } from './postgres.js';

const dossier = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export const SQL_TABLE_MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    nom          TEXT PRIMARY KEY,
    appliquee_le TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

/** Every migration file of this version, in order: ['001_init.sql', …]. */
export function listeMigrations() {
  return fs.readdirSync(dossier).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
}

/** Applies these files with this client (no transaction of its own) and records them. */
export async function appliquerFichiers(client, fichiers) {
  for (const fichier of fichiers) {
    await client.query(fs.readFileSync(path.join(dossier, fichier), 'utf8'));
    await client.query('INSERT INTO schema_migrations (nom) VALUES ($1)', [fichier]);
  }
}

export async function appliquerMigrations() {
  await query(SQL_TABLE_MIGRATIONS);
  const deja = new Set((await query('SELECT nom FROM schema_migrations')).rows.map((r) => r.nom));
  for (const fichier of listeMigrations()) {
    if (deja.has(fichier)) continue;
    await transaction((client) => appliquerFichiers(client, [fichier]));
    console.log(`[migrations] appliquée : ${fichier}`);
  }
}
