import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  MAX_CARRY_YARDS,
  MIN_CARRY_YARDS,
  MY_BAG_MAX_CLUBS,
  sortUserClubsByCarry,
} from '@/lib/clubs/catalogue';

type DbClient = typeof prisma | Prisma.TransactionClient;

type ClubDefinitionRow = {
  id: bigint;
  key: string;
  name: string;
  shortLabel: string;
  category: string;
  catalogueOrder: number;
  isActive: boolean;
};

type UserClubRow = {
  id: bigint;
  carryYards: number;
  clubDefinition: ClubDefinitionRow;
};

export type ClubDefinitionDto = {
  id: string;
  key: string;
  name: string;
  shortLabel: string;
  category: string;
  catalogueOrder: number;
  isActive: boolean;
};

export type UserClubDto = {
  id: string;
  clubDefinitionId: string;
  carryYards: number;
  clubDefinition: ClubDefinitionDto;
};

export class MyBagServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'MyBagServiceError';
    this.status = status;
    this.code = code;
  }
}

function myBagError(message: string, status: number, code: string) {
  return new MyBagServiceError(message, status, code);
}

function serializeClubDefinition(definition: ClubDefinitionRow): ClubDefinitionDto {
  return {
    id: definition.id.toString(),
    key: definition.key,
    name: definition.name,
    shortLabel: definition.shortLabel,
    category: definition.category,
    catalogueOrder: definition.catalogueOrder,
    isActive: definition.isActive,
  };
}

function serializeUserClub(club: UserClubRow): UserClubDto {
  return {
    id: club.id.toString(),
    clubDefinitionId: club.clubDefinition.id.toString(),
    carryYards: club.carryYards,
    clubDefinition: serializeClubDefinition(club.clubDefinition),
  };
}

export function parsePositiveBigIntId(value: unknown, message = 'Invalid id') {
  try {
    const parsed = BigInt(String(value));
    if (parsed <= BigInt(0)) throw new Error('not positive');
    return parsed;
  } catch {
    throw myBagError(message, 400, 'invalid_id');
  }
}

export function parseCarryYards(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw myBagError('Carry distance must be a whole number of yards.', 400, 'invalid_carry');
  }
  if (value < MIN_CARRY_YARDS || value > MAX_CARRY_YARDS) {
    throw myBagError(`Carry distance must be between ${MIN_CARRY_YARDS} and ${MAX_CARRY_YARDS} yards.`, 400, 'invalid_carry');
  }
  return value;
}

async function listUserClubRows(userId: bigint, db: DbClient = prisma) {
  const rows = await db.userClub.findMany({
    where: { userId },
    include: {
      clubDefinition: true,
    },
  }) as UserClubRow[];

  return sortUserClubsByCarry(rows);
}

async function listCatalogueRows(userId: bigint) {
  return prisma.clubDefinition.findMany({
    where: {
      OR: [
        { isActive: true },
        {
          userClubs: {
            some: { userId },
          },
        },
      ],
    },
    orderBy: { catalogueOrder: 'asc' },
  }) as Promise<ClubDefinitionRow[]>;
}

export async function getMyBag(userId: bigint, options: { includeCatalogue?: boolean } = {}) {
  const includeCatalogue = options.includeCatalogue !== false;
  const [clubs, catalogue] = await Promise.all([
    listUserClubRows(userId),
    includeCatalogue ? listCatalogueRows(userId) : Promise.resolve([]),
  ]);

  return {
    clubs: clubs.map(serializeUserClub),
    catalogue: catalogue.map(serializeClubDefinition),
    clubCount: clubs.length,
    maxClubs: MY_BAG_MAX_CLUBS,
  };
}

const MY_BAG_ADVISORY_LOCK_NAMESPACE = 180713;
const POSTGRES_INT_MAX = BigInt(2147483647);

function advisoryLockIdForUser(userId: bigint) {
  return Number(userId % POSTGRES_INT_MAX);
}

async function lockUserBag(tx: Prisma.TransactionClient, userId: bigint) {
  await tx.$queryRaw<{ locked: number }[]>`
    SELECT 1::int AS locked
    FROM pg_advisory_xact_lock(${MY_BAG_ADVISORY_LOCK_NAMESPACE}, ${advisoryLockIdForUser(userId)})
  `;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function addUserClub(userId: bigint, input: unknown) {
  if (!input || typeof input !== 'object') {
    throw myBagError('Invalid request body.', 400, 'invalid_body');
  }

  const body = input as Record<string, unknown>;
  const clubDefinitionId = parsePositiveBigIntId(body.clubDefinitionId, 'Invalid club definition.');
  const carryYards = parseCarryYards(body.carryYards);

  try {
    const created = await prisma.$transaction(async (tx) => {
      await lockUserBag(tx, userId);

      const definition = await tx.clubDefinition.findUnique({
        where: { id: clubDefinitionId },
        select: { id: true, isActive: true },
      });
      if (!definition) {
        throw myBagError('Club definition not found.', 404, 'definition_not_found');
      }
      if (!definition.isActive) {
        throw myBagError('This club is not available to add.', 409, 'inactive_definition');
      }

      const existing = await tx.userClub.findUnique({
        where: {
          userId_clubDefinitionId: {
            userId,
            clubDefinitionId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw myBagError('This club is already in My Bag.', 409, 'duplicate_club');
      }

      const currentCount = await tx.userClub.count({ where: { userId } });
      if (currentCount >= MY_BAG_MAX_CLUBS) {
        throw myBagError(`My Bag can include up to ${MY_BAG_MAX_CLUBS} clubs.`, 409, 'bag_limit');
      }

      return tx.userClub.create({
        data: {
          userId,
          clubDefinitionId,
          carryYards,
        },
        include: {
          clubDefinition: true,
        },
      }) as Promise<UserClubRow>;
    });

    return {
      club: serializeUserClub(created),
      clubCount: await prisma.userClub.count({ where: { userId } }),
      maxClubs: MY_BAG_MAX_CLUBS,
    };
  } catch (error) {
    if (error instanceof MyBagServiceError) throw error;
    if (isUniqueConstraintError(error)) {
      throw myBagError('This club is already in My Bag.', 409, 'duplicate_club');
    }
    throw error;
  }
}

export async function updateUserClub(userId: bigint, userClubIdParam: string, input: unknown) {
  if (!input || typeof input !== 'object') {
    throw myBagError('Invalid request body.', 400, 'invalid_body');
  }

  const userClubId = parsePositiveBigIntId(userClubIdParam, 'Invalid user club.');
  const carryYards = parseCarryYards((input as Record<string, unknown>).carryYards);

  const result = await prisma.userClub.updateMany({
    where: {
      id: userClubId,
      userId,
    },
    data: {
      carryYards,
    },
  });

  if (result.count === 0) {
    throw myBagError('Club not found.', 404, 'club_not_found');
  }

  const club = await prisma.userClub.findFirst({
    where: {
      id: userClubId,
      userId,
    },
    include: {
      clubDefinition: true,
    },
  }) as UserClubRow | null;

  if (!club) {
    throw myBagError('Club not found.', 404, 'club_not_found');
  }

  return {
    club: serializeUserClub(club),
    clubCount: await prisma.userClub.count({ where: { userId } }),
    maxClubs: MY_BAG_MAX_CLUBS,
  };
}

export async function removeUserClub(userId: bigint, userClubIdParam: string) {
  const userClubId = parsePositiveBigIntId(userClubIdParam, 'Invalid user club.');
  const result = await prisma.userClub.deleteMany({
    where: {
      id: userClubId,
      userId,
    },
  });

  if (result.count === 0) {
    throw myBagError('Club not found.', 404, 'club_not_found');
  }

  return {
    message: 'Club removed from My Bag.',
    clubCount: await prisma.userClub.count({ where: { userId } }),
    maxClubs: MY_BAG_MAX_CLUBS,
  };
}
