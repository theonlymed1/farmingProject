// Flock health table (males / females / total), shared by the Bande page and the
// "Mortalité et malades" page — on screen and on paper.
import { formaterNombre } from './format.js';

const pct = (n) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

function ligne(libelle, g, balise = 'td') {
  return `<tr>
    <th scope="row">${libelle}</th>
    <${balise} class="nombre">${formaterNombre(g.recus)}</${balise}>
    <${balise} class="nombre">${formaterNombre(g.sains)}</${balise}>
    <${balise} class="nombre">${formaterNombre(g.malades)}</${balise}>
    <${balise} class="nombre">${formaterNombre(g.morts)}</${balise}>
    <${balise} class="nombre">${formaterNombre(g.vivants)}</${balise}>
    <${balise} class="nombre">${pct(g.tauxMortalite)}</${balise}>
  </tr>`;
}

export function tableauSante(sante) {
  return `
    <table class="tableau tableau-sante">
      <thead>
        <tr>
          <th scope="col"></th>
          <th scope="col" class="nombre">Reçus</th>
          <th scope="col" class="nombre">En bonne santé</th>
          <th scope="col" class="nombre">Malades</th>
          <th scope="col" class="nombre">Morts</th>
          <th scope="col" class="nombre">Vivants</th>
          <th scope="col" class="nombre">Mortalité</th>
        </tr>
      </thead>
      <tbody>
        ${ligne('Mâles', sante.males)}
        ${ligne('Femelles', sante.femelles)}
      </tbody>
      <tfoot>${ligne('Total', sante.total)}</tfoot>
    </table>`;
}
