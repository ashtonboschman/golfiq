-- Backfill to_par for existing rounds
UPDATE "public"."rounds" r
SET "to_par" = r.score - t.par_total
FROM "public"."tees" t
WHERE r.tee_id = t.id
  AND t.par_total IS NOT NULL
  AND r.to_par IS NULL;
