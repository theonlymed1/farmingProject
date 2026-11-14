// One error format for the whole API:
//   { "erreur": { "code": "BANDE_INTROUVABLE", "message": "…in French…", "details": … } }
// The message is shown to the farmer as is, so it must be written in plain French.

export class ErreurApp extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Shortcuts for the cases every module needs.
export const erreurs = {
  validation: (message, details) => new ErreurApp(400, 'VALIDATION', message, details),
  nonAutorise: (message = 'Veuillez vous connecter.') => new ErreurApp(401, 'NON_AUTORISE', message),
  introuvable: (message = 'Élément introuvable.') => new ErreurApp(404, 'INTROUVABLE', message),
  conflit: (message, details) => new ErreurApp(409, 'CONFLIT', message, details),
};

// PostgreSQL error codes → readable French errors (constraints are the last safety net).
const ERREURS_PG = {
  '23505': [409, 'DOUBLON', 'Cet élément existe déjà.'],
  '23503': [409, 'REFERENCE', 'Opération impossible : cet élément est lié à d’autres données.'],
  '23514': [400, 'CONTRAINTE', 'Une des valeurs saisies n’est pas acceptée.'],
  '23502': [400, 'CHAMP_MANQUANT', 'Un champ obligatoire est vide.'],
  '22P02': [400, 'FORMAT', 'Une des valeurs saisies n’a pas le bon format.'],
  '22003': [400, 'HORS_LIMITES', 'Un nombre saisi est trop grand.'],
};

export function routeApiInconnue(req, res, next) {
  next(new ErreurApp(404, 'ROUTE_INCONNUE', `Route inconnue : ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function gestionnaireErreurs(err, req, res, next) {
  if (err instanceof ErreurApp) {
    return res.status(err.status).json({ erreur: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ erreur: { code: 'JSON_INVALIDE', message: 'Données envoyées illisibles.' } });
  }
  const pgErr = ERREURS_PG[err?.code];
  if (pgErr) {
    const [status, code, message] = pgErr;
    if (status >= 500 || process.env.DEBUG === '1') console.error(err);
    return res.status(status).json({ erreur: { code, message, details: { contrainte: err.constraint } } });
  }

  console.error(err);
  return res.status(500).json({
    erreur: {
      code: 'ERREUR_INTERNE',
      message: 'Une erreur inattendue est survenue. Réessayez ou redémarrez l’application.',
    },
  });
}
