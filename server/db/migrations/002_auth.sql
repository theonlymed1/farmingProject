-- 002: login (phase 1). One user, sessions stored in the database.

CREATE TABLE utilisateur (
  id                      BIGSERIAL PRIMARY KEY,
  identifiant             TEXT NOT NULL UNIQUE,
  mot_de_passe_hash       TEXT NOT NULL,          -- scrypt, never the password itself
  cree_le                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  mot_de_passe_modifie_le TIMESTAMPTZ
);

-- A row per logged-in browser. `id` is the SHA-256 of the cookie token,
-- so a copy of the database alone can't be used to log in.
CREATE TABLE session (
  id                TEXT PRIMARY KEY,
  utilisateur_id    BIGINT NOT NULL REFERENCES utilisateur (id) ON DELETE CASCADE,
  cree_le           TIMESTAMPTZ NOT NULL DEFAULT now(),
  derniere_activite TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX session_activite_idx ON session (derniere_activite);

UPDATE parametre SET valeur = 'Firme Sidi Aidi' WHERE cle = 'nom_exploitation';
