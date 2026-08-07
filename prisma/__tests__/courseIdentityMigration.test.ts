import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const schema = fs.readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260807120000_separate_course_external_ids',
    'migration.sql',
  ),
  'utf8',
);
const migrateFunction = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.migrate_course_identity('),
  migration.indexOf('CREATE OR REPLACE FUNCTION public.prepare_course_identity_migration()'),
);
const migrationMapTable = migration.slice(
  migration.indexOf('CREATE TABLE "course_id_migration_map"'),
  migration.indexOf('CREATE UNIQUE INDEX "uq_course_external_ids_provider_external_id"'),
);
const followupMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260807120500_fix_course_identity_variable_conflict',
    'migration.sql',
  ),
  'utf8',
);

function normalizeSql(sql: string): string {
  return sql.replace(/\r\n/g, '\n');
}

function extractMigrateFunction(sql: string): string {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.migrate_course_identity(');
  const endMarker = '$function$;';
  const end = sql.indexOf(endMarker, start);

  if (start < 0 || end < 0) throw new Error('migrate_course_identity function definition not found');
  return sql.slice(start, end + endMarker.length);
}

const originalMigrateFunction = extractMigrateFunction(migration);
const followupMigrateFunction = extractMigrateFunction(followupMigration);
const followupOutsideFunction = followupMigration.replace(followupMigrateFunction, '');

describe('course identity database infrastructure', () => {
  it('models opaque provider IDs with provider-scoped uniqueness and allows aliases', () => {
    expect(schema).toContain('model CourseExternalId');
    expect(schema).toContain('externalId String   @map("external_id")');
    expect(schema).toContain(
      '@@unique([provider, externalId], name: "providerExternalId", map: "uq_course_external_ids_provider_external_id")',
    );
    expect(schema).toContain(
      '@@index([courseId, provider], map: "idx_course_external_ids_course_provider")',
    );
    expect(schema).not.toContain('@@unique([courseId, provider]');
  });

  it('allows migration audit rows to omit provider identity for manual courses', () => {
    expect(schema).toMatch(/model CourseIdMigrationMap[\s\S]*provider\s+String\?/);
    expect(schema).toMatch(/model CourseIdMigrationMap[\s\S]*currentExternalId\s+String\?/);
    expect(migrationMapTable).toMatch(/"provider" TEXT,\s+"current_external_id" TEXT,/);
    expect(migrationMapTable).not.toMatch(/"provider" TEXT NOT NULL/);
    expect(migrationMapTable).not.toMatch(/"current_external_id" TEXT NOT NULL/);
    expect(migration).toMatch(/CREATE TABLE "course_external_ids"[\s\S]*"provider" TEXT NOT NULL/);
    expect(migration).toMatch(/CREATE TABLE "course_external_ids"[\s\S]*"external_id" TEXT NOT NULL/);
  });

  it('represents every direct Course relation as update-cascade without changing favourite deletion', () => {
    const directCourseRelations = schema
      .split('\n')
      .filter((line) => /\bCourse\??\s+@relation\(fields: \[(?:favoriteCourseId|courseId)\], references: \[id\]/.test(line));

    expect(directCourseRelations).toHaveLength(8);
    for (const relation of directCourseRelations) {
      expect(relation).toContain('onUpdate: Cascade');
    }
    expect(schema).toMatch(/favoriteCourse\s+Course\?.*onDelete: SetNull, onUpdate: Cascade/);
  });

  it('creates explicit guarded sequence preparation without changing sequence state during deploy', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.prepare_course_identity_migration()');
    expect(migration).toContain("pg_get_serial_sequence('public.courses', 'id')");
    expect(migration).toContain('WHERE id BETWEEN 1 AND 4677');
    expect(migration).toContain('FROM public.course_id_migration_map');
    expect(migration).toContain('setval(v_sequence_name::regclass, 1, false)');
    expect(migration).not.toContain('$sequence_setup$');
    expect(migration).not.toContain('8873');
    expect(migration).not.toContain('93kzhy6b');
    expect(migration).not.toMatch(/SELECT\s+\*\s+FROM\s+public\.migrate_course_identity\s*\(/i);
    expect(migration).not.toMatch(/SELECT\s+(?:\*\s+FROM\s+)?public\.prepare_course_identity_migration\s*\(/i);
  });

  it('uses catalog-discovered update cascades and verifies references before and after', () => {
    expect(migration).toContain('FROM pg_constraint AS constraint_row');
    expect(migration).toContain("constraint_row.confupdtype AS update_action");
    expect(migration).toContain("IF v_fk.update_action <> 'c'");
    expect(migration).toContain('v_old_references_after <> 0');
    expect(migration).toContain('v_references_after <> v_references_before');
  });

  it('treats NULL external ID as an intentional manual migration', () => {
    expect(migrateFunction).toContain(
      'v_has_external_identity boolean := p_current_external_id IS NOT NULL;',
    );
    expect(migrateFunction).toMatch(
      /ELSE\s+-- A NULL external ID explicitly identifies a genuinely manual course\.\s+v_provider := NULL;\s+END IF;/,
    );
    expect(migrateFunction).toMatch(
      /INSERT INTO public\.course_id_migration_map[\s\S]*VALUES \(\s+p_old_course_id,\s+v_new_course_id,\s+v_provider,\s+v_current_external_id,/,
    );
    expect(migrateFunction).toMatch(
      /RETURN QUERY\s+SELECT\s+p_old_course_id,\s+v_new_course_id,\s+v_provider,\s+v_current_external_id,/,
    );
  });

  it('keeps all external mapping work inside the non-null identity branch', () => {
    expect(migrateFunction).toMatch(
      /IF v_has_external_identity THEN\s+SELECT mapping\.external_id[\s\S]*INSERT INTO public\.course_external_ids[\s\S]*IF v_external_id_count <> 1 THEN[\s\S]*END IF;\s+END IF;/,
    );
    expect(migrateFunction.match(/INSERT INTO public\.course_external_ids/g)).toHaveLength(1);
  });

  it('continues from the optional identity branch through normal cascade verification', () => {
    const externalMappingInsert = migrateFunction.indexOf('INSERT INTO public.course_external_ids');
    const sequenceAllocation = migrateFunction.indexOf("pg_get_serial_sequence('public.courses', 'id')");

    expect(externalMappingInsert).toBeGreaterThan(0);
    expect(sequenceAllocation).toBeGreaterThan(externalMappingInsert);
    expect(migrateFunction).toContain('FROM pg_constraint AS constraint_row');
    expect(migrateFunction).toContain('v_old_references_after <> 0');
    expect(migrateFunction).toContain('v_references_after <> v_references_before');
  });

  it('rejects empty external IDs and invalid providers only when provider identity is requested', () => {
    expect(migrateFunction).toContain('v_current_external_id text := btrim(p_current_external_id);');
    expect(migrateFunction).toContain("IF v_current_external_id = '' THEN");
    expect(migrateFunction).toContain('Current external course ID must not be empty.');
    expect(migrateFunction).toContain("IF p_provider IS NULL OR v_provider = '' THEN");
    expect(migrateFunction).toContain(
      'Provider must not be null or empty when an external course ID is supplied.',
    );
  });

  it('stores only the current provider ID and protects both functions from client roles', () => {
    expect(migration).toContain('v_current_external_id,');
    expect(migration).not.toContain('v_legacy_external_id');
    expect(migration).not.toContain('p_old_course_id::text');
    expect(migration).toContain('ON CONFLICT (provider, external_id) DO UPDATE');
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.migrate_course_identity(bigint, text, text) FROM PUBLIC',
    );
    expect(migration).toContain('rolname = \'anon\'');
    expect(migration).toContain('rolname = \'authenticated\'');
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.migrate_course_identity(bigint, text, text) TO postgres',
    );
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.prepare_course_identity_migration() FROM PUBLIC',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.prepare_course_identity_migration() TO postgres',
    );
    expect(migration).not.toContain('SECURITY DEFINER');
  });
});

describe('course identity variable-conflict follow-up migration', () => {
  it('leaves the already-applied migration unchanged', () => {
    const normalizedHash = createHash('sha256').update(normalizeSql(migration)).digest('hex');

    expect(normalizedHash).toBe('330b18345971ad3468ce43569abedc0cdb104a9fa2cbf9cd58547e5543cd0e8f');
    expect(migration).not.toContain('#variable_conflict use_column');
  });

  it('replaces only migrate_course_identity and adds the compiler directive', () => {
    expect(followupMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.migrate_course_identity(',
    );
    expect(followupMigrateFunction).toContain(
      'LANGUAGE plpgsql\nAS $function$\n#variable_conflict use_column\nDECLARE',
    );
    expect(followupMigration).not.toContain(
      'CREATE OR REPLACE FUNCTION public.prepare_course_identity_migration()',
    );

    const expectedFunction = normalizeSql(originalMigrateFunction).replace(
      'LANGUAGE plpgsql\nAS $function$\nDECLARE',
      'LANGUAGE plpgsql\nAS $function$\n#variable_conflict use_column\nDECLARE',
    );
    expect(normalizeSql(followupMigrateFunction)).toBe(expectedFunction);
  });

  it('preserves the deployed signature and default provider', () => {
    expect(followupMigrateFunction).toMatch(
      /public\.migrate_course_identity\(\s*p_old_course_id bigint,\s*p_current_external_id text,\s*p_provider text DEFAULT 'golfcourseapi'\s*\)/,
    );
    expect(followupMigrateFunction).toMatch(
      /RETURNS TABLE \(\s*old_course_id bigint,\s*new_course_id bigint,\s*provider text,\s*current_external_id text,\s*direct_references_before bigint,\s*direct_references_after bigint\s*\)/,
    );
  });

  it('does not execute preparation, identity migration, sequence reset, or data writes', () => {
    expect(followupMigration).not.toMatch(
      /(?:SELECT|PERFORM)\s+(?:\*\s+FROM\s+)?public\.prepare_course_identity_migration\s*\(/i,
    );
    expect(followupOutsideFunction).not.toMatch(
      /(?:SELECT|PERFORM)\s+(?:\*\s+FROM\s+)?public\.migrate_course_identity\s*\(/i,
    );
    expect(followupMigration).not.toMatch(/\bsetval\s*\(/i);
    expect(followupOutsideFunction).not.toMatch(/\bUPDATE\s+(?:public\.)?courses\b/i);
    expect(followupOutsideFunction).not.toMatch(
      /\bINSERT\s+INTO\s+(?:public\.)?(?:course_external_ids|course_id_migration_map)\b/i,
    );
  });

  it('reapplies the existing execution restrictions', () => {
    expect(followupOutsideFunction).toContain(
      'REVOKE EXECUTE ON FUNCTION public.migrate_course_identity(bigint, text, text) FROM PUBLIC;',
    );
    expect(followupOutsideFunction).toContain("rolname = 'anon'");
    expect(followupOutsideFunction).toContain("rolname = 'authenticated'");
    expect(followupOutsideFunction).toContain(
      'GRANT EXECUTE ON FUNCTION public.migrate_course_identity(bigint, text, text) TO postgres;',
    );
    expect(followupOutsideFunction).not.toContain('prepare_course_identity_migration');
  });
});
