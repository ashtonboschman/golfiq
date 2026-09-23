CREATE TYPE "ClubCategory" AS ENUM (
  'WOOD',
  'HYBRID',
  'UTILITY_IRON',
  'IRON',
  'NAMED_WEDGE',
  'LOFTED_WEDGE'
);

CREATE TABLE "club_definitions" (
  "id" BIGSERIAL NOT NULL,
  "key" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "short_label" VARCHAR(12) NOT NULL,
  "category" "ClubCategory" NOT NULL,
  "catalogue_order" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "club_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_clubs" (
  "id" BIGSERIAL NOT NULL,
  "user_id" BIGINT NOT NULL,
  "club_definition_id" BIGINT NOT NULL,
  "carry_yards" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_clubs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_clubs_carry_yards_check" CHECK ("carry_yards" BETWEEN 1 AND 399)
);

CREATE UNIQUE INDEX "club_definitions_key_key" ON "club_definitions"("key");
CREATE INDEX "idx_club_definitions_category_order" ON "club_definitions"("category", "catalogue_order");
CREATE INDEX "idx_club_definitions_active_order" ON "club_definitions"("is_active", "catalogue_order");

CREATE UNIQUE INDEX "uq_user_clubs_user_definition"
  ON "user_clubs"("user_id", "club_definition_id");
CREATE INDEX "idx_user_clubs_user" ON "user_clubs"("user_id");
CREATE INDEX "idx_user_clubs_definition" ON "user_clubs"("club_definition_id");

ALTER TABLE "user_clubs"
  ADD CONSTRAINT "user_clubs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_clubs"
  ADD CONSTRAINT "user_clubs_club_definition_id_fkey"
  FOREIGN KEY ("club_definition_id") REFERENCES "club_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "club_definitions" ("key", "name", "short_label", "category", "catalogue_order", "is_active")
VALUES
  ('DRIVER', 'Driver', 'DR', 'WOOD', 10, true),
  ('MINI_DRIVER', 'Mini Driver', 'MD', 'WOOD', 20, true),
  ('WOOD_2', '2 Wood', '2W', 'WOOD', 30, true),
  ('WOOD_3', '3 Wood', '3W', 'WOOD', 40, true),
  ('WOOD_4', '4 Wood', '4W', 'WOOD', 50, true),
  ('WOOD_5', '5 Wood', '5W', 'WOOD', 60, true),
  ('WOOD_7', '7 Wood', '7W', 'WOOD', 70, true),
  ('WOOD_9', '9 Wood', '9W', 'WOOD', 80, true),
  ('WOOD_11', '11 Wood', '11W', 'WOOD', 90, true),
  ('HYBRID_2', '2 Hybrid', '2H', 'HYBRID', 100, true),
  ('HYBRID_3', '3 Hybrid', '3H', 'HYBRID', 110, true),
  ('HYBRID_4', '4 Hybrid', '4H', 'HYBRID', 120, true),
  ('HYBRID_5', '5 Hybrid', '5H', 'HYBRID', 130, true),
  ('HYBRID_6', '6 Hybrid', '6H', 'HYBRID', 140, true),
  ('HYBRID_7', '7 Hybrid', '7H', 'HYBRID', 150, true),
  ('HYBRID_8', '8 Hybrid', '8H', 'HYBRID', 160, true),
  ('UTILITY_2', '2 Utility', '2U', 'UTILITY_IRON', 170, true),
  ('UTILITY_3', '3 Utility', '3U', 'UTILITY_IRON', 180, true),
  ('UTILITY_4', '4 Utility', '4U', 'UTILITY_IRON', 190, true),
  ('UTILITY_5', '5 Utility', '5U', 'UTILITY_IRON', 200, true),
  ('UTILITY_6', '6 Utility', '6U', 'UTILITY_IRON', 210, true),
  ('IRON_1', '1 Iron', '1I', 'IRON', 220, true),
  ('IRON_2', '2 Iron', '2I', 'IRON', 230, true),
  ('IRON_3', '3 Iron', '3I', 'IRON', 240, true),
  ('IRON_4', '4 Iron', '4I', 'IRON', 250, true),
  ('IRON_5', '5 Iron', '5I', 'IRON', 260, true),
  ('IRON_6', '6 Iron', '6I', 'IRON', 270, true),
  ('IRON_7', '7 Iron', '7I', 'IRON', 280, true),
  ('IRON_8', '8 Iron', '8I', 'IRON', 290, true),
  ('IRON_9', '9 Iron', '9I', 'IRON', 300, true),
  ('PITCHING_WEDGE', 'Pitching Wedge', 'PW', 'NAMED_WEDGE', 310, true),
  ('APPROACH_WEDGE', 'Approach Wedge', 'AW', 'NAMED_WEDGE', 320, true),
  ('GAP_WEDGE', 'Gap Wedge', 'GW', 'NAMED_WEDGE', 330, true),
  ('SAND_WEDGE', 'Sand Wedge', 'SW', 'NAMED_WEDGE', 340, true),
  ('LOB_WEDGE', 'Lob Wedge', 'LW', 'NAMED_WEDGE', 350, true),
  ('WEDGE_44', '44° Wedge', '44°', 'LOFTED_WEDGE', 360, true),
  ('WEDGE_45', '45° Wedge', '45°', 'LOFTED_WEDGE', 370, true),
  ('WEDGE_46', '46° Wedge', '46°', 'LOFTED_WEDGE', 380, true),
  ('WEDGE_47', '47° Wedge', '47°', 'LOFTED_WEDGE', 390, true),
  ('WEDGE_48', '48° Wedge', '48°', 'LOFTED_WEDGE', 400, true),
  ('WEDGE_49', '49° Wedge', '49°', 'LOFTED_WEDGE', 410, true),
  ('WEDGE_50', '50° Wedge', '50°', 'LOFTED_WEDGE', 420, true),
  ('WEDGE_51', '51° Wedge', '51°', 'LOFTED_WEDGE', 430, true),
  ('WEDGE_52', '52° Wedge', '52°', 'LOFTED_WEDGE', 440, true),
  ('WEDGE_53', '53° Wedge', '53°', 'LOFTED_WEDGE', 450, true),
  ('WEDGE_54', '54° Wedge', '54°', 'LOFTED_WEDGE', 460, true),
  ('WEDGE_55', '55° Wedge', '55°', 'LOFTED_WEDGE', 470, true),
  ('WEDGE_56', '56° Wedge', '56°', 'LOFTED_WEDGE', 480, true),
  ('WEDGE_57', '57° Wedge', '57°', 'LOFTED_WEDGE', 490, true),
  ('WEDGE_58', '58° Wedge', '58°', 'LOFTED_WEDGE', 500, true),
  ('WEDGE_59', '59° Wedge', '59°', 'LOFTED_WEDGE', 510, true),
  ('WEDGE_60', '60° Wedge', '60°', 'LOFTED_WEDGE', 520, true),
  ('WEDGE_61', '61° Wedge', '61°', 'LOFTED_WEDGE', 530, true),
  ('WEDGE_62', '62° Wedge', '62°', 'LOFTED_WEDGE', 540, true),
  ('WEDGE_63', '63° Wedge', '63°', 'LOFTED_WEDGE', 550, true),
  ('WEDGE_64', '64° Wedge', '64°', 'LOFTED_WEDGE', 560, true),
  ('WEDGE_65', '65° Wedge', '65°', 'LOFTED_WEDGE', 570, true)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "short_label" = EXCLUDED."short_label",
  "category" = EXCLUDED."category",
  "catalogue_order" = EXCLUDED."catalogue_order",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = CURRENT_TIMESTAMP;
