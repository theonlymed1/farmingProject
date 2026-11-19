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

/** Tiles: chicks bought, charges, total cost of the Bande, prices still to enter, cost per chick. */
export function tuilesCharges(resume) {
  const poussinsInconnus = resume.prixPoussins == null;
  return `
    <section class="indicateurs indicateurs-cinq">
      <div class="indicateur ${poussinsInconnus ? 'indicateur-alerte' : ''}">
        <span class="indicateur-libelle">Achat des poussins</span>
        <span class="indicateur-valeur">${poussinsInconnus ? 'à saisir' : formaterMontant(resume.prixPoussins)}</span>
        <span class="indicateur-detail explication">${poussinsInconnus ? 'à ajouter avec « Modifier » sur la bande' : 'prix total payé'}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Total des charges</span>
        <span class="indicateur-valeur">${formaterMontant(resume.total)}</span>
        <span class="indicateur-detail">${formaterNombre(resume.nombre)} charge${resume.nombre > 1 ? 's' : ''}${resume.sansPrix ? ', hors prix à saisir' : ''}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Employés</span>
        <span class="indicateur-valeur">${formaterMontant(resume.employes?.cout ?? 0)}</span>
        <span class="indicateur-detail explication">avances + soldes des départs</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Véhicules</span>
        <span class="indicateur-valeur">${formaterMontant(resume.vehicules?.total ?? 0)}</span>
        <span class="indicateur-detail explication">charges des véhicules</span>
      </div>
      <div class="indicateur indicateur-fort">
        <span class="indicateur-libelle">Coût total de la bande</span>
        <span class="indicateur-valeur">${formaterMontant(resume.coutTotal)}</span>
        <span class="indicateur-detail explication">poussins + charges + employés + véhicules</span>
      </div>
      <div class="indicateur ${resume.sansPrix ? 'indicateur-alerte' : ''}">
        <span class="indicateur-libelle">Prix à saisir</span>
        <span class="indicateur-valeur">${formaterNombre(resume.sansPrix)}</span>
        <span class="indicateur-detail explication">${resume.sansPrix ? 'charges pas encore chiffrées' : 'tout est chiffré'}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Coût par poussin</span>
        <span class="indicateur-valeur">${formaterMontant(resume.coutParPoussin)}</span>
        <span class="indicateur-detail explication">coût total ÷ poussins reçus</span>
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

/** Paper version of the tiles (Bande fiche): the same figures as a short list. */
export function listeCouts(resume) {
  return `
    <dl class="liste-cles">
      <dt>Achat des poussins</dt><dd>${resume.prixPoussins == null ? 'à saisir' : formaterMontant(resume.prixPoussins)}</dd>
      <dt>Charges</dt><dd>${formaterMontant(resume.total)} <span class="texte-discret">(${formaterNombre(resume.nombre)} charge${resume.nombre > 1 ? 's' : ''}${resume.sansPrix ? `, ${formaterNombre(resume.sansPrix)} prix à saisir` : ''})</span></dd>
      <dt>Employés</dt><dd>${formaterMontant(resume.employes?.cout ?? 0)}</dd>
      <dt>Véhicules</dt><dd>${formaterMontant(resume.vehicules?.total ?? 0)}</dd>
      <dt>Coût total de la bande</dt><dd><strong>${formaterMontant(resume.coutTotal)}</strong></dd>
      <dt>Coût par poussin</dt><dd>${formaterMontant(resume.coutParPoussin)}</dd>
    </dl>`;
}
