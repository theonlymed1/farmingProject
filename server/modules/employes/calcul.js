// Pure pay calculation for one worker (no database, so it's easy to test and to copy on screen).
//
//   période      = start date → departure date (or today), both days included
//   jours de repos declared inside the période
//   jours travaillés = période − repos
//   semaines     = full weeks in the période (30 days → 4)
//   avances      = semaines × avance hebdomadaire
//   salaire      = jours travaillés × salaire journalier
//   solde        = salaire − avances   (> 0: to pay the worker · < 0: the worker owes)
//
// Example from the farmer: 30 days, 100 DH/day, 200 DH/week → 3 000 − 800 = 2 200 DH.

const UN_JOUR = 864e5;
const jours = (debut, fin) => Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / UN_JOUR);
const arrondi = (n) => Math.round(n * 100) / 100;

export function calculerCompte({ dateDebut, dateDepart, avanceHebdo, salaireJournalier }, joursRepos, aujourdhui) {
  const fin = dateDepart ?? aujourdhui;
  const joursPeriode = Math.max(0, jours(dateDebut, fin) + 1);
  const repos = joursRepos.filter((j) => j >= dateDebut && j <= fin).length;
  const joursTravailles = joursPeriode - repos;
  const semaines = Math.floor(joursPeriode / 7);
  const totalAvances = arrondi(semaines * avanceHebdo);
  const salaireTotal = arrondi(joursTravailles * salaireJournalier);
  const solde = arrondi(salaireTotal - totalAvances);
  return {
    jusquAu: fin,
    joursPeriode,
    joursRepos: repos,
    joursTravailles,
    semaines,
    totalAvances,
    salaireTotal,
    solde,
    // What the farm has paid, or will pay: advances, plus the balance once the worker has left.
    cout: dateDepart ? arrondi(totalAvances + Math.max(0, solde)) : totalAvances,
  };
}
