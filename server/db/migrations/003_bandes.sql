-- 003: Bandes (phase 2). Every later feature table will reference bande(id) ON DELETE CASCADE,
-- so deleting a Bande removes everything recorded in it.

CREATE TABLE bande (
  id              BIGSERIAL PRIMARY KEY,
  nom             TEXT     NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 60),
  date_debut      DATE     NOT NULL,
  duree_mois      SMALLINT NOT NULL DEFAULT 4 CHECK (duree_mois BETWEEN 1 AND 12),
  nombre_poussins INTEGER  NOT NULL CHECK (nombre_poussins BETWEEN 1 AND 1000000),
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le      TIMESTAMPTZ
);

-- Two Bandes can't have the same name (ignoring case and spaces at the ends).
CREATE UNIQUE INDEX bande_nom_unique ON bande (lower(btrim(nom)));
CREATE INDEX bande_date_debut_idx ON bande (date_debut DESC);

-- History lines survive the deletion of their Bande (the link is just cleared).
ALTER TABLE historique
  ADD CONSTRAINT historique_bande_fk FOREIGN KEY (bande_id) REFERENCES bande (id) ON DELETE SET NULL;
