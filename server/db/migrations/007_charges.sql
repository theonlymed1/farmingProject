-- 007: Charges (phase 5). One row per purchase or service, inside a Bande.
-- The price can be entered later (bought on credit): a charge without price doesn't count in totals.

CREATE TABLE charge (
  id           BIGSERIAL PRIMARY KEY,
  bande_id     BIGINT NOT NULL REFERENCES bande (id) ON DELETE CASCADE,
  date_charge  DATE   NOT NULL,
  vendeur      TEXT   NOT NULL CHECK (length(btrim(vendeur)) BETWEEN 1 AND 80),
  type_produit TEXT   NOT NULL CHECK (length(btrim(type_produit)) BETWEEN 1 AND 60),
  produit      TEXT   NOT NULL CHECK (length(btrim(produit)) BETWEEN 1 AND 100),
  quantite     NUMERIC(12,3) CHECK (quantite > 0),
  unite        TEXT CHECK (unite IS NULL OR length(unite) <= 20),
  prix_total   NUMERIC(12,2) CHECK (prix_total >= 0),          -- DH, NULL = not known yet
  description  TEXT CHECK (description IS NULL OR length(description) <= 500),
  cree_le      TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le   TIMESTAMPTZ
);

CREATE INDEX charge_bande_date_idx ON charge (bande_id, date_charge DESC, id DESC);
-- Suggestions are looked up by seller (case-insensitive) across all Bandes.
CREATE INDEX charge_vendeur_idx ON charge (lower(vendeur));
