-- 012: (1) The farm is a "ferme", not a "firme".
--      (2) Advances (avances) are now declared one by one by the admin, with an amount and a date,
--          instead of one automatic advance per full week. A worker can take several in a week.

UPDATE parametre SET valeur = 'Ferme Sidi Aidi'
 WHERE cle = 'nom_exploitation' AND valeur = 'Firme Sidi Aidi';

CREATE TABLE avance (
  id          BIGSERIAL PRIMARY KEY,
  employe_id  BIGINT        NOT NULL REFERENCES employe (id) ON DELETE CASCADE,
  date_avance DATE          NOT NULL,
  montant     NUMERIC(10,2) NOT NULL CHECK (montant > 0),
  note        TEXT CHECK (note IS NULL OR length(note) <= 200),
  cree_le     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX avance_employe_idx ON avance (employe_id, date_avance);

-- Workers added before this version: the automatic weekly advances they were counted become
-- real advances (one per full week, on the last day of that week), so no balance changes.
-- The admin can delete the ones that were never paid.
INSERT INTO avance (employe_id, date_avance, montant, note)
SELECT e.id, e.date_debut + (7 * k - 1), e.avance_hebdo, 'Avance hebdomadaire (calcul automatique de l’ancienne version)'
  FROM employe e
 CROSS JOIN LATERAL generate_series(1, (COALESCE(e.date_depart, current_date) - e.date_debut + 1) / 7) AS k
 WHERE e.avance_hebdo > 0
 ORDER BY e.id, k;

ALTER TABLE employe DROP COLUMN avance_hebdo;
