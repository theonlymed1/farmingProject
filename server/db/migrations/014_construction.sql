-- 014: Construction of the new farm. Its charges have no link with the Bandes (no bande_id) and
-- never count in a Bande's costs. Two kinds, one list:
--   grosse : name, quantity, total amount, description
--   petite : name, unit (kg, L, pièce…), quantity, price per unit → total = quantity × price per unit

CREATE TABLE charge_construction (
  id             BIGSERIAL PRIMARY KEY,
  type           TEXT          NOT NULL CHECK (type IN ('grosse', 'petite')),
  date_charge    DATE          NOT NULL,
  nom            TEXT          NOT NULL CHECK (length(btrim(nom)) BETWEEN 1 AND 100),
  unite          TEXT CHECK (unite IS NULL OR length(btrim(unite)) BETWEEN 1 AND 20),
  quantite       NUMERIC(14,3) NOT NULL CHECK (quantite > 0),
  prix_unitaire  NUMERIC(14,2) CHECK (prix_unitaire IS NULL OR prix_unitaire > 0),
  montant_total  NUMERIC(14,2) NOT NULL CHECK (montant_total > 0),
  description    TEXT CHECK (description IS NULL OR length(description) <= 500),
  cree_le        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- A small charge always has its unit and price per unit.
  CHECK (type = 'grosse' OR (unite IS NOT NULL AND prix_unitaire IS NOT NULL))
);
CREATE INDEX charge_construction_date_idx ON charge_construction (date_charge DESC, id DESC);
