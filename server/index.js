// Entry point: start PostgreSQL → apply migrations → start Express.
// In production the Windows service runs exactly this file.
import config from './config.js';
import { demarrerBase, arreterBase } from './db/postgres.js';
import { appliquerMigrations } from './db/migrations.js';
import { creerApp } from './app.js';
import { assurerUtilisateurParDefaut, nettoyerSessions } from './modules/auth/service.js';
import { planifierSauvegardes, appliquerChoixInstallateur } from './modules/sauvegarde/automatique.js';

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
  await assurerUtilisateurParDefaut();
  await nettoyerSessions();
  // Remove expired sessions every hour (unref: doesn't keep the process alive).
  setInterval(() => nettoyerSessions().catch((e) => console.error('[auth]', e.message)), 60 * 60 * 1000).unref();
  // Automatic daily backup (and its copy), checked every hour.
  await appliquerChoixInstallateur().catch((e) => console.error('[sauvegarde]', e.message));
  planifierSauvegardes();

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
