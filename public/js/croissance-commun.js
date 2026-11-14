// Weights for Croissance et pesées. The API always uses GRAMS; the farmer types and reads g or kg.
import { formaterDate } from './format.js';
import { echapper } from './ui.js';

export const MAX_GRAMMES = 99999.9;

// Without a unit, a number below this is read as kilograms, otherwise as grams:
// "2,5" → 2,5 kg, "900" → 900 g. A chicken never weighs 20 kg, nor 5 g.
export const SEUIL_KG_SANS_UNITE = 20;

/**
 * Text typed by the farmer → grams. Accepts "900g", "900 g", "1kg", "1,25 kg", "1.25", "900",
 * "1 250 g", "1,2 kilo". Returns null for an empty cell, NaN for something that isn't a weight.
 */
export function lirePoids(texte) {
  const t = String(texte ?? '').trim().toLowerCase().replace(/[\s\u202f\u00a0]/g, '').replace(',', '.');
  if (t === '') return null;
  const m = /^(\d+(?:\.\d+)?)(kg|kgs|kilo|kilos|kilogrammes?|g|gr|grs|grammes?)?$/.exec(t);
  if (!m) return NaN;
  const n = Number(m[1]);
  const enKg = m[2] ? m[2].startsWith('k') : n < SEUIL_KG_SANS_UNITE;
  const g = Math.round(n * (enKg ? 1000 : 1) * 10) / 10;
  return g > 0 && g <= MAX_GRAMMES ? g : NaN;
}

/** Grams → text with the unit that reads best: 900 → "900 g", 1250 → "1,25 kg". */
export function ecrirePoids(grammes) {
  if (grammes == null) return '';
  return Math.abs(grammes) >= 1000
    ? `${(grammes / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 4 })} kg`
    : `${grammes.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} g`;
}

export const avecUnite = (grammes) => (grammes == null ? '—' : ecrirePoids(grammes));

/** Same rule as the server: observed − guide, in grams and in %. */
export function calculerEcart(guide, observe) {
  if (guide == null || observe == null || Number.isNaN(guide) || Number.isNaN(observe)) return null;
  const valeur = Math.round((observe - guide) * 10) / 10;
  return { valeur, pourcent: Math.round(((observe - guide) / guide) * 1000) / 10, positif: valeur >= 0 };
}

/** "+15,5 g (+8,6 %)" */
export function texteEcart(e) {
  if (!e) return '';
  const signe = e.valeur > 0 ? '+' : e.valeur < 0 ? '−' : '';
  const pct = Math.abs(e.pourcent).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return `${signe}${ecrirePoids(Math.abs(e.valeur))} (${signe}${pct} %)`;
}

export const classeEcart = (e) => (!e ? '' : e.positif ? 'ecart-positif' : 'ecart-negatif');

export function libellePeriode(p) {
  if (p === 7) return 'chaque semaine';
  if (p === 1) return 'chaque jour';
  return `tous les ${p} jours`;
}

/** Summary of the latest check with an observed weight (Bande page and printouts). */
export function resumeDernierControle(etat) {
  if (!etat.config) return '<p class="texte-discret">Le guide de croissance n’est pas encore configuré pour cette bande.</p>';
  const p = etat.points.filter((x) => x.observeMales != null || x.observeFemelles != null).at(-1);
  if (!p) return `<p class="texte-discret">Aucun poids observé pour le moment (contrôle ${libellePeriode(etat.config.periodeJours)}).</p>`;
  const ligne = (sexe, guide, observe, e) => `
    <tr>
      <th scope="row">${sexe}</th>
      <td class="nombre">${avecUnite(observe)}</td>
      <td class="nombre">${avecUnite(guide)}</td>
      <td class="nombre ${classeEcart(e)}">${e ? echapper(texteEcart(e)) : '—'}</td>
    </tr>`;
  return `
    <p>Dernier contrôle : <strong>${echapper(p.libelle)}</strong> — J+${p.jourApresArrivee}, ${formaterDate(p.date)}</p>
    <table class="tableau tableau-compact">
      <thead><tr><th scope="col"></th><th scope="col" class="nombre">Observé</th><th scope="col" class="nombre">Guide</th><th scope="col" class="nombre">Écart</th></tr></thead>
      <tbody>
        ${ligne('Mâles', p.guideMales, p.observeMales, p.ecartMales)}
        ${ligne('Femelles', p.guideFemelles, p.observeFemelles, p.ecartFemelles)}
      </tbody>
    </table>`;
}
