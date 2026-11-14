-- 005: growth guide and observed weights (phase 4: Croissance et pesées).
-- Every Bande has its own guide. Weights are stored in GRAMS; the unit (g / kg) is only how
-- the farmer types and reads them.

CREATE TABLE croissance_config (
  bande_id      BIGINT PRIMARY KEY REFERENCES bande (id) ON DELETE CASCADE,
  periode_jours SMALLINT NOT NULL CHECK (periode_jours BETWEEN 1 AND 60), -- 7 = weekly check
  unite         TEXT     NOT NULL CHECK (unite IN ('g', 'kg')),
  modifie_le    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per check (rang 1 = first check, at day 1 × period after arrival).
CREATE TABLE croissance_point (
  bande_id           BIGINT   NOT NULL REFERENCES bande (id) ON DELETE CASCADE,
  rang               SMALLINT NOT NULL CHECK (rang BETWEEN 1 AND 400),
  guide_males_g      NUMERIC(8,1) CHECK (guide_males_g      > 0 AND guide_males_g      < 100000),
  guide_femelles_g   NUMERIC(8,1) CHECK (guide_femelles_g   > 0 AND guide_femelles_g   < 100000),
  observe_males_g    NUMERIC(8,1) CHECK (observe_males_g    > 0 AND observe_males_g    < 100000),
  observe_femelles_g NUMERIC(8,1) CHECK (observe_femelles_g > 0 AND observe_femelles_g < 100000),
  modifie_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bande_id, rang)
);
