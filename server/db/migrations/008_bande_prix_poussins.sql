-- 008: total price paid for the chicks of a Bande (DH). Required for new Bandes (checked by the API);
-- NULL for Bandes created before this migration, until the farmer enters it with "Modifier".
ALTER TABLE bande ADD COLUMN prix_poussins NUMERIC(12,2) CHECK (prix_poussins >= 0);
