-- 006: the unit is no longer a setting of the guide. The farmer types "900g", "1,25 kg" or just
-- a number, and the screen shows each weight in the unit that reads best. Weights stay in grams.
ALTER TABLE croissance_config DROP COLUMN unite;
