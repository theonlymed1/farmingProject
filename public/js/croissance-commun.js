// Weights for Croissance et pesées. The API always uses GRAMS; the screen uses the Bande's unit.
import { formaterDate } from './format.js';
import { echapper } from './ui.js';

export const MAX_GRAMMES = 99999.9;

/**
 * Text typed by the farmer → grams. Accepts "1,25", "1.25", "1 250".
 * Returns null for an empty cell, NaN for something that isn't a valid weight.
 */
export function lirePoids(texte, unite) {
  const t = String(texte ?? '').trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const g = Math.round(Number(t) * (unite === 'kg' ? 1000 : 1) * 10) / 10;
  return g > 0 && g <= MAX_GRAMMES ? g : NaN;
}

/** Grams → text in the unit, for an input or a cell: 1250 → "1,25" (kg) or "1 250" (g). */
export function ecrirePoids(grammes, unite) {
  if (grammes == null) return '';
  return unite === 'kg'
    ? (grammes / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 4, useGrouping: false })
    : grammes.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export const avecUnite = (grammes, unite) => (grammes == null ? '—' : `${ecrirePoids(grammes, unite)} ${unite}`);

/** Same rule as the server: observed − guide, in grams and in %. */
export function calculerEcart(guide, observe) {
  if (guide == null || observe == null || Number.isNaN(guide) || Number.isNaN(observe)) return null;
  const valeur = Math.round((observe - guide) * 10) / 10;
  return { valeur, pourcent: Math.round(((observe - guide) / guide) * 1000) / 10, positif: valeur >= 0 };
}

/** "+15,5 g (+8,6 %)" */
export function texteEcart(e, unite) {
  if (!e) return '';
  const signe = e.valeur > 0 ? '+' : e.valeur < 0 ? '−' : '';
  const pct = Math.abs(e.pourcent).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return `${signe}${ecrirePoids(Math.abs(e.valeur), unite)} ${unite} (${signe}${pct} %)`;
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
  const u = etat.config.unite;
  const ligne = (sexe, guide, observe, e) => `
    <tr>
      <th scope="row">${sexe}</th>
      <td class="nombre">${avecUnite(observe, u)}</td>
      <td class="nombre">${avecUnite(guide, u)}</td>
      <td class="nombre ${classeEcart(e)}">${e ? echapper(texteEcart(e, u)) : '—'}</td>
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
