// Sauvegarde / restauration (Paramètres).
//
// The backup file holds ALL the farm data (every table except the login account and the sessions,
// so no password hash leaves the PC). Format: gzip of
//   line 1 : JSON header { format, version, application, creeLe, nomExploitation, migrations, nombres, empreinte }
//   line 2…: JSON object { "<table>": [ rows ], … }   (empreinte = SHA-256 of this text, to detect a damaged file)
//
// Restore, in ONE transaction (on any error nothing changes):
//   check the password and the file → keep the current account and sessions → drop every table →
//   recreate them with the migrations the backup was made with → insert the rows (parents first) →
//   reset the id counters → apply the newer migrations of this version (an old backup is upgraded) →
//   put back the account and sessions. A backup from a NEWER version of the application is refused.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { query, transaction } from '../../db/postgres.js';
import { SQL_TABLE_MIGRATIONS, listeMigrations, appliquerFichiers } from '../../db/migrations.js';
import { journaliser } from '../../lib/historique.js';
import { erreurs } from '../../lib/erreurs.js';
import { exigerMotDePasse } from '../auth/service.js';
import config from '../../config.js';

const FORMAT = 'plateforme-avicole-sauvegarde';
const VERSION_FORMAT = 1;
const HORS_SAUVEGARDE = ['schema_migrations', 'utilisateur', 'session'];
// Settings of THIS PC (automatic backups, copy folder): a restore keeps the current values.
const PARAMETRES_DU_PC = ['dossier_copie', 'derniere_copie', 'derniere_sauvegarde_auto'];
const id = (nom) => `"${nom.replace(/"/g, '""')}"`;
const sha256 = (texte) => crypto.createHash('sha256').update(texte, 'utf8').digest('hex');
const deux = (n) => String(n).padStart(2, '0');

async function tablesDonnees(client) {
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY tablename`,
    [JSON.stringify(HORS_SAUVEGARDE)],
  );
  return rows.map((r) => r.tablename);
}

async function lireParametre(client, cle) {
  const { rows: [r] } = await client.query('SELECT valeur FROM parametre WHERE cle = $1', [cle]);
  return r?.valeur ?? null;
}

/** State shown in Paramètres: last backup downloaded and last restore. */
export async function etatSauvegarde() {
  const client = { query };
  const derniere = await lireParametre(client, 'derniere_sauvegarde');
  const restauration = await lireParametre(client, 'derniere_restauration');
  return {
    derniereSauvegarde: derniere,
    derniereRestauration: restauration ? JSON.parse(restauration) : null,
  };
}

/** Builds the backup content from one consistent snapshot: { entete, contenu (Buffer), slug }. */
export async function construireSauvegarde() {
  return transaction(async (client) => {
    // Same snapshot for every table, even if something is saved meanwhile.
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const tables = await tablesDonnees(client);
    const morceaux = [];
    const nombres = {};
    for (const t of tables) {
      const { rows: [r] } = await client.query(
        `SELECT count(*)::int AS n, COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)::text AS lignes FROM ${id(t)} x`,
      );
      nombres[t] = r.n;
      morceaux.push(`${JSON.stringify(t)}:${r.lignes}`);
    }
    const donnees = `{${morceaux.join(',')}}`;
    const { rows: migrations } = await client.query('SELECT nom FROM schema_migrations ORDER BY nom');
    const nomExploitation = (await lireParametre(client, 'nom_exploitation')) ?? 'Ferme';
    const maintenant = new Date();
    const entete = {
      format: FORMAT,
      version: VERSION_FORMAT,
      application: config.version,
      creeLe: maintenant.toISOString(),
      nomExploitation,
      migrations: migrations.map((m) => m.nom),
      nombres,
      empreinte: sha256(donnees),
    };
    const contenu = zlib.gzipSync(Buffer.from(`${JSON.stringify(entete)}\n${donnees}`, 'utf8'));
    const slug = nomExploitation.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ferme';
    return { entete, contenu, slug };
  });
}

/** Manual download (Paramètres): { nomFichier, contenu, entete }. Records the date and a history line. */
export async function creerSauvegarde() {
  return construireSauvegarde().then(async ({ entete, contenu, slug }) => {
    const m = new Date(entete.creeLe);
    const nomFichier = `sauvegarde-${slug}-${m.getFullYear()}-${deux(m.getMonth() + 1)}-${deux(m.getDate())}`
      + `-${deux(m.getHours())}h${deux(m.getMinutes())}.avicole`;
    const resultat = { nomFichier, contenu, entete };
    // Written after the read-only snapshot, in its own short transaction.
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO parametre (cle, valeur) VALUES ('derniere_sauvegarde', $1)
         ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
        [resultat.entete.creeLe],
      );
      const total = Object.values(resultat.entete.nombres).reduce((t, n) => t + n, 0);
      await journaliser(client, {
        module: 'parametres', action: 'autre',
        description: `Sauvegarde téléchargée : ${resultat.nomFichier} (${total.toLocaleString('fr-FR')} enregistrements)`,
      });
    });
    return resultat;
  });
}

/** Reads and checks a backup file. Returns { entete, donnees } or throws a clear French error. */
export function lireFichier(contenu) {
  const invalide = (detail) => erreurs.validation(`Ce fichier n’est pas une sauvegarde valide de la plateforme${detail ? ` : ${detail}` : '.'}`);
  if (!Buffer.isBuffer(contenu) || !contenu.length) throw invalide('le fichier est vide.');
  let texte;
  try {
    texte = zlib.gunzipSync(contenu).toString('utf8');
  } catch {
    throw invalide('choisissez un fichier .avicole téléchargé depuis Paramètres → Sauvegarde.');
  }
  const coupure = texte.indexOf('\n');
  let entete;
  try {
    entete = JSON.parse(texte.slice(0, coupure));
  } catch {
    throw invalide('l’en-tête est illisible.');
  }
  if (entete?.format !== FORMAT) throw invalide();
  if (entete.version !== VERSION_FORMAT) throw invalide('format de sauvegarde inconnu.');
  const donneesTexte = texte.slice(coupure + 1);
  if (sha256(donneesTexte) !== entete.empreinte) {
    throw erreurs.validation('Ce fichier de sauvegarde est abîmé (son contenu ne correspond plus à son empreinte). Utilisez une autre sauvegarde.');
  }
  const migrations = listeMigrations();
  const inconnues = entete.migrations.filter((m) => !migrations.includes(m));
  if (inconnues.length || entete.migrations.some((m, i) => migrations[i] !== m)) {
    throw erreurs.validation(
      `Cette sauvegarde vient d’une version plus récente de l’application (${entete.application}). `
      + `Mettez d’abord l’application à jour (version actuelle : ${config.version}), puis restaurez.`,
    );
  }
  return { entete, donnees: JSON.parse(donneesTexte) };
}

/** Tables in an order where each one comes after the tables it points to (foreign keys). */
async function ordreParents(client, tables) {
  const { rows } = await client.query(
    `SELECT c.conrelid::regclass::text AS enfant, c.confrelid::regclass::text AS parent
       FROM pg_constraint c WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace`,
  );
  const sans = (n) => n.replace(/^"|"$/g, '');
  const parents = new Map(tables.map((t) => [t, new Set()]));
  for (const r of rows) {
    const e = sans(r.enfant);
    const p = sans(r.parent);
    if (parents.has(e) && parents.has(p) && e !== p) parents.get(e).add(p);
  }
  const ordre = [];
  const vus = new Set();
  const visiter = (t) => {
    if (vus.has(t)) return;
    vus.add(t);
    for (const p of parents.get(t)) visiter(p);
    ordre.push(t);
  };
  tables.forEach(visiter);
  return ordre;
}

/** After rows were inserted with their ids: every id counter starts after the biggest id. */
async function recalerCompteurs(client, tables) {
  const { rows } = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'
        AND table_name IN (SELECT jsonb_array_elements_text($1::jsonb))`,
    [JSON.stringify(tables)],
  );
  for (const r of rows) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE(max(${id(r.column_name)}), 1), max(${id(r.column_name)}) IS NOT NULL)
         FROM ${id(r.table_name)}`,
      [r.table_name, r.column_name],
    );
  }
}

async function inserer(client, table, lignes) {
  if (!lignes.length) return;
  // jsonb_populate_recordset: PostgreSQL converts every value to the column type itself.
  await client.query(
    `INSERT INTO ${id(table)} SELECT * FROM jsonb_populate_recordset(NULL::${id(table)}, $1::jsonb)`,
    [JSON.stringify(lignes)],
  );
}

/** Replaces ALL the data with the content of the backup file (the login account is kept). */
export async function restaurerSauvegarde(contenu, motDePasse, utilisateurId) {
  const { entete, donnees } = lireFichier(contenu);
  return transaction(async (client) => {
    await exigerMotDePasse(client, utilisateurId, motDePasse);

    // 1. Keep the account and the sessions (the farmer stays logged in, with his current password),
    //    and the settings of this PC.
    const garde = {};
    for (const t of ['utilisateur', 'session']) {
      garde[t] = (await client.query(`SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)::text AS l FROM ${id(t)} x`)).rows[0].l;
    }
    const { rows: parametresPc } = await client.query(
      'SELECT cle, valeur FROM parametre WHERE cle IN (SELECT jsonb_array_elements_text($1::jsonb))',
      [JSON.stringify(PARAMETRES_DU_PC)],
    );

    // 2. Empty the database: every view and table of the application.
    const { rows: vues } = await client.query("SELECT viewname FROM pg_views WHERE schemaname = 'public'");
    for (const v of vues) await client.query(`DROP VIEW IF EXISTS ${id(v.viewname)} CASCADE`);
    const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    if (tables.length) await client.query(`DROP TABLE IF EXISTS ${tables.map((t) => id(t.tablename)).join(', ')} CASCADE`);

    // 3. Same structure as when the backup was made.
    await client.query(SQL_TABLE_MIGRATIONS);
    await appliquerFichiers(client, entete.migrations);

    // 4. The data, parents before children, after removing what the migrations put in by default.
    const existantes = await tablesDonnees(client);
    const inconnues = Object.keys(donnees).filter((t) => !existantes.includes(t));
    if (inconnues.length) throw erreurs.validation(`Sauvegarde invalide : table inconnue (${inconnues.join(', ')}).`);
    if (existantes.length) await client.query(`TRUNCATE ${existantes.map(id).join(', ')} RESTART IDENTITY CASCADE`);
    for (const t of await ordreParents(client, existantes)) await inserer(client, t, donnees[t] ?? []);
    await recalerCompteurs(client, existantes);

    // 5. An older backup is brought up to this version by the newer migrations.
    const nouvelles = listeMigrations().slice(entete.migrations.length);
    await appliquerFichiers(client, nouvelles);

    // 6. The account and sessions come back.
    await client.query('TRUNCATE session, utilisateur RESTART IDENTITY CASCADE');
    await inserer(client, 'utilisateur', JSON.parse(garde.utilisateur));
    await inserer(client, 'session', JSON.parse(garde.session));
    await recalerCompteurs(client, ['utilisateur']);
    await recalerCompteurs(client, await tablesDonnees(client));

    // 7. Trace.
    const total = Object.values(entete.nombres).reduce((t, n) => t + n, 0);
    const restauration = {
      le: new Date().toISOString(), sauvegardeDu: entete.creeLe, application: entete.application, enregistrements: total,
    };
    await client.query('DELETE FROM parametre WHERE cle IN (SELECT jsonb_array_elements_text($1::jsonb))', [JSON.stringify(PARAMETRES_DU_PC)]);
    const aRemettre = [['derniere_restauration', JSON.stringify(restauration)], ['derniere_sauvegarde', entete.creeLe],
      ...parametresPc.map((p) => [p.cle, p.valeur])];
    for (const [cle, valeur] of aRemettre) {
      await client.query(
        `INSERT INTO parametre (cle, valeur) VALUES ($1, $2) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
        [cle, valeur],
      );
    }
    const d = new Date(entete.creeLe);
    await journaliser(client, {
      module: 'parametres', action: 'autre',
      description: `Données restaurées depuis la sauvegarde du ${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} `
        + `à ${deux(d.getHours())}:${deux(d.getMinutes())} (${entete.nomExploitation}, version ${entete.application}) : `
        + `${total.toLocaleString('fr-FR')} enregistrements${nouvelles.length ? `, mise à niveau vers la version ${config.version}` : ''}`,
    });
    return { restauration, nombres: entete.nombres };
  });
}
