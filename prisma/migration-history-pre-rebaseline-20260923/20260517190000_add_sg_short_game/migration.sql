ALTER TABLE "handicap_tier_baseline"
  ADD COLUMN "baseline_short_game_shots" DECIMAL(5,1);

UPDATE "handicap_tier_baseline"
SET "baseline_short_game_shots" = CASE "handicap"
  WHEN -8 THEN 8.2
  WHEN -6 THEN 8.4
  WHEN -4 THEN 8.7
  WHEN -2 THEN 9.0
  WHEN 0 THEN 9.3
  WHEN 2 THEN 9.8
  WHEN 4 THEN 10.4
  WHEN 6 THEN 11.1
  WHEN 8 THEN 12.0
  WHEN 10 THEN 13.1
  WHEN 12 THEN 14.3
  WHEN 14 THEN 15.6
  WHEN 16 THEN 17.0
  WHEN 18 THEN 18.5
  WHEN 20 THEN 20.1
  WHEN 22 THEN 21.7
  WHEN 24 THEN 23.3
  WHEN 26 THEN 25.0
  WHEN 28 THEN 26.5
  WHEN 30 THEN 28.1
  WHEN 32 THEN 29.8
  WHEN 34 THEN 31.5
  WHEN 36 THEN 33.2
  WHEN 38 THEN 34.9
  WHEN 40 THEN 36.6
  WHEN 42 THEN 38.3
  WHEN 44 THEN 40.1
  WHEN 46 THEN 41.9
  WHEN 48 THEN 43.2
  WHEN 50 THEN 44.7
  WHEN 52 THEN 45.2
  WHEN 54 THEN 46.0
  ELSE "baseline_short_game_shots"
END;

ALTER TABLE "handicap_tier_baseline"
  ALTER COLUMN "baseline_short_game_shots" SET NOT NULL;

ALTER TABLE "round_strokes_gained"
  ADD COLUMN "sg_short_game" DECIMAL(5,1);
