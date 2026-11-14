-- 010: Employés (phase 6). Workers of a Bande, their rest days, and their departure.
-- Weekly advances are not entered: one advance is counted per full week since the start date.
-- "Supprimer" = the worker leaves: date_depart is set and the record stays (costs, receipt).

CREATE TABLE employe (
  id                 BIGSERIAL PRIMARY KEY,
  bande_id           BIGINT   NOT NULL REFERENCES bande (id) ON DELETE CASCADE,
  nom                TEXT     NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 100),
  age                SMALLINT NOT NULL CHECK (age BETWEEN 15 AND 90),
  cin                TEXT     NOT NULL CHECK (length(btrim(cin)) BETWEEN 1 AND 20),
  date_debut         DATE     NOT NULL,
  avance_hebdo       NUMERIC(10,2) NOT NULL DEFAULT 200 CHECK (avance_hebdo >= 0),   -- DH per full week
  salaire_journalier NUMERIC(10,2) NOT NULL CHECK (salaire_journalier >= 0),         -- DH per day worked
  date_depart        DATE CHECK (date_depart IS NULL OR date_depart >= date_debut),
  cree_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le         TIMESTAMPTZ
);

CREATE INDEX employe_bande_idx ON employe (bande_id);
-- The same CIN can't be on two current workers of one Bande.
CREATE UNIQUE INDEX employe_cin_actif ON employe (bande_id, upper(btrim(cin))) WHERE date_depart IS NULL;

CREATE TABLE jour_repos (
  employe_id BIGINT NOT NULL REFERENCES employe (id) ON DELETE CASCADE,
  jour       DATE   NOT NULL,
  note       TEXT CHECK (note IS NULL OR length(note) <= 200),
  cree_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employe_id, jour)
);
