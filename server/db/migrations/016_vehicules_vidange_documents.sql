-- 016: Véhicules. A car charge now has a category:
--   'charge'  : any charge (as before)
--   'vidange' : oil change, with the current mileage and the distance to the next one
--               (next vidange at kilometrage + intervalle_km, shown in the list of cars)
--   'visite', 'vignette', 'assurance', 'carte_grise' : the 4 car documents, with a validity
--               (duree_mois) → expiry date = date + duree_mois. The latest one of each kind is current.
-- Documents are paid like any car charge, so they count in the cost of the Bande too.

ALTER TABLE charge_vehicule
  ADD COLUMN categorie TEXT NOT NULL DEFAULT 'charge'
    CHECK (categorie IN ('charge', 'vidange', 'visite', 'vignette', 'assurance', 'carte_grise')),
  ADD COLUMN kilometrage INTEGER CHECK (kilometrage IS NULL OR kilometrage BETWEEN 0 AND 9999999),
  ADD COLUMN intervalle_km INTEGER CHECK (intervalle_km IS NULL OR intervalle_km BETWEEN 1 AND 1000000),
  ADD COLUMN duree_mois INTEGER CHECK (duree_mois IS NULL OR duree_mois BETWEEN 1 AND 1200);

ALTER TABLE charge_vehicule ADD CONSTRAINT charge_vehicule_champs_selon_categorie CHECK (
  CASE categorie
    WHEN 'charge'  THEN kilometrage IS NULL AND intervalle_km IS NULL AND duree_mois IS NULL
    WHEN 'vidange' THEN kilometrage IS NOT NULL AND intervalle_km IS NOT NULL AND duree_mois IS NULL
    ELSE duree_mois IS NOT NULL AND kilometrage IS NULL AND intervalle_km IS NULL
  END
);

-- A document can cost nothing (e.g. a free vignette); other charges still need an amount.
ALTER TABLE charge_vehicule DROP CONSTRAINT charge_vehicule_montant_check;
ALTER TABLE charge_vehicule ADD CONSTRAINT charge_vehicule_montant_check CHECK (
  montant > 0 OR (montant = 0 AND categorie IN ('visite', 'vignette', 'assurance', 'carte_grise'))
);

CREATE INDEX charge_vehicule_categorie_idx ON charge_vehicule (vehicule_id, categorie, date_charge DESC);
