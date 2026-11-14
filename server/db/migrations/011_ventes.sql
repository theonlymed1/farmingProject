-- 011: Ventes. Birds sold to a customer: they leave the flock (healthy birds only) and
-- each sale gets an invoice number (V2026-0001, V2026-0002, … numbered per year).

-- Last invoice number given, per year. A number is never given twice, even after a sale
-- (or its whole Bande) is deleted, so a printed invoice always points to one sale.
CREATE TABLE compteur_facture (
  annee   SMALLINT PRIMARY KEY,
  dernier INTEGER  NOT NULL CHECK (dernier >= 0)
);

CREATE TABLE vente (
  id            BIGSERIAL PRIMARY KEY,
  numero        TEXT    NOT NULL UNIQUE,
  bande_id      BIGINT  NOT NULL REFERENCES bande (id) ON DELETE CASCADE,
  date_vente    DATE    NOT NULL,
  client        TEXT    NOT NULL CHECK (length(btrim(client)) BETWEEN 1 AND 100),
  type_client   TEXT    NOT NULL CHECK (type_client IN ('particulier', 'societe')),
  males         INTEGER NOT NULL DEFAULT 0 CHECK (males >= 0),
  femelles      INTEGER NOT NULL DEFAULT 0 CHECK (femelles >= 0),
  non_sexes     INTEGER NOT NULL DEFAULT 0 CHECK (non_sexes >= 0),
  poids_total_kg NUMERIC(12,3) NOT NULL CHECK (poids_total_kg > 0),
  prix_total    NUMERIC(12,2) NOT NULL CHECK (prix_total >= 0),
  description   TEXT CHECK (description IS NULL OR length(description) <= 500),
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
  modifie_le    TIMESTAMPTZ,
  CHECK (males + femelles + non_sexes > 0)
);

CREATE INDEX vente_bande_date_idx ON vente (bande_id, date_vente);

-- Every change of the flock, health declarations and sales together. The flock checks and
-- the Bande totals read this view, so a sale counts like a death of healthy birds.
CREATE VIEW mouvement_troupeau AS
  SELECT bande_id, type, provenance, date_mouvement, males, femelles, non_sexes
    FROM mouvement_sante
  UNION ALL
  SELECT bande_id, 'vente', 'sains', date_vente, males, femelles, non_sexes
    FROM vente;
