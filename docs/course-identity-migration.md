# Course Identity Migration Runbook

This runbook separates GolfIQ's bigint course IDs from opaque external provider IDs. Migrate exactly one course per call, verify it fully, and stop on any mismatch. Do not update child tables manually; PostgreSQL `ON UPDATE CASCADE` is responsible for every direct reference.

## Before applying the infrastructure migration

1. Review `prisma/migrations/20260807120000_separate_course_external_ids/migration.sql`.
2. Run the read-only inspection queries below in the Supabase SQL Editor.
3. Record the current course-sequence state so it can be compared after deployment.

Deploying the infrastructure migration creates tables and admin-only functions, but it does not reset the course sequence or migrate a course. The maintenance window begins later, before the explicit preparation call.

List every direct foreign key to `public.courses(id)` and inspect both rules:

```sql
SELECT
  child_namespace.nspname AS child_schema,
  child_table.relname AS child_table,
  constraint_row.conname AS constraint_name,
  child_attribute.attname AS child_column,
  CASE constraint_row.confupdtype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_update,
  CASE constraint_row.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete
FROM pg_constraint AS constraint_row
JOIN pg_class AS parent_table ON parent_table.oid = constraint_row.confrelid
JOIN pg_namespace AS parent_namespace ON parent_namespace.oid = parent_table.relnamespace
JOIN pg_class AS child_table ON child_table.oid = constraint_row.conrelid
JOIN pg_namespace AS child_namespace ON child_namespace.oid = child_table.relnamespace
JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS child_key(attnum, position) ON TRUE
JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY AS parent_key(attnum, position)
  ON parent_key.position = child_key.position
JOIN pg_attribute AS child_attribute
  ON child_attribute.attrelid = child_table.oid
  AND child_attribute.attnum = child_key.attnum
JOIN pg_attribute AS parent_attribute
  ON parent_attribute.attrelid = parent_table.oid
  AND parent_attribute.attnum = parent_key.attnum
WHERE constraint_row.contype = 'f'
  AND parent_namespace.nspname = 'public'
  AND parent_table.relname = 'courses'
  AND parent_attribute.attname = 'id'
ORDER BY child_schema, child_table, constraint_name;
```

Every returned row must show `CASCADE` under `on_update`. `user_profiles.favorite_course_id` should continue to show `SET NULL` under `on_delete`.

Confirm the reserved low range is unused:

```sql
SELECT id, club_name, course_name
FROM public.courses
WHERE id BETWEEN 1 AND 4677
ORDER BY id;
```

This should return zero rows. The later preparation function refuses to reset the sequence if it does not.

Inspect the associated sequence without advancing it:

```sql
SELECT pg_get_serial_sequence('public.courses', 'id') AS courses_id_sequence;

SELECT last_value, is_called
FROM public.courses_id_seq;
```

The first query must return a sequence. The admin functions use that associated sequence and do not create another permanent course-ID sequence.

## Apply later, after review

The following command is for the operator to run later from the reviewed application revision. Codex must not run it:

```powershell
npx prisma migrate deploy
```

After it succeeds, repeat the foreign-key, low-range, and sequence checks. The sequence values must be unchanged from the values recorded before deployment.

## Prepare the migration window

1. Schedule a maintenance window and take a restorable Supabase database backup.
2. Confirm the backup completed and record its recovery point.
3. Stop course imports and manual course creation. Keep them stopped throughout the initial identity migration if strict visual ordering of new IDs is desired.
4. Re-run the low-range and sequence checks above.
5. Confirm no course identity migration has already been recorded:

```sql
SELECT *
FROM public.course_id_migration_map
ORDER BY migrated_at;
```

This must return zero rows before preparation. Then, and only then, explicitly prepare the existing course sequence:

```sql
SELECT *
FROM public.prepare_course_identity_migration();
```

This command is for the operator to run later and was not run by Codex. It takes an exclusive course-table lock, confirms IDs `1–4677` are empty, confirms the migration map is empty, resolves the actual `courses.id` sequence, and resets its next value to `1`. Normal application users cannot execute it.

Immediately verify:

```sql
SELECT last_value, is_called
FROM public.courses_id_seq;
```

The expected result is `last_value = 1` and `is_called = false`.

## Migrate one course

Review each course's origin before choosing a workflow. IDs in the historical `Date.now()` range are useful candidates for manual review:

```sql
SELECT
  id,
  club_name,
  course_name
FROM public.courses
WHERE id >= 1000000000000
ORDER BY id;
```

A large ID does not prove that a course was manually created. Confirm its provenance before migrating it.

### API-backed course

Use the current provider ID as an opaque, case-preserving string. The default provider is `golfcourseapi`.

```sql
SELECT *
FROM public.migrate_course_identity(<old_id>, '<new_external_id>');
```

MacGregor example:

```sql
SELECT *
FROM public.migrate_course_identity(8873, '93kzhy6b');
```

This example is documentation only and must not be run by Codex. The function locks the course, validates all catalog-discovered foreign keys, allocates from the real course sequence, stores only the current provider ID, updates the primary key, records the old internal ID in the migration map, and verifies the cascaded reference counts in one atomic call. Any error aborts the call.

Expected identity records:

- `course_id_migration_map` contains the old/new IDs, `golfcourseapi`, and `93kzhy6b`.
- `course_external_ids` contains exactly the `golfcourseapi` / `93kzhy6b` mapping for the new course ID.

### Genuinely manual course

Pass SQL `NULL` when the existing course has no real provider identity:

```sql
SELECT *
FROM public.migrate_course_identity(
  1723456789012,
  NULL
);
```

Expected identity records:

- The course receives the next sequence-generated GolfIQ ID.
- `course_id_migration_map` contains the old/new IDs with `provider` and `current_external_id` both `NULL`.
- No `course_external_ids` row is created for the course.

Do not pass an empty string, whitespace, a placeholder provider, or the old course ID as an external identifier. Empty and whitespace-only external IDs are rejected; `NULL` is the intentional manual-course signal.

Sequence values can contain gaps after failed or rolled-back transactions. A gap does not indicate course or child-record data loss.

## Verify each call

Replace `<old_id>` and `<new_id>` with the function result. Keep both values in the review record.

```sql
SELECT id, club_name, course_name, verified, created_at, updated_at
FROM public.courses
WHERE id IN (<old_id>, <new_id>);

SELECT id, course_id, provider, external_id, created_at, last_seen_at
FROM public.course_external_ids
WHERE course_id = <new_id>
ORDER BY provider, external_id;

SELECT old_course_id, new_course_id, provider, current_external_id, migrated_at
FROM public.course_id_migration_map
WHERE old_course_id = <old_id> OR new_course_id = <new_id>;

SELECT * FROM public.locations WHERE course_id IN (<old_id>, <new_id>);
SELECT * FROM public.tees WHERE course_id IN (<old_id>, <new_id>) ORDER BY id;
SELECT * FROM public.rounds WHERE course_id IN (<old_id>, <new_id>) ORDER BY id;
SELECT * FROM public.mapped_courses WHERE course_id IN (<old_id>, <new_id>);
SELECT * FROM public.live_round_sessions WHERE course_id IN (<old_id>, <new_id>) ORDER BY id;
SELECT * FROM public.gps_course_requests WHERE course_id IN (<old_id>, <new_id>) ORDER BY id;
SELECT id, user_id, favorite_course_id
FROM public.user_profiles
WHERE favorite_course_id IN (<old_id>, <new_id>)
ORDER BY id;
```

The course must exist only at `<new_id>`. Every child row that used `<old_id>` must now use `<new_id>`. For an API-backed course, `course_external_ids` must contain the current provider ID and must not gain an alias derived from `<old_id>`. For a manual course, the external-ID query must return no rows. The migration-map row must preserve `<old_id>` and match the chosen workflow, including nullable provider fields for a manual course.

Then check the application:

- The course page loads under the new GolfIQ ID.
- Tee and hole data load.
- Existing rounds load.
- Editing an existing round resolves the correct course and tee.
- GPS mapping loads.
- Live-round setup loads.
- Favourite-course references still resolve.

Migrate only the next course after every SQL and application check passes. Stop and investigate any missing row, unexpected count, external-ID conflict, or application mismatch. Do not retry blindly and do not repair child IDs by hand.

## Final verification

Run these checks only after the migration window has remained closed to new course creation. Each anomaly query must return zero rows.

```sql
-- No course is missing its independent migration audit row.
SELECT c.id, c.club_name, c.course_name
FROM public.courses AS c
LEFT JOIN public.course_id_migration_map AS migration
  ON migration.new_course_id = c.id
WHERE migration.new_course_id IS NULL;

-- No legacy-range course remains unmigrated.
SELECT c.id, c.club_name, c.course_name
FROM public.courses AS c
WHERE c.id >= 4678
  AND NOT EXISTS (
    SELECT 1
    FROM public.course_id_migration_map AS migration
    WHERE migration.new_course_id = c.id
  );

-- No external ID points to a missing course.
SELECT mapping.*
FROM public.course_external_ids AS mapping
LEFT JOIN public.courses AS c ON c.id = mapping.course_id
WHERE c.id IS NULL;

-- No provider/external-ID pair is duplicated.
SELECT provider, external_id, count(*) AS duplicate_count
FROM public.course_external_ids
GROUP BY provider, external_id
HAVING count(*) > 1;
```

Finally, confirm the sequence's next candidate is above the highest completed internal course ID without calling `nextval` or changing sequence state:

```sql
SELECT
  sequence_state.last_value,
  sequence_state.is_called,
  CASE
    WHEN sequence_state.is_called THEN sequence_state.last_value + 1
    ELSE sequence_state.last_value
  END AS next_candidate,
  max(c.id) AS highest_course_id,
  CASE
    WHEN sequence_state.is_called THEN sequence_state.last_value + 1 > max(c.id)
    ELSE sequence_state.last_value > max(c.id)
  END AS next_candidate_is_safe
FROM public.courses_id_seq AS sequence_state
CROSS JOIN public.courses AS c
GROUP BY sequence_state.last_value, sequence_state.is_called;
```

`next_candidate_is_safe` must be true. Stop and investigate if it is false; do not use an unguarded sequence-changing procedure.

## Deferred follow-up: tee identity

This migration intentionally separates course identities only. Provider tee IDs are still converted to `BigInt` and used as GolfIQ `Tee.id` values during course import. Treat separating internal tee IDs from provider tee IDs as a later, independently reviewed migration; do not expand the course identity rollout to include tees.
