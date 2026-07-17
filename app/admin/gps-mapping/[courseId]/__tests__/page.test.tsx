/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { getServerSession } from 'next-auth';
import GpsMappingCoursePage from '@/app/admin/gps-mapping/[courseId]/page';
import { getGpsMappedCourse } from '@/lib/gps/mappingActions';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

jest.mock('@/lib/admin', () => ({
  isAdminUserId: jest.fn(() => true),
}));

jest.mock('@/lib/auth-config', () => ({
  authOptions: {},
}));

jest.mock('@/lib/gps/mappingActions', () => ({
  duplicateGpsFrontNineToBackNine: jest.fn(),
  getGpsMappedCourse: jest.fn(),
  markGpsMappedCourseReady: jest.fn(),
  markGpsMappedHoleReady: jest.fn(),
  recalculateGpsCourseBounds: jest.fn(),
  saveGpsMappedHoleDraft: jest.fn(),
  startGpsMappingForCourse: jest.fn(),
}));

jest.mock('@/components/gps/AdminGpsMappingCourseClient', () => ({
  __esModule: true,
  default: () => <div data-testid="gps-course-editor" />,
}));

const mockedGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockedGetGpsMappedCourse = getGpsMappedCourse as jest.MockedFunction<typeof getGpsMappedCourse>;

describe('GPS mapping course page header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetServerSession.mockResolvedValue({
      user: { id: 'admin-1' },
      expires: '2026-07-18T00:00:00.000Z',
    });
    mockedGetGpsMappedCourse.mockResolvedValue({
      course: {
        id: 'course-1',
        clubName: 'Portage Golf Club',
        courseName: 'Portage Golf Club',
        location: {
          city: 'Portage la Prairie',
          state: 'MB',
          country: 'Canada',
          address: null,
          latitude: 49.97,
          longitude: -98.3,
        },
        tees: [],
      },
      mappedCourse: {
        id: 'mapped-course-1',
        courseId: 'course-1',
        boundsNorth: null,
        boundsSouth: null,
        boundsEast: null,
        boundsWest: null,
        minZoom: null,
        maxZoom: null,
        mappingStatus: 'READY',
        source: 'MANUAL_ADMIN_GOOGLE',
        createdAt: '2026-07-17T00:00:00.000Z',
        updatedAt: '2026-07-17T00:00:00.000Z',
        holes: [],
      },
    });
  });

  it('uses compact status/navigation and suppresses a duplicate course name', async () => {
    render(await GpsMappingCoursePage({ params: Promise.resolve({ courseId: 'course-1' }) }));

    expect(screen.getByRole('heading', { name: 'Portage Golf Club' })).toBeInTheDocument();
    expect(screen.getAllByText('Portage Golf Club')).toHaveLength(1);
    expect(screen.getByText('Portage la Prairie, MB, Canada')).toBeInTheDocument();
    expect(screen.getByText('Source: manual admin google')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Courses' })).toHaveAttribute('href', '/admin/gps-mapping');
    expect(screen.queryByRole('link', { name: 'All Courses' })).not.toBeInTheDocument();
    expect(screen.getByTestId('gps-course-editor')).toBeInTheDocument();
  });
});
