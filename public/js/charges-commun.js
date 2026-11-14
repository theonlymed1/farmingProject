// Charges: number reading / formatting and the summary block, shared by the Charges page
// and the Bande page.
import { formaterMontant, formaterNombre } from './format.js';
import { echapper } from './ui.js';

/** "7 500,50" / "7500.5" / "7 500" → 7500.5 ; '' → null ; nonsense → NaN */
export function lireNombre(texte) {
  const t = String(texte ?? '').trim().replace(/[\s  ]/g, '').replace(/dh$/i, '').replace(',', '.');
  if (t === '') return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Number → text for an input: 7500.5 → "7500,5" */
export const ecrireNombre = (n) => (n == null ? '' : String(n).replace('.', ','));

export const quantite = (c) => (c.quantite == null ? '—' : `${formaterNombre(c.quantite)}${c.unite ? ` ${echapper(c.unite)}` : ''}`);

/** Tiles: total, number of charges, charges without price, cost per chick. */
export function tuilesCharges(resume) {
  return `
    <section class="indicateurs">
      <div class="indicateur">
        <span class="indicateur-libelle">Total des charges</span>
        <span class="indicateur-valeur">${formaterMontant(resume.total)}</span>
        <span class="indicateur-detail">${resume.sansPrix ? 'hors charges sans prix' : 'toutes les charges'}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Nombre de charges</span>
        <span class="indicateur-valeur">${formaterNombre(resume.nombre)}</span>
        <span class="indicateur-detail">${resume.parType.length} type${resume.parType.length > 1 ? 's' : ''} de produit</span>
      </div>
      <div class="indicateur ${resume.sansPrix ? 'indicateur-alerte' : ''}">
        <span class="indicateur-libelle">Prix à saisir</span>
        <span class="indicateur-valeur">${formaterNombre(resume.sansPrix)}</span>
        <span class="indicateur-detail">${resume.sansPrix ? 'charges pas encore chiffrées' : 'tout est chiffré'}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Coût par poussin</span>
        <span class="indicateur-valeur">${formaterMontant(resume.coutParPoussin)}</span>
        <span class="indicateur-detail">total ÷ poussins reçus</span>
      </div>
    </section>`;
}

export function tableauParType(resume) {
  if (!resume.parType.length) return '<p class="texte-discret">Aucune charge pour cette bande.</p>';
  return `
    <table class="tableau tableau-compact">
      <thead><tr><th scope="col">Type de produit</th><th scope="col" class="nombre">Charges</th><th scope="col" class="nombre">Total</th></tr></thead>
      <tbody>
        ${resume.parType.map((t) => `
          <tr>
            <th scope="row">${echapper(t.type)}</th>
            <td class="nombre">${formaterNombre(t.nombre)}${t.sansPrix ? ` <span class="badge badge-sans-prix">${t.sansPrix} sans prix</span>` : ''}</td>
            <td class="nombre">${formaterMontant(t.total)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot><tr><th scope="row">Total</th><td class="nombre">${formaterNombre(resume.nombre)}</td><td class="nombre">${formaterMontant(resume.total)}</td></tr></tfoot>
    </table>`;
}
