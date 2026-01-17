// lib/db.ts
import fs from 'fs';
import path from 'path';
import './setup-ssl';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

// ==========================
// SSL Cert Setup (Vercel & Local)
// ==========================
if (process.env.DB_CA_CERT) {
  const certPath = path.resolve('./vercel-db-ca.crt');
  fs.writeFileSync(certPath, process.env.DB_CA_CERT, { encoding: 'utf8' });
  process.env.NODE_EXTRA_CA_CERTS = certPath;
  console.log('[DB] Using custom CA certificate for SSL');
}

// ==========================
// Prisma Singleton Setup
// ==========================
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// Connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl is handled automatically via NODE_EXTRA_CA_CERTS
});

// Prisma adapter
const adapter = new PrismaPg(pool);

// Initialize Prisma singleton
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['query', 'error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;