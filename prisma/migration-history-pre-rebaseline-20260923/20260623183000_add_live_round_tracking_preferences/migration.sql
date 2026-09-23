-- Add per-user live round tracking preferences
ALTER TABLE "user_profiles"
  ADD COLUMN "live_round_track_fir" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "live_round_track_gir" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "live_round_track_chips" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "live_round_track_greenside_bunker_shots" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "live_round_track_putts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "live_round_track_penalties" BOOLEAN NOT NULL DEFAULT true;
