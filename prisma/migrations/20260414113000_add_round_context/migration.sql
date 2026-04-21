CREATE TYPE "RoundContext" AS ENUM ('real', 'simulator', 'practice');

ALTER TABLE "rounds"
  ADD COLUMN "round_context" "RoundContext" NOT NULL DEFAULT 'real';

CREATE INDEX "idx_round_user_context" ON "rounds"("user_id", "round_context");
