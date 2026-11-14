// Maintenance tool (for the developer, not a feature of the app):
//   npm run mot-de-passe                       → generates a new strong password
//   npm run mot-de-passe -- "MonMotDePasse!26" → sets this password
// Works whether the app is running or not. Logs out every open session.
import { demarrerBase, arreterBase } from '../server/db/postgres.js';
import { appliquerMigrations } from '../server/db/migrations.js';
import { assurerUtilisateurParDefaut, definirMotDePasse } from '../server/modules/auth/service.js';
import { genererMotDePasse } from '../server/lib/motDePasse.js';

const choisi = process.argv[2];
const motDePasse = choisi ?? genererMotDePasse();

try {
  await demarrerBase();
  await appliquerMigrations();
  await assurerUtilisateurParDefaut();
  const identifiant = await definirMotDePasse(motDePasse);
  console.log('');
  console.log('Mot de passe mis à jour.');
  console.log(`  Identifiant  : ${identifiant}`);
  console.log(`  Mot de passe : ${choisi ? '(celui que vous avez saisi)' : motDePasse}`);
  console.log('');
} catch (e) {
  console.error(`Échec : ${e.message}`);
  process.exitCode = 1;
} finally {
  await arreterBase();
}
