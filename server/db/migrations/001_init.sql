-- 001: foundations shared by every feature.

-- Every change made in the app leaves one row here (written in the same transaction).
CREATE TABLE historique (
  id          BIGSERIAL PRIMARY KEY,
  date_heure  TIMESTAMPTZ NOT NULL DEFAULT now(),
  bande_id    BIGINT,                 -- foreign key added once the bande table exists (phase 2)
  module      TEXT NOT NULL,          -- 'bandes', 'charges', 'employes', …
  action      TEXT NOT NULL CHECK (action IN ('creation', 'modification', 'suppression', 'autre')),
  entite_id   BIGINT,                 -- id of the record that changed
  description TEXT NOT NULL,          -- French sentence shown to the farmer
  avant       JSONB,                  -- values before the change (modification, suppression)
  apres       JSONB                   -- values after the change (creation, modification)
);

CREATE INDEX historique_date_idx   ON historique (date_heure DESC);
CREATE INDEX historique_bande_idx  ON historique (bande_id);
CREATE INDEX historique_module_idx ON historique (module);

-- Simple key/value settings (farm name for print headers, etc.).
CREATE TABLE parametre (
  cle    TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

INSERT INTO parametre (cle, valeur) VALUES ('nom_exploitation', 'Exploitation avicole');
