// French formatting helpers. The API sends ISO dates ('2026-11-14') and plain numbers;
// the screen shows 14/11/2026 and 1 234,50 DH.

const nombreFr = new Intl.NumberFormat('fr-FR');
const montantFr = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateHeureFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** '2026-11-14' → '14/11/2026' (no Date object: avoids timezone shifts). */
export function formaterDate(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/** '14/11/2026' → '2026-11-14' (for forms using text inputs). Returns null if invalid. */
export function lireDate(texte) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texte).trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** ISO timestamp → '14/11/2026 13:20' in the PC's local time. */
export function formaterDateHeure(iso) {
  return iso ? dateHeureFr.format(new Date(iso)) : '';
}

/** 1234.5 → '1 234,50 DH' */
export function formaterMontant(valeur) {
  return valeur === null || valeur === undefined ? '' : `${montantFr.format(valeur)} DH`;
}

/** 12500 → '12 500' */
export function formaterNombre(valeur) {
  return valeur === null || valeur === undefined ? '' : nombreFr.format(valeur);
}

/** Today's date as 'YYYY-MM-DD' in local time (default value for date inputs). */
export function aujourdhui() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
