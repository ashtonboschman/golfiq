import { GET } from '@/app/api/my-bag/route';
import { POST } from '@/app/api/my-bag/clubs/route';
import {
  DELETE,
  PATCH,
} from '@/app/api/my-bag/clubs/[userClubId]/route';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

jest.mock('@/lib/api-auth', () => {
  const actual = jest.requireActual('@/lib/api-auth');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('@/lib/db', () => ({
  prisma: {
    clubDefinition: {
      findMany: jest.fn(),
    },
    userClub: {
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

type MockPrisma = {
  clubDefinition: {
    findMany: jest.Mock;
  };
  userClub: {
    count: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

const mockedRequireAuth = requireAuth as jest.Mock;
const mockedPrisma = prisma as unknown as MockPrisma;

const tx = {
  clubDefinition: {
    findUnique: jest.fn(),
  },
  userClub: {
    count: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const driverDefinition = {
  id: BigInt(10),
  key: 'DRIVER',
  name: 'Driver',
  shortLabel: 'DR',
  category: 'WOOD',
  catalogueOrder: 10,
  isActive: true,
};

const sevenIronDefinition = {
  id: BigInt(20),
  key: 'IRON_7',
  name: '7 Iron',
  shortLabel: '7I',
  category: 'IRON',
  catalogueOrder: 280,
  isActive: true,
};

const driverClub = {
  id: BigInt(100),
  userId: BigInt(1),
  clubDefinitionId: driverDefinition.id,
  carryYards: 250,
  clubDefinition: driverDefinition,
};

const sevenIronClub = {
  id: BigInt(101),
  userId: BigInt(1),
  clubDefinitionId: sevenIronDefinition.id,
  carryYards: 160,
  clubDefinition: sevenIronDefinition,
};

function jsonRequest(url: string, body?: unknown) {
  return new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/my-bag route contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue(BigInt(1));
    mockedPrisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    mockedPrisma.userClub.findMany.mockResolvedValue([driverClub, sevenIronClub]);
    mockedPrisma.clubDefinition.findMany.mockResolvedValue([driverDefinition, sevenIronDefinition]);
    mockedPrisma.userClub.count.mockResolvedValue(1);
    mockedPrisma.userClub.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.userClub.deleteMany.mockResolvedValue({ count: 1 });
    mockedPrisma.userClub.findFirst.mockResolvedValue(sevenIronClub);
    tx.$queryRaw.mockResolvedValue([]);
    tx.clubDefinition.findUnique.mockResolvedValue({ id: driverDefinition.id, isActive: true });
    tx.userClub.findUnique.mockResolvedValue(null);
    tx.userClub.count.mockResolvedValue(0);
    tx.userClub.create.mockResolvedValue(driverClub);
  });

  it('returns sorted user clubs and the catalogue for the owner', async () => {
    const response = await GET(new Request('http://localhost/api/my-bag') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clubs.map((club: { clubDefinition: { shortLabel: string } }) => club.clubDefinition.shortLabel)).toEqual([
      'DR',
      '7I',
    ]);
    expect(body.catalogue).toHaveLength(2);
    expect(body.clubCount).toBe(2);
    expect(body.maxClubs).toBe(13);
  });

  it('omits the catalogue in live GPS clubs mode', async () => {
    const response = await GET(new Request('http://localhost/api/my-bag?mode=clubs') as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.catalogue).toEqual([]);
    expect(mockedPrisma.clubDefinition.findMany).not.toHaveBeenCalled();
  });

  it('adds a club inside a per-user transaction lock', async () => {
    const response = await POST(jsonRequest('http://localhost/api/my-bag/clubs', {
      clubDefinitionId: '10',
      carryYards: 250,
    }) as any);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.club.clubDefinition.shortLabel).toBe('DR');
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(Array.from(tx.$queryRaw.mock.calls[0][0]).join('')).toContain('SELECT 1::int AS locked');
    expect(tx.userClub.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        userId: BigInt(1),
        clubDefinitionId: BigInt(10),
        carryYards: 250,
      },
    }));
  });

  it('rejects duplicate clubs and the 13-club limit before create', async () => {
    tx.userClub.findUnique.mockResolvedValueOnce({ id: BigInt(100) });

    const duplicate = await POST(jsonRequest('http://localhost/api/my-bag/clubs', {
      clubDefinitionId: '10',
      carryYards: 250,
    }) as any);
    expect(duplicate.status).toBe(409);

    tx.userClub.findUnique.mockResolvedValueOnce(null);
    tx.userClub.count.mockResolvedValueOnce(13);
    const limit = await POST(jsonRequest('http://localhost/api/my-bag/clubs', {
      clubDefinitionId: '10',
      carryYards: 250,
    }) as any);
    expect(limit.status).toBe(409);
    expect(tx.userClub.create).not.toHaveBeenCalled();
  });

  it('validates carry yards on create and update', async () => {
    const createResponse = await POST(jsonRequest('http://localhost/api/my-bag/clubs', {
      clubDefinitionId: '10',
      carryYards: 400,
    }) as any);
    expect(createResponse.status).toBe(400);

    const updateResponse = await PATCH(
      jsonRequest('http://localhost/api/my-bag/clubs/100', { carryYards: 160.5 }) as any,
      { params: Promise.resolve({ userClubId: '100' }) },
    );
    expect(updateResponse.status).toBe(400);
  });

  it('updates and deletes only clubs owned by the authenticated user', async () => {
    await PATCH(
      jsonRequest('http://localhost/api/my-bag/clubs/101', { carryYards: 162 }) as any,
      { params: Promise.resolve({ userClubId: '101' }) },
    );
    expect(mockedPrisma.userClub.updateMany).toHaveBeenCalledWith({
      where: { id: BigInt(101), userId: BigInt(1) },
      data: { carryYards: 162 },
    });

    await DELETE(
      new Request('http://localhost/api/my-bag/clubs/101') as any,
      { params: Promise.resolve({ userClubId: '101' }) },
    );
    expect(mockedPrisma.userClub.deleteMany).toHaveBeenCalledWith({
      where: { id: BigInt(101), userId: BigInt(1) },
    });
  });

  it('returns not found when update or delete touches no owned club', async () => {
    mockedPrisma.userClub.updateMany.mockResolvedValueOnce({ count: 0 });
    const updateResponse = await PATCH(
      jsonRequest('http://localhost/api/my-bag/clubs/999', { carryYards: 162 }) as any,
      { params: Promise.resolve({ userClubId: '999' }) },
    );
    expect(updateResponse.status).toBe(404);

    mockedPrisma.userClub.deleteMany.mockResolvedValueOnce({ count: 0 });
    const deleteResponse = await DELETE(
      new Request('http://localhost/api/my-bag/clubs/999') as any,
      { params: Promise.resolve({ userClubId: '999' }) },
    );
    expect(deleteResponse.status).toBe(404);
  });
});
