import { syncGpsFrontNineToBackNine } from '@/lib/gps/mappingActions';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/admin-auth', () => ({ requireAdmin: jest.fn() }));

jest.mock('@/lib/db', () => ({
  prisma: {
    mappedHole: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

type MockPrisma = {
  mappedHole: {
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

const mockedPrisma = prisma as unknown as MockPrisma;
const mockedRequireAdmin = requireAdmin as jest.Mock;
const now = new Date('2026-08-21T12:00:00.000Z');

function mappedHole(holeNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(holeNumber),
    mappedCourseId: BigInt(5),
    holeNumber,
    teeLat: 49.9,
    teeLng: -97.1,
    target1Lat: 49.901,
    target1Lng: -97.101,
    target1Label: 'Layup',
    target2Lat: null,
    target2Lng: null,
    target2Label: null,
    greenFrontLat: 49.902,
    greenFrontLng: -97.102,
    greenCenterLat: 49.9021,
    greenCenterLng: -97.1021,
    greenBackLat: 49.9022,
    greenBackLng: -97.1022,
    mappingStatus: 'READY',
    source: 'MANUAL_ADMIN_GOOGLE',
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('syncGpsFrontNineToBackNine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue({ id: '1' });
  });

  it('creates a missing back-nine mapping from its front-nine source', async () => {
    const source = mappedHole(1);
    const created = mappedHole(10, {
      mappingStatus: 'DRAFT',
      verifiedAt: null,
    });
    mockedPrisma.mappedHole.findMany
      .mockResolvedValueOnce([source])
      .mockResolvedValueOnce([]);
    mockedPrisma.mappedHole.create.mockResolvedValue(created);

    const result = await syncGpsFrontNineToBackNine('5');

    expect(mockedPrisma.mappedHole.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        mappedCourseId: BigInt(5),
        holeNumber: 10,
        teeLat: source.teeLat,
        greenCenterLat: source.greenCenterLat,
        mappingStatus: 'DRAFT',
        verifiedAt: null,
      }),
    }));
    expect(result.created).toEqual([10]);
    expect(result.updated).toEqual([]);
    expect(result.missingSource).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('overwrites an existing back-nine mapping and clears its verification', async () => {
    const source = mappedHole(1);
    const updated = mappedHole(10, {
      mappingStatus: 'DRAFT',
      verifiedAt: null,
    });
    mockedPrisma.mappedHole.findMany
      .mockResolvedValueOnce([source])
      .mockResolvedValueOnce([{ holeNumber: 10 }]);
    mockedPrisma.mappedHole.update.mockResolvedValue(updated);

    const result = await syncGpsFrontNineToBackNine('5');

    expect(mockedPrisma.mappedHole.update).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        mappedCourseId_holeNumber: {
          mappedCourseId: BigInt(5),
          holeNumber: 10,
        },
      },
      data: expect.objectContaining({
        teeLat: source.teeLat,
        greenCenterLat: source.greenCenterLat,
        mappingStatus: 'DRAFT',
        verifiedAt: null,
      }),
    }));
    expect(mockedPrisma.mappedHole.create).not.toHaveBeenCalled();
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([10]);
  });
});
