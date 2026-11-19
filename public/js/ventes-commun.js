// Ventes: summary tiles and number formats, shared by the Ventes page and the Bande page.
import { formaterMontant, formaterNombre } from './format.js';

/** 31.263 → '31,263 kg' ; 0.8 → '0,8 kg' */
export const formaterKg = (kg) => `${kg.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} kg`;

export const TYPES_CLIENT = { particulier: 'Particulier', societe: 'Société' };

/** Tiles: sales total, birds sold, weight sold, average prices, result (sales − total cost). */
export function tuilesVentes(r) {
  const positif = r.resultat >= 0;
  return `
    <section class="indicateurs indicateurs-cinq indicateurs-six">
      <div class="indicateur indicateur-fort">
        <span class="indicateur-libelle">Total des ventes</span>
        <span class="indicateur-valeur">${formaterMontant(r.total)}</span>
        <span class="indicateur-detail">${formaterNombre(r.nombre)} vente${r.nombre > 1 ? 's' : ''}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Oiseaux vendus</span>
        <span class="indicateur-valeur">${formaterNombre(r.oiseaux)}</span>
        <span class="indicateur-detail">${r.oiseaux ? `${formaterKg(r.poidsMoyenKg)} en moyenne` : 'aucun pour le moment'}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Poids vendu</span>
        <span class="indicateur-valeur">${formaterKg(r.poidsKg)}</span>
        <span class="indicateur-detail">${r.poidsKg ? `${formaterMontant(r.prixMoyenKg)} le kg en moyenne` : '—'}</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Prix moyen par oiseau</span>
        <span class="indicateur-valeur">${formaterMontant(r.prixMoyenOiseau)}</span>
        <span class="indicateur-detail explication">total ÷ oiseaux vendus</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Coût total de la bande</span>
        <span class="indicateur-valeur">${formaterMontant(r.coutTotal)}</span>
        <span class="indicateur-detail explication">poussins + charges + employés + véhicules</span>
      </div>
      <div class="indicateur ${positif ? 'indicateur-benefice' : 'indicateur-perte'}">
        <span class="indicateur-libelle">Résultat</span>
        <span class="indicateur-valeur">${positif ? '' : '− '}${formaterMontant(Math.abs(r.resultat))}</span>
        <span class="indicateur-detail">${positif ? 'bénéfice' : 'perte'}<span class="explication"> : ventes − coût total</span></span>
      </div>
    </section>`;
}

/** Paper version of the tiles (Bande fiche). The total cost is already in the Charges part. */
export function listeVentes(r) {
  return `
    <dl class="liste-cles">
      <dt>Total des ventes</dt><dd><strong>${formaterMontant(r.total)}</strong> <span class="texte-discret">(${formaterNombre(r.nombre)} vente${r.nombre > 1 ? 's' : ''})</span></dd>
      <dt>Oiseaux vendus</dt><dd>${formaterNombre(r.oiseaux)}${r.oiseaux ? ` <span class="texte-discret">(${formaterKg(r.poidsMoyenKg)} en moyenne)</span>` : ''}</dd>
      <dt>Poids vendu</dt><dd>${formaterKg(r.poidsKg)}${r.poidsKg ? ` <span class="texte-discret">(${formaterMontant(r.prixMoyenKg)} le kg)</span>` : ''}</dd>
      <dt>Prix moyen par oiseau</dt><dd>${formaterMontant(r.prixMoyenOiseau)}</dd>
      <dt>Résultat</dt><dd><strong>${r.resultat < 0 ? '− ' : ''}${formaterMontant(Math.abs(r.resultat))}</strong> <span class="texte-discret">(${r.resultat >= 0 ? 'bénéfice' : 'perte'})</span></dd>
    </dl>`;
}
