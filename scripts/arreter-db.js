// npm run db:stop — stops a PostgreSQL left running in dev (e.g. after closing the terminal).
// Uses pg_ctl from the platform binaries package installed by embedded-postgres.
import { execFileSync } from 'node:child_process';
import config from '../server/config.js';

const plateformes = { win32: 'windows', darwin: 'darwin', linux: 'linux' };
const nomPaquet = `@embedded-postgres/${plateformes[process.platform]}-${process.arch}`;

try {
  const { pg_ctl: pgCtl } = await import(nomPaquet);
  execFileSync(pgCtl, ['stop', '-D', config.db.dataDir, '-m', 'fast'], { stdio: 'inherit' });
} catch (e) {
  console.error(`Impossible d’arrêter PostgreSQL (${nomPaquet}) : ${e.message}`);
  console.error('Il n’était peut-être pas démarré.');
  process.exit(1);
}
