/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/gps-mapping/courses/route';
import { requireAdmin } from '@/lib/admin-auth';
import { getGpsMappingCoursePage } from '@/lib/gps/mappingCourseList';

jest.mock('@/lib/admin-auth', () => ({
  requireAdmin: jest.fn(),
}));

jest.mock('@/lib/gps/mappingCourseList', () => ({
  getGpsMappingCoursePage: jest.fn(),
  parseCoordinate: (value: string | undefined, minimum: number, maximum: number) => {
    if (!value) return null;
    const coordinate = Number(value);
    return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
      ? coordinate
      : null;
  },
  parseMappingStatusFilter: (value: string | undefined) => value ?? 'ALL',
}));

const mockedRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockedGetCoursePage = getGpsMappingCoursePage as jest.MockedFunction<typeof getGpsMappingCoursePage>;

describe('GET /api/admin/gps-mapping/courses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAdmin.mockResolvedValue(BigInt(1));
    mockedGetCoursePage.mockResolvedValue({
      courses: [],
      hasMore: false,
      gpsMappingSchemaAvailable: true,
    });
  });

  it('passes pagination and active filters to the shared course query', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/admin/gps-mapping/courses?page=3&q=winnipeg&status=READY&lat=49.8951&lng=-97.1384',
    ));

    expect(response.status).toBe(200);
    expect(mockedGetCoursePage).toHaveBeenCalledWith({
      page: 3,
      query: 'winnipeg',
      status: 'READY',
      latitude: 49.8951,
      longitude: -97.1384,
    });
  });

  it('returns an authorization error without querying courses', async () => {
    mockedRequireAdmin.mockRejectedValue(new Error('Forbidden'));

    const response = await GET(new NextRequest('http://localhost/api/admin/gps-mapping/courses?page=2'));

    expect(response.status).toBe(403);
    expect(mockedGetCoursePage).not.toHaveBeenCalled();
  });
});
