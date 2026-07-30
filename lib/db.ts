import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

function resolveDatabaseSsl(): pg.PoolConfig['ssl'] {
  if (process.env.DB_CA_CERT) {
    return {
      ca: Buffer.from(process.env.DB_CA_CERT, 'base64').toString('utf8'),
      rejectUnauthorized: true,
    };
  }

  if (process.env.DB_CA_CERT_PATH) {
    return {
      ca: fs.readFileSync(
        path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DB_CA_CERT_PATH),
        'utf8',
      ),
      rejectUnauthorized: true,
    };
  }

  return undefined;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

function resolvePoolMax(): number | undefined {
  const explicit = Number(process.env.PG_POOL_MAX ?? process.env.DATABASE_POOL_MAX);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return undefined;

  try {
    const parsed = new URL(rawUrl);
    const parsePositiveInt = (value: string | null): number | undefined => {
      const parsedValue = Number(value);
      if (Number.isFinite(parsedValue) && parsedValue > 0) return Math.floor(parsedValue);
      return undefined;
    };

    // Support both `pool_size` (common in session poolers) and `connection_limit`.
    const poolSize = parsePositiveInt(parsed.searchParams.get('pool_size'));
    if (poolSize) return poolSize;

    const connectionLimit = parsePositiveInt(parsed.searchParams.get('connection_limit'));
    if (connectionLimit) return connectionLimit;

    // Supabase shared pooler (especially in session mode) is sensitive to
    // excess per-process pools. Default to a conservative single connection
    // unless an explicit override is provided.
    if (parsed.hostname.endsWith('.pooler.supabase.com')) return 1;
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveConnectionString(databaseSsl: pg.PoolConfig['ssl']): string | undefined {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl || !databaseSsl) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    // node-postgres replaces an explicit `ssl` object when these URL options
    // are present. The application-provided CA must remain authoritative.
    for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
      parsed.searchParams.delete(parameter);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const poolMax = resolvePoolMax();
const databaseSsl = resolveDatabaseSsl();
const connectionString = resolveConnectionString(databaseSsl);

// Reuse the pool across hot reloads
const pool = globalForPrisma.pool ?? new Pool({
  connectionString,
  ...(poolMax ? { max: poolMax } : {}),
  ...(databaseSsl ? { ssl: databaseSsl } : {}),
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.pool = pool;

const adapter = new PrismaPg(pool);
const prismaClient = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaClient;

export const prisma = prismaClient;
