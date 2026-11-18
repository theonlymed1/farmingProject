-- 015: Construction. "Grosse" charges are now called "charges générales" and "petites" charges
-- "charges spécifiques" (labels only: the stored type stays 'grosse' / 'petite').
-- The quantity of a general charge is free text ("30 m³", "1 lot", "2 camions"): new column
-- quantite_texte; the number column is kept for the specific charges (quantity × price per unit).

ALTER TABLE charge_construction ADD COLUMN quantite_texte TEXT
  CHECK (quantite_texte IS NULL OR length(btrim(quantite_texte)) BETWEEN 1 AND 50);

-- Existing general charges: 30.000 → '30', 2.500 → '2,5'.
UPDATE charge_construction
   SET quantite_texte = replace(rtrim(rtrim(quantite::text, '0'), '.'), '.', ',')
 WHERE type = 'grosse';

ALTER TABLE charge_construction ALTER COLUMN quantite DROP NOT NULL;
UPDATE charge_construction SET quantite = NULL WHERE type = 'grosse';

ALTER TABLE charge_construction ADD CONSTRAINT charge_construction_quantite_selon_type CHECK (
  (type = 'grosse' AND quantite_texte IS NOT NULL AND quantite IS NULL)
  OR (type = 'petite' AND quantite IS NOT NULL AND quantite_texte IS NULL)
);
