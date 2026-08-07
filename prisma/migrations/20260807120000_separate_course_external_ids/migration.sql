CREATE TABLE "course_external_ids" (
  "id" BIGSERIAL NOT NULL,
  "course_id" BIGINT NOT NULL,
  "provider" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "course_external_ids_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_id_migration_map" (
  "old_course_id" BIGINT NOT NULL,
  "new_course_id" BIGINT NOT NULL,
  "provider" TEXT,
  "current_external_id" TEXT,
  "migrated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "course_id_migration_map_pkey" PRIMARY KEY ("old_course_id")
);

CREATE UNIQUE INDEX "uq_course_external_ids_provider_external_id"
  ON "course_external_ids"("provider", "external_id");
CREATE INDEX "idx_course_external_ids_course_provider"
  ON "course_external_ids"("course_id", "provider");
CREATE UNIQUE INDEX "course_id_migration_map_new_course_id_key"
  ON "course_id_migration_map"("new_course_id");

ALTER TABLE "course_external_ids"
  ADD CONSTRAINT "course_external_ids_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.migrate_course_identity(
  p_old_course_id bigint,
  p_current_external_id text,
  p_provider text DEFAULT 'golfcourseapi'
)
RETURNS TABLE (
  old_course_id bigint,
  new_course_id bigint,
  provider text,
  current_external_id text,
  direct_references_before bigint,
  direct_references_after bigint
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_provider text := btrim(p_provider);
  v_current_external_id text := btrim(p_current_external_id);
  v_has_external_identity boolean := p_current_external_id IS NOT NULL;
  v_sequence_name text;
  v_locked_course_id bigint;
  v_new_course_id bigint;
  v_reference_count bigint;
  v_references_before bigint := 0;
  v_references_after bigint := 0;
  v_old_references_after bigint := 0;
  v_fk_count integer := 0;
  v_external_id_count integer;
  v_conflicting_external_id text;
  v_fk record;
BEGIN
  IF p_old_course_id IS NULL OR p_old_course_id <= 0 THEN
    RAISE EXCEPTION 'Old course ID must be a positive bigint.';
  END IF;

  IF v_has_external_identity THEN
    IF v_current_external_id = '' THEN
      RAISE EXCEPTION 'Current external course ID must not be empty.';
    END IF;

    IF p_provider IS NULL OR v_provider = '' THEN
      RAISE EXCEPTION 'Provider must not be null or empty when an external course ID is supplied.';
    END IF;
  ELSE
    -- A NULL external ID explicitly identifies a genuinely manual course.
    v_provider := NULL;
  END IF;

  -- Serialize identity migrations and prevent course writes or FK DDL while the
  -- catalog-driven checks and primary-key update are in progress.
  PERFORM pg_advisory_xact_lock(hashtextextended('public.migrate_course_identity', 0));
  LOCK TABLE public.courses IN SHARE ROW EXCLUSIVE MODE;

  SELECT c.id
  INTO v_locked_course_id
  FROM public.courses AS c
  WHERE c.id = p_old_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course ID % does not exist.', p_old_course_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.course_id_migration_map AS migration
    WHERE migration.old_course_id = p_old_course_id
      OR migration.new_course_id = p_old_course_id
  ) THEN
    RAISE EXCEPTION 'Course ID % has already been migrated.', p_old_course_id;
  END IF;

  FOR v_fk IN
    SELECT
      constraint_row.conname AS constraint_name,
      child_namespace.nspname AS child_schema,
      child_table.relname AS child_table,
      child_attribute.attname AS child_column,
      constraint_row.confupdtype AS update_action,
      cardinality(constraint_row.conkey) AS key_column_count
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS parent_table
      ON parent_table.oid = constraint_row.confrelid
    JOIN pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    JOIN pg_class AS child_table
      ON child_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS child_key(attnum, position)
      ON TRUE
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
    ORDER BY child_namespace.nspname, child_table.relname, constraint_row.conname
  LOOP
    v_fk_count := v_fk_count + 1;

    IF v_fk.update_action <> 'c' THEN
      RAISE EXCEPTION
        'Foreign key %.% (%) does not use ON UPDATE CASCADE.',
        v_fk.child_schema,
        v_fk.constraint_name,
        v_fk.child_column;
    END IF;

    IF v_fk.key_column_count <> 1 THEN
      RAISE EXCEPTION
        'Foreign key %.% is composite; migrate_course_identity only accepts direct single-column references to courses(id).',
        v_fk.child_schema,
        v_fk.constraint_name;
    END IF;

    EXECUTE format(
      'LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',
      v_fk.child_schema,
      v_fk.child_table
    );
  END LOOP;

  IF v_fk_count = 0 THEN
    RAISE EXCEPTION 'No direct foreign keys referencing public.courses(id) were found.';
  END IF;

  IF v_has_external_identity THEN
    SELECT mapping.external_id
    INTO v_conflicting_external_id
    FROM public.course_external_ids AS mapping
    WHERE mapping.provider = v_provider
      AND mapping.external_id = v_current_external_id
      AND mapping.course_id <> p_old_course_id;

    IF v_conflicting_external_id IS NOT NULL THEN
      RAISE EXCEPTION
        'Provider identifier % for provider % already maps to another GolfIQ course.',
        v_conflicting_external_id,
        v_provider;
    END IF;

    INSERT INTO public.course_external_ids (
      course_id,
      provider,
      external_id,
      created_at,
      last_seen_at
    )
    VALUES (
      p_old_course_id,
      v_provider,
      v_current_external_id,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (provider, external_id) DO UPDATE
    SET last_seen_at = EXCLUDED.last_seen_at
    WHERE public.course_external_ids.course_id = EXCLUDED.course_id;

    SELECT count(*)::integer
    INTO v_external_id_count
    FROM public.course_external_ids AS mapping
    WHERE mapping.provider = v_provider
      AND mapping.external_id = v_current_external_id
      AND mapping.course_id = p_old_course_id;

    IF v_external_id_count <> 1 THEN
      RAISE EXCEPTION
        'Could not safely attach provider identifier % to course ID %; mapping count was %.',
        v_current_external_id,
        p_old_course_id,
        v_external_id_count;
    END IF;
  END IF;

  FOR v_fk IN
    SELECT
      child_namespace.nspname AS child_schema,
      child_table.relname AS child_table,
      child_attribute.attname AS child_column
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS parent_table
      ON parent_table.oid = constraint_row.confrelid
    JOIN pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    JOIN pg_class AS child_table
      ON child_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS child_key(attnum, position)
      ON TRUE
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
    ORDER BY child_namespace.nspname, child_table.relname, constraint_row.conname
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE %I = $1',
      v_fk.child_schema,
      v_fk.child_table,
      v_fk.child_column
    )
    INTO v_reference_count
    USING p_old_course_id;

    v_references_before := v_references_before + v_reference_count;
  END LOOP;

  v_sequence_name := pg_get_serial_sequence('public.courses', 'id');
  IF v_sequence_name IS NULL THEN
    RAISE EXCEPTION 'No PostgreSQL sequence is associated with public.courses.id.';
  END IF;

  LOOP
    v_new_course_id := nextval(v_sequence_name::regclass);
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.courses AS c
      WHERE c.id = v_new_course_id
    );
  END LOOP;

  UPDATE public.courses
  SET
    id = v_new_course_id,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_old_course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course ID % disappeared before its identity update.', p_old_course_id;
  END IF;

  INSERT INTO public.course_id_migration_map (
    old_course_id,
    new_course_id,
    provider,
    current_external_id,
    migrated_at
  )
  VALUES (
    p_old_course_id,
    v_new_course_id,
    v_provider,
    v_current_external_id,
    CURRENT_TIMESTAMP
  );

  FOR v_fk IN
    SELECT
      child_namespace.nspname AS child_schema,
      child_table.relname AS child_table,
      child_attribute.attname AS child_column
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS parent_table
      ON parent_table.oid = constraint_row.confrelid
    JOIN pg_namespace AS parent_namespace
      ON parent_namespace.oid = parent_table.relnamespace
    JOIN pg_class AS child_table
      ON child_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS child_namespace
      ON child_namespace.oid = child_table.relnamespace
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS child_key(attnum, position)
      ON TRUE
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
    ORDER BY child_namespace.nspname, child_table.relname, constraint_row.conname
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE %I = $1',
      v_fk.child_schema,
      v_fk.child_table,
      v_fk.child_column
    )
    INTO v_reference_count
    USING p_old_course_id;
    v_old_references_after := v_old_references_after + v_reference_count;

    EXECUTE format(
      'SELECT count(*) FROM %I.%I WHERE %I = $1',
      v_fk.child_schema,
      v_fk.child_table,
      v_fk.child_column
    )
    INTO v_reference_count
    USING v_new_course_id;
    v_references_after := v_references_after + v_reference_count;
  END LOOP;

  IF v_old_references_after <> 0 THEN
    RAISE EXCEPTION
      'Cascade verification failed: % direct reference(s) still use old course ID %.',
      v_old_references_after,
      p_old_course_id;
  END IF;

  IF v_references_after <> v_references_before THEN
    RAISE EXCEPTION
      'Cascade verification failed: expected % direct reference(s) on new course ID %, found %.',
      v_references_before,
      v_new_course_id,
      v_references_after;
  END IF;

  RETURN QUERY
  SELECT
    p_old_course_id,
    v_new_course_id,
    v_provider,
    v_current_external_id,
    v_references_before,
    v_references_after;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_course_identity_migration()
RETURNS TABLE (
  sequence_name text,
  next_course_id bigint
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_sequence_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('public.migrate_course_identity', 0));
  LOCK TABLE public.courses IN ACCESS EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id BETWEEN 1 AND 4677
  ) THEN
    RAISE EXCEPTION
      'Cannot prepare course identity migration: public.courses contains an ID between 1 and 4677.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.course_id_migration_map
  ) THEN
    RAISE EXCEPTION
      'Cannot prepare course identity migration: public.course_id_migration_map is not empty.';
  END IF;

  v_sequence_name := pg_get_serial_sequence('public.courses', 'id');
  IF v_sequence_name IS NULL THEN
    RAISE EXCEPTION
      'Cannot prepare course identity migration: public.courses.id has no associated sequence.';
  END IF;

  PERFORM setval(v_sequence_name::regclass, 1, false);

  RETURN QUERY
  SELECT v_sequence_name, 1::bigint;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.migrate_course_identity(bigint, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prepare_course_identity_migration() FROM PUBLIC;

DO $permissions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.migrate_course_identity(bigint, text, text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.prepare_course_identity_migration() FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.migrate_course_identity(bigint, text, text) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.prepare_course_identity_migration() FROM authenticated;
  END IF;
END;
$permissions$;

GRANT EXECUTE ON FUNCTION public.migrate_course_identity(bigint, text, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.prepare_course_identity_migration() TO postgres;
