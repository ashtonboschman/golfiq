import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const { Pool } = pg

// ==========================
// SSL Cert Setup (Vercel & Local)
// ==========================
if (process.env.DB_CA_CERT) {
  // Write the cert to a temp file at runtime
  const certPath = path.resolve('./vercel-db-ca.crt')
  fs.writeFileSync(certPath, process.env.DB_CA_CERT, { encoding: 'utf8' })
  process.env.NODE_EXTRA_CA_CERTS = certPath
}

// ==========================
// Prisma Singleton Setup
// ==========================
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

// Create a connection pool using the DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl is automatically handled by NODE_EXTRA_CA_CERTS
})

// Create Prisma adapter
const adapter = new PrismaPg(pool)

// Initialize Prisma
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['query', 'error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma