// Pure calculations for Croissance et pesées (no database here, so they're easy to test).
// Check number `rang` happens `rang × periode` days after the arrival date.

const UN_JOUR = 864e5;

export function ajouterJours(iso, jours) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + jours * UN_JOUR).toISOString().slice(0, 10);
}

export function joursEntre(debut, fin) {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / UN_JOUR);
}

/** How many checks fit in the Bande's duration (at least 1). */
export function nombreControles(dateDebut, dateFin, periode) {
  return Math.max(1, Math.floor(joursEntre(dateDebut, dateFin) / periode));
}

export function libelleControle(rang, periode) {
  if (periode === 7) return `Semaine ${rang}`;
  if (periode === 1) return `Jour ${rang}`;
  return `Contrôle ${rang}`;
}

const arrondi = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

/** Observed − guide, in grams and in % of the guide. null if one value is missing. */
export function ecart(guide, observe) {
  if (guide == null || observe == null) return null;
  const valeur = arrondi(observe - guide, 1);
  return { valeur, pourcent: arrondi(((observe - guide) / guide) * 100, 1), positif: valeur >= 0 };
}

/**
 * Full list of checks for the screen: one per period over the Bande's duration, plus any later
 * check that already has values (e.g. after the duration was shortened — nothing is hidden).
 */
export function construirePoints({ dateDebut, dateFin }, periode, lignes, aujourdhui) {
  const parRang = new Map(lignes.map((l) => [l.rang, l]));
  const dernierRang = Math.max(nombreControles(dateDebut, dateFin, periode), ...lignes.map((l) => l.rang));
  const points = [];
  for (let rang = 1; rang <= dernierRang; rang += 1) {
    const l = parRang.get(rang) ?? {};
    const date = ajouterJours(dateDebut, rang * periode);
    const g = (v) => (v == null ? null : Number(v));
    const p = {
      rang,
      libelle: libelleControle(rang, periode),
      jourApresArrivee: rang * periode,
      date,
      guideMales: g(l.guide_males_g),
      guideFemelles: g(l.guide_femelles_g),
      observeMales: g(l.observe_males_g),
      observeFemelles: g(l.observe_femelles_g),
    };
    p.ecartMales = ecart(p.guideMales, p.observeMales);
    p.ecartFemelles = ecart(p.guideFemelles, p.observeFemelles);
    p.passe = date <= aujourdhui;
    points.push(p);
  }
  // The check "in progress": the last one whose date has arrived.
  const actuel = points.filter((p) => p.passe).at(-1);
  if (actuel) actuel.actuel = true;
  return points;
}

/** Most recent check that has at least one observed weight (for the Bande summary). */
export function dernierControleObserve(points) {
  return points.filter((p) => p.observeMales != null || p.observeFemelles != null).at(-1) ?? null;
}

/** '1 250 g' or '1,25 kg' — for French history sentences. */
export function formaterPoids(grammes, unite) {
  if (grammes == null) return 'vide';
  return unite === 'kg'
    ? `${(grammes / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} kg`
    : `${grammes.toLocaleString('fr-FR', { maximumFractionDigits: 1 }).replace(/ /g, ' ')} g`;
}
