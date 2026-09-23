-- Add optional directional miss tracking for hole-level FIR/GIR
CREATE TYPE "RoundMissDirection" AS ENUM ('hit', 'miss_left', 'miss_right', 'miss_short', 'miss_long');

ALTER TABLE "round_holes"
  ADD COLUMN "fir_direction" "RoundMissDirection",
  ADD COLUMN "gir_direction" "RoundMissDirection";
