import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const { Pool } = pg

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Create Prisma adapter
const adapter = new PrismaPg(pool)

export const prisma = new PrismaClient({
    adapter,
    log: ['query', 'error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
