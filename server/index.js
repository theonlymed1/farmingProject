// Entry point: start PostgreSQL → apply migrations → start Express.
// In production the Windows service runs exactly this file.
import config from './config.js';
import { demarrerBase, arreterBase } from './db/postgres.js';
import { appliquerMigrations } from './db/migrations.js';
import { creerApp } from './app.js';

let serveur = null;
let arretEnCours = false;

async function arreter(raison) {
  if (arretEnCours) return;
  arretEnCours = true;
  console.log(`Arrêt (${raison})…`);
  if (serveur) await new Promise((ok) => serveur.close(() => ok()));
  await arreterBase();
  process.exit(0);
}

async function main() {
  console.log(`Plateforme avicole v${config.version} — démarrage (${config.prod ? 'production' : 'développement'})`);
  await demarrerBase();
  await appliquerMigrations();

  const app = creerApp();
  serveur = app.listen(config.port, config.host, () => {
    console.log(`Prêt : http://localhost:${config.port}`);
  });
  serveur.on('error', async (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Le port ${config.port} est déjà utilisé : l’application tourne peut-être déjà.`);
    } else {
      console.error('Erreur du serveur web :', e);
    }
    await arreterBase();
    process.exit(1);
  });

  process.on('SIGINT', () => arreter('SIGINT'));
  process.on('SIGTERM', () => arreter('SIGTERM'));
}

main().catch(async (e) => {
  console.error('Échec du démarrage :', e);
  await arreterBase().catch(() => {});
  process.exit(1);
});
