// Read a setting from the `parametre` table (farm name, …).
import { query } from '../db/postgres.js';

export async function lireParametre(cle, parDefaut = null) {
  const { rows } = await query('SELECT valeur FROM parametre WHERE cle = $1', [cle]);
  return rows[0]?.valeur ?? parDefaut;
}
