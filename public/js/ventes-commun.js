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
        <span class="indicateur-detail">total ÷ oiseaux vendus</span>
      </div>
      <div class="indicateur">
        <span class="indicateur-libelle">Coût total de la bande</span>
        <span class="indicateur-valeur">${formaterMontant(r.coutTotal)}</span>
        <span class="indicateur-detail">poussins + charges + employés</span>
      </div>
      <div class="indicateur ${positif ? 'indicateur-benefice' : 'indicateur-perte'}">
        <span class="indicateur-libelle">Résultat</span>
        <span class="indicateur-valeur">${positif ? '' : '− '}${formaterMontant(Math.abs(r.resultat))}</span>
        <span class="indicateur-detail">${positif ? 'bénéfice' : 'perte'} : ventes − coût total</span>
      </div>
    </section>`;
}
