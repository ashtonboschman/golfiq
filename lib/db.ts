// lib/db.ts
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

if (process.env.DB_CA_CERT) {
  const certData = Buffer.from(process.env.DB_CA_CERT, 'base64').toString('utf8');
  const certPath = process.env.VERCEL ? path.join('/tmp', 'vercel-db-ca.crt') : path.join(process.cwd(), 'tmp', 'vercel-db-ca.crt');

  if (!process.env.VERCEL) fs.mkdirSync(path.dirname(certPath), { recursive: true });

  fs.writeFileSync(certPath, certData, { encoding: 'utf8' });
  process.env.NODE_EXTRA_CA_CERTS = certPath;

}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;