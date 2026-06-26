import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export function isGpsMappingSchemaMissingError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2021' && error.code !== 'P2022') return false;

  const message = error.message.toLowerCase();
  return message.includes('mapped_courses') || message.includes('mapped_holes');
}

export async function isGpsMappingSchemaAvailable() {
  try {
    const result = await prisma.$queryRaw<Array<{ mapped_courses: string | null; mapped_holes: string | null }>>`
      SELECT
        to_regclass('public.mapped_courses')::text AS mapped_courses,
        to_regclass('public.mapped_holes')::text AS mapped_holes
    `;

    return Boolean(result[0]?.mapped_courses && result[0]?.mapped_holes);
  } catch {
    return false;
  }
}
