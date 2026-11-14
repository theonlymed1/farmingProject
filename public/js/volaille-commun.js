// Flock table (males / females / non-sexed / total), shared by the Bande page and the
// "Mortalité et malades" page — on screen and on paper.
import { formaterNombre } from './format.js';

const pct = (n) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

function ligne(libelle, g) {
  return `<tr>
    <th scope="row">${libelle}</th>
    <td class="nombre">${formaterNombre(g.sains)}</td>
    <td class="nombre">${formaterNombre(g.malades)}</td>
    <td class="nombre">${formaterNombre(g.vivants)}</td>
    <td class="nombre">${formaterNombre(g.morts)}</td>
  </tr>`;
}

export function tableauSante(sante) {
  return `
    <p class="resume-troupeau">
      Poussins reçus : <strong>${formaterNombre(sante.total.recus)}</strong> ·
      Vivants : <strong>${formaterNombre(sante.total.vivants)}</strong> ·
      Mortalité : <strong>${pct(sante.total.tauxMortalite)}</strong>
    </p>
    <table class="tableau tableau-sante">
      <thead>
        <tr>
          <th scope="col"></th>
          <th scope="col" class="nombre">En bonne santé</th>
          <th scope="col" class="nombre">Malades</th>
          <th scope="col" class="nombre">Vivants</th>
          <th scope="col" class="nombre">Morts</th>
        </tr>
      </thead>
      <tbody>
        ${ligne('Mâles', sante.males)}
        ${ligne('Femelles', sante.femelles)}
        ${ligne('Non sexés', sante.nonSexes)}
      </tbody>
      <tfoot>${ligne('Total', sante.total)}</tfoot>
    </table>`;
}
