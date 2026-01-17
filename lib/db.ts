import './setup-ssl'; // MUST run first, before Prisma
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

// Prisma singleton
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// Connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SSL handled automatically via NODE_EXTRA_CA_CERTS
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