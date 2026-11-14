-- 009: chicks arrive without known sex. A Bande now records only its number of chicks (all
-- "non sexés" at the start); a new declaration "sexage" moves healthy non-sexed birds to males /
-- females, at any time and as many times as needed. Health declarations get a third count:
-- non_sexes (birds of unknown sex that fall sick, recover or die).

-- 1. Third count on every declaration.
ALTER TABLE mouvement_sante ADD COLUMN non_sexes INTEGER NOT NULL DEFAULT 0;

-- 2. Replace the CHECK constraints of mouvement_sante (their generated names aren't reliable).
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'mouvement_sante'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE mouvement_sante DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE mouvement_sante
  ADD CONSTRAINT mouvement_type CHECK (type IN ('maladie', 'guerison', 'mort', 'sexage')),
  ADD CONSTRAINT mouvement_nombres_positifs CHECK (males >= 0 AND femelles >= 0 AND non_sexes >= 0),
  ADD CONSTRAINT mouvement_au_moins_un CHECK (males + femelles + non_sexes > 0),
  -- A death says where the birds were (healthy / sick); nothing else has a provenance.
  -- COALESCE: a CHECK that evaluates to NULL passes, so a death without provenance must give false.
  ADD CONSTRAINT mouvement_provenance CHECK (
    CASE WHEN type = 'mort' THEN COALESCE(provenance IN ('sains', 'malades'), false) ELSE provenance IS NULL END),
  -- Sexing turns non-sexed birds into males / females: it has no non_sexes count of its own.
  ADD CONSTRAINT mouvement_sexage CHECK (type <> 'sexage' OR non_sexes = 0),
  ADD CONSTRAINT mouvement_note CHECK (note IS NULL OR length(note) <= 200);

-- 3. Bandes created with males / females: keep that split as a sexing on the start date.
INSERT INTO mouvement_sante (bande_id, type, date_mouvement, males, femelles, non_sexes, note)
SELECT id, 'sexage', date_debut, nombre_males, nombre_femelles, 0, 'Sexes saisis à la création de la bande'
  FROM bande
 WHERE nombre_males + nombre_femelles > 0;

-- 4. The Bande keeps only its total number of chicks (a plain column again, no longer computed).
ALTER TABLE bande RENAME COLUMN nombre_poussins TO ancien_total;
ALTER TABLE bande ADD COLUMN nombre_poussins INTEGER;
UPDATE bande SET nombre_poussins = nombre_males + nombre_femelles;
ALTER TABLE bande ALTER COLUMN nombre_poussins SET NOT NULL;
ALTER TABLE bande ADD CONSTRAINT bande_nombre_poussins CHECK (nombre_poussins BETWEEN 1 AND 1000000);
ALTER TABLE bande DROP COLUMN ancien_total;
ALTER TABLE bande DROP COLUMN nombre_males;
ALTER TABLE bande DROP COLUMN nombre_femelles;
