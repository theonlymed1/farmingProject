-- 004: males / females per Bande + health declarations (phase 3: Mortalité et malades).

-- 1. A Bande now records males and females; the total is computed.
--    Bandes created before this phase get all their chicks counted as males:
--    correct them with "Modifier" on the Bande page.
ALTER TABLE bande ADD COLUMN nombre_males    INTEGER;
ALTER TABLE bande ADD COLUMN nombre_femelles INTEGER;
UPDATE bande SET nombre_males = nombre_poussins, nombre_femelles = 0;
ALTER TABLE bande ALTER COLUMN nombre_males    SET NOT NULL;
ALTER TABLE bande ALTER COLUMN nombre_femelles SET NOT NULL;
ALTER TABLE bande ADD CONSTRAINT bande_males_positif    CHECK (nombre_males >= 0);
ALTER TABLE bande ADD CONSTRAINT bande_femelles_positif CHECK (nombre_femelles >= 0);
ALTER TABLE bande ADD CONSTRAINT bande_total_poussins   CHECK (nombre_males + nombre_femelles BETWEEN 1 AND 1000000);

ALTER TABLE bande DROP COLUMN nombre_poussins;
ALTER TABLE bande ADD COLUMN nombre_poussins INTEGER GENERATED ALWAYS AS (nombre_males + nombre_femelles) STORED;

-- 2. Every declaration moves birds between three groups, per sex:
--      maladie  : en bonne santé → malades
--      guerison : malades        → en bonne santé
--      mort     : en bonne santé (provenance 'sains') or malades (provenance 'malades') → morts
CREATE TABLE mouvement_sante (
  id             BIGSERIAL PRIMARY KEY,
  bande_id       BIGINT  NOT NULL REFERENCES bande (id) ON DELETE CASCADE,
  type           TEXT    NOT NULL CHECK (type IN ('maladie', 'guerison', 'mort')),
  provenance     TEXT,
  date_mouvement DATE    NOT NULL,
  males          INTEGER NOT NULL DEFAULT 0 CHECK (males >= 0),
  femelles       INTEGER NOT NULL DEFAULT 0 CHECK (femelles >= 0),
  note           TEXT CHECK (note IS NULL OR length(note) <= 200),
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (males + femelles > 0),
  -- COALESCE: a CHECK that evaluates to NULL passes, so a death without provenance must give false.
  CHECK (CASE WHEN type = 'mort' THEN COALESCE(provenance IN ('sains', 'malades'), false) ELSE provenance IS NULL END)
);

CREATE INDEX mouvement_sante_bande_date_idx ON mouvement_sante (bande_id, date_mouvement);
