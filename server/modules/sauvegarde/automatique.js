// Automatic backups: once a day, without the farmer doing anything.
//
//  - The file goes to <données>\sauvegardes (C:\ProgramData\PlateformeAvicole\sauvegardes on his PC),
//    named sauvegarde-auto-2026-11-18.avicole (one per day, the 30 most recent are kept).
//  - If a copy folder is set (Paramètres → Sauvegarde: second disk, OneDrive / Google Drive folder…),
//    the same file is copied there too, and the 30 most recent copies are kept there as well.
//  - Checked 2 minutes after start, then every hour: a PC that is off at night still gets its backup.
// Same file format as the manual download, so any of these files can be restored in Paramètres.
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../../db/postgres.js';
import { erreurs } from '../../lib/erreurs.js';
import config from '../../config.js';
import { construireSauvegarde } from './service.js';

export const A_GARDER = 30;
const MOTIF = /^sauvegarde-auto-(\d{4})-(\d{2})-(\d{2})\.avicole$/;
const deux = (n) => String(n).padStart(2, '0');
const jourLocal = (d = new Date()) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
export const nomDuJour = (d = new Date()) => `sauvegarde-auto-${jourLocal(d)}.avicole`;

async function lireParametre(cle) {
  const { rows: [r] } = await query('SELECT valeur FROM parametre WHERE cle = $1', [cle]);
  return r?.valeur ?? null;
}
async function ecrireParametre(cle, valeur) {
  await query(
    `INSERT INTO parametre (cle, valeur) VALUES ($1, $2) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
    [cle, valeur],
  );
}

/** Our automatic files in a folder, newest first: [{ nom, jour, taille, modifieLe }]. */
function lister(dossier) {
  let noms;
  try { noms = fs.readdirSync(dossier); } catch { return []; }
  return noms.filter((n) => MOTIF.test(n)).sort().reverse().map((nom) => {
    const st = fs.statSync(path.join(dossier, nom));
    const [, a, m, j] = MOTIF.exec(nom);
    return { nom, jour: `${a}-${m}-${j}`, taille: st.size, modifieLe: st.mtime.toISOString() };
  });
}

/** Keeps the A_GARDER most recent automatic files of a folder (never touches other files). */
function nettoyer(dossier) {
  for (const f of lister(dossier).slice(A_GARDER)) {
    try { fs.unlinkSync(path.join(dossier, f.nom)); } catch { /* next time */ }
  }
}

/** Writes through a temporary name, so a half-written file never looks like a backup. */
function ecrireAtomique(chemin, contenu) {
  const temp = `${chemin}.en-cours`;
  fs.writeFileSync(temp, contenu);
  fs.renameSync(temp, chemin);
}

/** Is this folder usable for the copies? Returns null if yes, else a French explanation. */
export function verifierDossier(dossier) {
  if (!path.isAbsolute(dossier)) return 'Indiquez un chemin complet, par exemple D:\\Sauvegardes ferme.';
  if (path.resolve(dossier).toLowerCase() === path.resolve(config.sauvegardesDir).toLowerCase()) {
    return 'Choisissez un autre dossier que celui des sauvegardes automatiques de ce PC.';
  }
  try {
    fs.mkdirSync(dossier, { recursive: true });
  } catch (e) {
    return `Impossible de créer ce dossier (${e.code ?? e.message}). Vérifiez le chemin et que le disque est branché.`;
  }
  const test = path.join(dossier, `.test-ecriture-${process.pid}`);
  try {
    fs.writeFileSync(test, 'test');
    fs.unlinkSync(test);
  } catch (e) {
    return e.code === 'EPERM' || e.code === 'EACCES'
      ? 'L’application n’a pas le droit d’écrire dans ce dossier. Choisissez ce dossier pendant l’installation '
        + '(l’installateur donne ce droit), ou choisissez un autre dossier.'
      : `Impossible d’écrire dans ce dossier (${e.code ?? e.message}).`;
  }
  return null;
}

/** Copies a backup file to the copy folder; records the result (shown in Paramètres). */
async function copier(fichier, contenu) {
  const dossier = await lireParametre('dossier_copie');
  if (!dossier) return null;
  const resultat = { dossier, le: new Date().toISOString(), fichier: path.basename(fichier) };
  const probleme = verifierDossier(dossier);
  if (probleme) {
    resultat.erreur = probleme;
  } else {
    try {
      ecrireAtomique(path.join(dossier, path.basename(fichier)), contenu ?? fs.readFileSync(fichier));
      nettoyer(dossier);
      resultat.ok = true;
    } catch (e) {
      resultat.erreur = `Copie impossible : ${e.code ?? e.message}`;
    }
  }
  await ecrireParametre('derniere_copie', JSON.stringify(resultat));
  if (resultat.erreur) console.error('[sauvegarde] copie :', resultat.erreur);
  return resultat;
}

let enCours = null;

/**
 * Makes today's automatic backup (or a new one now with `forcer`), then the copy.
 * Returns { fichier, taille, copie } or null if today's backup already exists.
 */
export function sauvegarderMaintenant({ forcer = false } = {}) {
  // Never two at the same time (the hourly check and a click on "Sauvegarder maintenant"):
  // a second call while one runs gets the same result. The lock is released when it settles.
  if (enCours) return enCours;
  enCours = (async () => {
    {
      fs.mkdirSync(config.sauvegardesDir, { recursive: true });
      const fichier = path.join(config.sauvegardesDir, nomDuJour());
      if (!forcer && fs.existsSync(fichier)) return null;
      const { contenu, entete } = await construireSauvegarde();
      ecrireAtomique(fichier, contenu);
      nettoyer(config.sauvegardesDir);
      await ecrireParametre('derniere_sauvegarde_auto', entete.creeLe);
      const copie = await copier(fichier, contenu);
      console.log(`[sauvegarde] ${path.basename(fichier)} (${Math.round(contenu.length / 1024)} Ko)${copie?.ok ? ', copiée' : ''}`);
      return { fichier: path.basename(fichier), taille: contenu.length, creeLe: entete.creeLe, copie };
    }
  })().finally(() => { enCours = null; });
  return enCours;
}

/**
 * The Windows installer writes the copy folder chosen during installation in
 * <données>\dossier-copie.txt (it also gave the service the right to write there).
 * Applied once at start, then the file is removed. An empty file means "no copy".
 */
export async function appliquerChoixInstallateur() {
  const fichier = path.join(config.dossierDonnees, 'dossier-copie.txt');
  if (!fs.existsSync(fichier)) return;
  const dossier = fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, '').trim();
  try {
    await definirDossierCopie(dossier);
    console.log(`[sauvegarde] dossier de copie choisi à l’installation : ${dossier || 'aucun'}`);
  } catch (e) {
    const erreur = e.details?.dossier ?? e.message;
    console.error('[sauvegarde] dossier choisi à l’installation refusé :', erreur);
    await ecrireParametre('dossier_copie', path.resolve(dossier));
    await ecrireParametre('derniere_copie', JSON.stringify({ dossier, le: new Date().toISOString(), erreur }));
  }
  try { fs.unlinkSync(fichier); } catch { /* read again next start: harmless */ }
}

/** Started once by server/index.js. */
export function planifierSauvegardes() {
  const verifier = () => sauvegarderMaintenant().catch((e) => console.error('[sauvegarde] automatique :', e.message));
  setTimeout(verifier, 2 * 60 * 1000).unref();
  setInterval(verifier, 60 * 60 * 1000).unref();
}

/** For Paramètres. */
export async function etatAutomatique() {
  const copie = await lireParametre('derniere_copie');
  return {
    dossierLocal: config.sauvegardesDir,
    aGarder: A_GARDER,
    fichiers: lister(config.sauvegardesDir),
    derniereAuto: await lireParametre('derniere_sauvegarde_auto'),
    dossierCopie: await lireParametre('dossier_copie'),
    derniereCopie: copie ? JSON.parse(copie) : null,
  };
}

/** Sets (or removes, with '') the copy folder, after checking it, then copies the latest backup there. */
export async function definirDossierCopie(dossier) {
  const valeur = typeof dossier === 'string' ? dossier.trim() : '';
  if (!valeur) {
    await query("DELETE FROM parametre WHERE cle IN ('dossier_copie', 'derniere_copie')");
    return etatAutomatique();
  }
  if (valeur.length > 260) throw erreurs.validation('Vérifiez les champs indiqués.', { dossier: 'Ce chemin est trop long.' });
  const probleme = verifierDossier(valeur);
  if (probleme) throw erreurs.validation('Vérifiez les champs indiqués.', { dossier: probleme });
  await ecrireParametre('dossier_copie', path.resolve(valeur));
  const recente = lister(config.sauvegardesDir)[0];
  if (recente) await copier(path.join(config.sauvegardesDir, recente.nom));
  else await sauvegarderMaintenant({ forcer: true });
  return etatAutomatique();
}

/** Content of one automatic backup of this PC (download / restore). Name strictly checked. */
export function lireFichierAutomatique(nom) {
  if (!MOTIF.test(nom ?? '')) throw erreurs.introuvable('Cette sauvegarde n’existe pas.');
  const chemin = path.join(config.sauvegardesDir, nom);
  if (!fs.existsSync(chemin)) throw erreurs.introuvable('Cette sauvegarde n’existe plus (seules les 30 plus récentes sont gardées).');
  return fs.readFileSync(chemin);
}
