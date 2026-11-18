-- 013: Véhicules (work cars) of a Bande and their charges (oil change, tyres, fuel…).
-- The charges of the cars count in the total cost of the Bande.

CREATE TABLE vehicule (
  id         BIGSERIAL PRIMARY KEY,
  bande_id   BIGINT NOT NULL REFERENCES bande (id) ON DELETE CASCADE,
  nom        TEXT   NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 60),
  modele     TEXT   NOT NULL CHECK (length(btrim(modele)) BETWEEN 1 AND 60),
  matricule  TEXT   NOT NULL CHECK (length(btrim(matricule)) BETWEEN 1 AND 20),
  cree_le    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicule_bande_idx ON vehicule (bande_id);
-- One plate once per Bande ("12345-A-6" and "12345 a 6" are the same plate).
CREATE UNIQUE INDEX vehicule_matricule_unique
  ON vehicule (bande_id, upper(regexp_replace(matricule, '[\s|/-]', '', 'g')));

CREATE TABLE charge_vehicule (
  id           BIGSERIAL PRIMARY KEY,
  vehicule_id  BIGINT NOT NULL REFERENCES vehicule (id) ON DELETE CASCADE,
  libelle      TEXT   NOT NULL CHECK (length(btrim(libelle)) BETWEEN 1 AND 100),
  date_charge  DATE   NOT NULL,
  montant      NUMERIC(12,2) NOT NULL CHECK (montant > 0),
  description  TEXT CHECK (description IS NULL OR length(description) <= 500),
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX charge_vehicule_idx ON charge_vehicule (vehicule_id, date_charge);
