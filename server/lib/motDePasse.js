// Password hashing with Node's built-in scrypt: strong, and no extra package to install.
// Stored format: scrypt$N$r$p$<salt base64>$<hash base64>
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384;
const R = 8;
const P = 1;
const LONGUEUR_CLE = 64;

export async function hacherMotDePasse(motDePasse) {
  const sel = crypto.randomBytes(16);
  const cle = await scrypt(motDePasse.normalize('NFC'), sel, LONGUEUR_CLE, { N, r: R, p: P });
  return ['scrypt', N, R, P, sel.toString('base64'), cle.toString('base64')].join('$');
}

export async function verifierMotDePasse(motDePasse, stocke) {
  const parties = String(stocke).split('$');
  if (parties.length !== 6 || parties[0] !== 'scrypt') return false;
  const [, n, r, p, selB64, cleB64] = parties;
  const attendue = Buffer.from(cleB64, 'base64');
  const calculee = await scrypt(motDePasse.normalize('NFC'), Buffer.from(selB64, 'base64'), attendue.length, {
    N: Number(n), r: Number(r), p: Number(p),
  });
  return crypto.timingSafeEqual(attendue, calculee);
}

// "Strong password" rules, in French because they're shown on screen.
const REGLES = [
  { test: (m) => m.length >= 10, message: 'au moins 10 caractères' },
  { test: (m) => /[a-z]/.test(m), message: 'une lettre minuscule' },
  { test: (m) => /[A-Z]/.test(m), message: 'une lettre majuscule' },
  { test: (m) => /\d/.test(m), message: 'un chiffre' },
  { test: (m) => /[^A-Za-z0-9]/.test(m), message: 'un caractère spécial (ex. ! @ # - _)' },
];

/** Returns the list of rules the password does NOT meet (empty = strong enough). */
export function reglesNonRespectees(motDePasse) {
  const m = String(motDePasse ?? '');
  return REGLES.filter((r) => !r.test(m)).map((r) => r.message);
}

/** Random strong password, easy to read and copy by hand (no 0/O, 1/l/I). */
export function genererMotDePasse(longueur = 14) {
  const groupes = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%-_+'];
  const tous = groupes.join('');
  const car = (s) => s[crypto.randomInt(s.length)];
  const lettres = groupes.map(car); // one of each kind, guaranteed
  while (lettres.length < longueur) lettres.push(car(tous));
  for (let i = lettres.length - 1; i > 0; i -= 1) { // shuffle
    const j = crypto.randomInt(i + 1);
    [lettres[i], lettres[j]] = [lettres[j], lettres[i]];
  }
  return lettres.join('');
}
