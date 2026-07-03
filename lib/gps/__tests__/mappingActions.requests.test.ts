import { markGpsMappedCourseReady } from '@/lib/gps/mappingActions';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/admin-auth', () => ({ requireAdmin: jest.fn() }));

jest.mock('@/lib/db', () => ({
  prisma: {
    mappedCourse: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    gpsCourseRequest: { updateMany: jest.fn() },
    tee: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

type MockPrisma = {
  mappedCourse: { findUnique: jest.Mock; update: jest.Mock };
  gpsCourseRequest: { updateMany: jest.Mock };
  tee: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

const mockedPrisma = prisma as unknown as MockPrisma;
const mockedRequireAdmin = requireAdmin as jest.Mock;
const now = new Date('2026-07-03T12:00:00.000Z');

function mappedCourse(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(5),
    courseId: BigInt(42),
    boundsNorth: null,
    boundsSouth: null,
    boundsEast: null,
    boundsWest: null,
    minZoom: 16,
    maxZoom: 19,
    mappingStatus: 'DRAFT',
    source: 'MANUAL_ADMIN_GOOGLE',
    createdAt: now,
    updatedAt: now,
    holes: [
      { holeNumber: 1, mappingStatus: 'READY' },
      { holeNumber: 2, mappingStatus: 'VERIFIED' },
    ],
    ...overrides,
  };
}

describe('markGpsMappedCourseReady GPS requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue({ id: '1' });
    mockedPrisma.mappedCourse.findUnique.mockResolvedValue(mappedCourse());
    mockedPrisma.tee.findMany.mockResolvedValue([
      { holes: [{ holeNumber: 1 }, { holeNumber: 2 }] },
    ]);
    mockedPrisma.mappedCourse.update.mockResolvedValue(mappedCourse({ mappingStatus: 'READY' }));
    mockedPrisma.gpsCourseRequest.updateMany.mockResolvedValue({ count: 2 });
    mockedPrisma.$transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('marks existing requests mapped in the same transaction as publishing the course', async () => {
    const result = await markGpsMappedCourseReady('5');

    expect(result.ok).toBe(true);
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.gpsCourseRequest.updateMany).toHaveBeenCalledWith({
      where: {
        courseId: BigInt(42),
        status: { not: 'MAPPED' },
      },
      data: { status: 'MAPPED' },
    });
  });
});
