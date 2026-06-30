import { GpsMappingStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  getLiveGpsAvailabilityForCourse,
  getLiveGpsMappingForCourse,
  LiveGpsMappingError,
} from '@/lib/gps/liveMapping';

jest.mock('server-only', () => ({}), { virtual: true });

jest.mock('@/lib/db', () => ({
  prisma: {
    course: {
      findUnique: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  course: { findUnique: jest.Mock };
};

function makeMappedHole(overrides: Record<string, unknown> = {}) {
  return {
    holeNumber: 1,
    mappingStatus: GpsMappingStatus.READY,
    teeLat: 49.9,
    teeLng: -97.1,
    target1Lat: null,
    target1Lng: null,
    target1Label: null,
    target2Lat: null,
    target2Lng: null,
    target2Label: null,
    greenFrontLat: 49.901,
    greenFrontLng: -97.101,
    greenCenterLat: 49.902,
    greenCenterLng: -97.102,
    greenBackLat: 49.903,
    greenBackLng: -97.103,
    ...overrides,
  };
}

function makeCourse({
  expected = [1],
  mappingStatus = GpsMappingStatus.READY,
  holes = [makeMappedHole()],
  mapped = true,
}: {
  expected?: number[];
  mappingStatus?: GpsMappingStatus;
  holes?: ReturnType<typeof makeMappedHole>[];
  mapped?: boolean;
} = {}) {
  return {
    id: BigInt(42),
    tees: [{ holes: expected.map((holeNumber) => ({ holeNumber })) }],
    mappedCourse: mapped ? { mappingStatus, holes } : null,
  };
}

describe('live GPS mapping publication boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns unavailable when the course has no mapped course', async () => {
    mockedPrisma.course.findUnique.mockResolvedValue(makeCourse({ mapped: false }));

    await expect(getLiveGpsAvailabilityForCourse('42')).resolves.toEqual({
      courseId: '42',
      available: false,
      coverage: 'none',
      expectedHoleNumbers: [1],
      availableHoleNumbers: [],
      unavailableHoleNumbers: [1],
      reason: 'not_published',
    });
  });

  it.each([GpsMappingStatus.DRAFT, GpsMappingStatus.DISABLED])(
    'does not publish a %s mapped course',
    async (mappingStatus) => {
      mockedPrisma.course.findUnique.mockResolvedValue(makeCourse({ mappingStatus }));

      const result = await getLiveGpsMappingForCourse('42');

      expect(result.availability).toEqual(expect.objectContaining({
        available: false,
        coverage: 'none',
        reason: 'not_published',
      }));
      expect(result.holes).toEqual([]);
    },
  );

  it('publishes a ready course only when every expected hole is usable', async () => {
    mockedPrisma.course.findUnique.mockResolvedValue(makeCourse({
      expected: [1, 2],
      holes: [
        makeMappedHole(),
        makeMappedHole({ holeNumber: 2, mappingStatus: GpsMappingStatus.VERIFIED }),
      ],
    }));

    const result = await getLiveGpsMappingForCourse(BigInt(42));

    expect(result.availability).toEqual({
      courseId: '42',
      available: true,
      coverage: 'full',
      expectedHoleNumbers: [1, 2],
      availableHoleNumbers: [1, 2],
      unavailableHoleNumbers: [],
      reason: 'available',
    });
    expect(result.holes.map((hole) => hole.holeNumber)).toEqual([1, 2]);
  });

  it('filters draft and disabled mapped holes even when the course is ready', async () => {
    mockedPrisma.course.findUnique.mockResolvedValue(makeCourse({
      expected: [1, 2, 3],
      holes: [
        makeMappedHole(),
        makeMappedHole({ holeNumber: 2, mappingStatus: GpsMappingStatus.DRAFT }),
        makeMappedHole({ holeNumber: 3, mappingStatus: GpsMappingStatus.DISABLED }),
      ],
    }));

    const result = await getLiveGpsMappingForCourse(42);

    expect(result.holes.map((hole) => hole.holeNumber)).toEqual([1]);
    expect(result.availability).toEqual(expect.objectContaining({
      available: false,
      coverage: 'partial',
      availableHoleNumbers: [1],
      unavailableHoleNumbers: [2, 3],
      reason: 'incomplete_mapping',
    }));
  });

  it('filters holes with missing or out-of-range required geometry', async () => {
    mockedPrisma.course.findUnique.mockResolvedValue(makeCourse({
      expected: [1, 2, 3],
      holes: [
        makeMappedHole(),
        makeMappedHole({ holeNumber: 2, greenBackLng: null }),
        makeMappedHole({ holeNumber: 3, teeLat: 91, greenCenterLng: -181 }),
      ],
    }));

    const result = await getLiveGpsMappingForCourse('42');

    expect(result.holes.map((hole) => hole.holeNumber)).toEqual([1]);
    expect(result.availability.coverage).toBe('partial');
    expect(result.availability.unavailableHoleNumbers).toEqual([2, 3]);
  });

  it('serializes only complete valid optional targets', async () => {
    mockedPrisma.course.findUnique.mockResolvedValue(makeCourse({
      holes: [makeMappedHole({
        target1Lat: 49.904,
        target1Lng: -97.104,
        target1Label: '  Layup  ',
        target2Lat: 49.905,
        target2Lng: null,
        target2Label: 'Bunker',
      })],
    }));

    const result = await getLiveGpsMappingForCourse('42');

    expect(result.holes[0].targets).toEqual([
      {
        label: 'Layup',
        point: { lat: 49.904, lng: -97.104 },
      },
    ]);
  });

  it('reports partial coverage and exposes no admin mapping fields', async () => {
    mockedPrisma.course.findUnique.mockResolvedValue(makeCourse({
      expected: [1, 2],
      holes: [makeMappedHole()],
    }));

    const result = await getLiveGpsMappingForCourse('42');
    const serialized = JSON.stringify(result);

    expect(result.availability.coverage).toBe('partial');
    expect(result.availability.availableHoleNumbers).toEqual([1]);
    expect(result.availability.unavailableHoleNumbers).toEqual([2]);
    expect(serialized).not.toMatch(/mappedCourseId|mappedHoleId|mappingStatus|source|verifiedAt|createdAt|updatedAt/);
  });

  it('rejects an invalid course id before querying Prisma', async () => {
    await expect(getLiveGpsMappingForCourse('not-an-id')).rejects.toBeInstanceOf(LiveGpsMappingError);
    expect(mockedPrisma.course.findUnique).not.toHaveBeenCalled();
  });
});
