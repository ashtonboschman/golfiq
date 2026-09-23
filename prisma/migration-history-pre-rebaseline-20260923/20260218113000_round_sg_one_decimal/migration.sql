ALTER TABLE "round_strokes_gained"
  ALTER COLUMN "sg_total" TYPE DECIMAL(5,1) USING ROUND("sg_total"::numeric, 1),
  ALTER COLUMN "sg_off_tee" TYPE DECIMAL(5,1) USING ROUND("sg_off_tee"::numeric, 1),
  ALTER COLUMN "sg_approach" TYPE DECIMAL(5,1) USING ROUND("sg_approach"::numeric, 1),
  ALTER COLUMN "sg_putting" TYPE DECIMAL(5,1) USING ROUND("sg_putting"::numeric, 1),
  ALTER COLUMN "sg_penalties" TYPE DECIMAL(5,1) USING ROUND("sg_penalties"::numeric, 1),
  ALTER COLUMN "sg_residual" TYPE DECIMAL(5,1) USING ROUND("sg_residual"::numeric, 1);
