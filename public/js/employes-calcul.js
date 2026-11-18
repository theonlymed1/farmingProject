// COPY of server/modules/employes/calcul.js — same rules on screen (live preview). Keep both identical.
//
//   période      = start date → departure date (or today), both days included
//   jours de repos declared inside the période
//   jours travaillés = période − repos
//   avances      = sum of the advances declared by the admin up to the end of the période
//                  (any amount, any day, several in a week if needed)
//   salaire      = jours travaillés × salaire journalier
//   solde        = salaire − avances   (> 0: to pay the worker · < 0: the worker owes)
//
// Example from the farmer: 30 days at 100 DH, 4 advances of 200 DH → 3 000 − 800 = 2 200 DH.

const UN_JOUR = 864e5;
const jours = (debut, fin) => Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / UN_JOUR);
const arrondi = (n) => Math.round(n * 100) / 100;

/**
 * @param joursRepos  ['2026-11-02', …]
 * @param avances     [{ date: '2026-11-07', montant: 200 }, …]
 */
export function calculerCompte({ dateDebut, dateDepart, salaireJournalier }, joursRepos, avances, aujourdhui) {
  const fin = dateDepart ?? aujourdhui;
  const joursPeriode = Math.max(0, jours(dateDebut, fin) + 1);
  const repos = joursRepos.filter((j) => j >= dateDebut && j <= fin).length;
  const joursTravailles = joursPeriode - repos;
  const comptees = avances.filter((a) => a.date <= fin);
  const totalAvances = arrondi(comptees.reduce((t, a) => t + a.montant, 0));
  const salaireTotal = arrondi(joursTravailles * salaireJournalier);
  const solde = arrondi(salaireTotal - totalAvances);
  return {
    jusquAu: fin,
    joursPeriode,
    joursRepos: repos,
    joursTravailles,
    nombreAvances: comptees.length,
    totalAvances,
    salaireTotal,
    solde,
    // What the farm has paid, or will pay: advances, plus the balance once the worker has left.
    cout: dateDepart ? arrondi(totalAvances + Math.max(0, solde)) : totalAvances,
  };
}
