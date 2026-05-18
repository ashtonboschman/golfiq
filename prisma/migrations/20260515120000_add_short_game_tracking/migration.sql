-- Add optional short-game tracking fields for Phase 1 MVP
ALTER TABLE "rounds"
  ADD COLUMN "chips" INTEGER,
  ADD COLUMN "greenside_bunker_shots" INTEGER,
  ADD COLUMN "short_game_shots" INTEGER;

ALTER TABLE "round_holes"
  ADD COLUMN "chips" INTEGER,
  ADD COLUMN "greenside_bunker_shots" INTEGER;
