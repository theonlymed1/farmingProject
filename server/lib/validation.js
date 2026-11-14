// Small validation helpers shared by every module. Each returns [value, errorMessage].
// Collect the messages in an object { champ: message } and throw erreurs.validation(…, champs).

export function texte(valeur, { nom, min = 1, max = 255 }) {
  const v = typeof valeur === 'string' ? valeur.trim().replace(/\s+/g, ' ') : '';
  if (v.length < min) return [v, `${nom} est obligatoire.`];
  if (v.length > max) return [v, `${nom} : ${max} caractères maximum.`];
  return [v, null];
}

export function entier(valeur, { nom, min, max }) {
  const n = typeof valeur === 'string' && valeur.trim() !== '' ? Number(valeur) : valeur;
  if (typeof n !== 'number' || !Number.isInteger(n)) return [null, `${nom} doit être un nombre entier.`];
  if (n < min || n > max) return [n, `${nom} doit être entre ${min} et ${max}.`];
  return [n, null];
}

/** Date 'YYYY-MM-DD' that really exists (no 31/02), between 2000 and 2100. */
export function date(valeur, { nom }) {
  const m = typeof valeur === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur) : null;
  if (!m) return [null, `${nom} est obligatoire (format jj/mm/aaaa).`];
  const [a, mo, j] = m.slice(1).map(Number);
  const d = new Date(Date.UTC(a, mo - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) {
    return [null, `${nom} n’est pas une date valide.`];
  }
  if (a < 2000 || a > 2100) return [null, `${nom} doit être entre 2000 et 2100.`];
  return [valeur, null];
}

/** Route parameter :id → positive integer, or null. */
export function idParam(valeur) {
  return /^\d{1,15}$/.test(String(valeur)) && Number(valeur) > 0 ? Number(valeur) : null;
}

/** '2026-11-14' → '14/11/2026', for French sentences written to the history. */
export function dateFr(iso) {
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

export const nombreFr = (n) => new Intl.NumberFormat('fr-FR').format(n).replace(/ /g, ' ');

/**
 * Decimal number typed as "12 500,50", "12500.5" or sent as 12500.5. Returns [value, error].
 * Empty → [null, error if obligatoire else null].
 */
export function nombre(valeur, {
  nom, min = 0, max = 9999999999, decimales = 2, obligatoire = false,
}) {
  if (valeur === null || valeur === undefined || valeur === '') {
    return [null, obligatoire ? `${nom} est obligatoire.` : null];
  }
  const n = typeof valeur === 'string'
    ? Number(valeur.replace(/[\s  ]/g, '').replace(/dh$/i, '').replace(',', '.'))
    : valeur;
  if (typeof n !== 'number' || !Number.isFinite(n)) return [null, `${nom} doit être un nombre.`];
  if (n < min) return [null, min === 0 ? `${nom} ne peut pas être négatif.` : `${nom} doit être au moins ${min}.`];
  if (n > max) return [null, `${nom} est trop grand.`];
  return [Math.round(n * 10 ** decimales) / 10 ** decimales, null];
}

/** 12500.5 → '12 500,50 DH', for French history sentences. */
export const montantFr = (n) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  .replace(/[  ]/g, ' ')} DH`;
