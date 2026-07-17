import { prisma } from '@/lib/db';
import { getGpsMappingCoursePage } from '@/lib/gps/mappingCourseList';
import { isGpsMappingSchemaAvailable } from '@/lib/gps/schemaStatus';

jest.mock('@/lib/db', () => ({
  prisma: {
    course: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/gps/schemaStatus', () => ({
  isGpsMappingSchemaAvailable: jest.fn(),
}));

const mockedFindMany = prisma.course.findMany as jest.Mock;
const mockedSchemaAvailable = isGpsMappingSchemaAvailable as jest.MockedFunction<
  typeof isGpsMappingSchemaAvailable
>;

function queryCourse(id: number) {
  return {
    id: BigInt(id),
    clubName: `Club ${id}`,
    courseName: `Course ${id}`,
    location: null,
    tees: [{ holes: [{ holeNumber: 1 }, { holeNumber: 1 }, { holeNumber: 2 }] }],
    mappedCourse: null,
    _count: { gpsCourseRequests: 0 },
  };
}

describe('getGpsMappingCoursePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSchemaAvailable.mockResolvedValue(true);
  });

  it('requests one extra course to determine whether another page exists', async () => {
    mockedFindMany.mockResolvedValue(Array.from({ length: 21 }, (_, index) => queryCourse(index + 1)));

    const result = await getGpsMappingCoursePage({
      query: '',
      status: 'ALL',
      latitude: null,
      longitude: null,
      page: 2,
    });

    expect(mockedFindMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 21,
    }));
    expect(result.courses).toHaveLength(20);
    expect(result.courses[0].holeCount).toBe(2);
    expect(result.hasMore).toBe(true);
  });

  it('marks the final partial page as complete', async () => {
    mockedFindMany.mockResolvedValue(Array.from({ length: 5 }, (_, index) => queryCourse(index + 41)));

    const result = await getGpsMappingCoursePage({
      query: 'prairie',
      status: 'NOT_STARTED',
      latitude: null,
      longitude: null,
      page: 3,
    });

    expect(result.courses).toHaveLength(5);
    expect(result.hasMore).toBe(false);
  });
});
