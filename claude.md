# Prisma & Database Naming Conventions (MANDATORY)

This document defines **strict rules** for how Prisma models and fields must be written.  
These rules apply to **ALL work involving Prisma**, including:

- `schema.prisma`
- Prisma migrations
- Model edits
- New tables or fields
- Relations
- Enums
- Code generation or refactors

If these rules are violated, the change is considered **incorrect**.

---

## Core Principle

- **Prisma = application layer → camelCase**
- **Postgres / Supabase = database layer → snake_case**
- Prisma must always map explicitly to the database using `@map` and `@@map`

There are **NO exceptions**.

---

## REQUIRED FORMAT (REFERENCE EXAMPLE)

Every Prisma model **must** follow this exact pattern:

```prisma
model User {
  id                BigInt   @id @default(autoincrement())
  passwordHash      String   @map("password_hash")
  emailVerified     Boolean  @map("email_verified")
  createdDate       DateTime @map("created_date")

  @@map("users")
}