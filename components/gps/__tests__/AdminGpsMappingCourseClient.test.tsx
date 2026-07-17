/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminGpsMappingCourseClient from '@/components/gps/AdminGpsMappingCourseClient';
import type {
  GpsCourseMappingCourse,
  GpsMappedCourseSummary,
  GpsScorecardHole,
  SerializedMappedHole,
} from '@/lib/gps/adminMappingTypes';

const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

jest.mock('@/components/gps/AdminGpsMappingMap', () => ({
  __esModule: true,
  default: () => <div data-testid="gps-mapping-map" />,
}));

const course: GpsCourseMappingCourse = {
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
};

const scorecardHoles: GpsScorecardHole[] = [
  { holeNumber: 1, par: 5, yardage: 532, handicap: 1 },
  { holeNumber: 2, par: 3, yardage: 180, handicap: 2 },
];

function mappedHole(
  holeNumber: number,
  mappingStatus: SerializedMappedHole['mappingStatus'],
  complete: boolean,
): SerializedMappedHole {
  return {
    id: `hole-${holeNumber}`,
    mappedCourseId: 'mapped-course-1',
    holeNumber,
    teeLat: complete ? 49.9676829 : null,
    teeLng: complete ? -98.3002436 : null,
    target1Lat: null,
    target1Lng: null,
    target1Label: 'Target 1',
    target2Lat: null,
    target2Lng: null,
    target2Label: 'Target 2',
    greenFrontLat: complete ? 49.9667365 : null,
    greenFrontLng: complete ? -98.3066206 : null,
    greenCenterLat: complete ? 49.9666892 : null,
    greenCenterLng: complete ? -98.3067631 : null,
    greenBackLat: complete ? 49.9666421 : null,
    greenBackLng: complete ? -98.3068836 : null,
    mappingStatus,
    source: 'MANUAL_ADMIN_GOOGLE',
    verifiedAt: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
  };
}

function mappedCourse(mappingStatus: GpsMappedCourseSummary['mappingStatus']): GpsMappedCourseSummary {
  return {
    id: 'mapped-course-1',
    courseId: course.id,
    boundsNorth: 49.97,
    boundsSouth: 49.96,
    boundsEast: -98.3,
    boundsWest: -98.31,
    minZoom: null,
    maxZoom: null,
    mappingStatus,
    source: 'MANUAL_ADMIN_GOOGLE',
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
    holes: [
      mappedHole(1, 'READY', true),
      mappedHole(2, 'DRAFT', false),
    ],
  };
}

function actions() {
  const savedHole = mappedHole(1, 'DRAFT', true);
  const readyHole = mappedHole(1, 'READY', true);

  return {
    saveDraft: jest.fn().mockResolvedValue({ mappedHole: savedHole }),
    markHoleReady: jest.fn().mockResolvedValue({
      ok: true,
      missingFields: [],
      mappedHole: readyHole,
    }),
    markCourseReady: jest.fn(),
    recalculateBounds: jest.fn(),
    duplicateFrontNine: jest.fn(),
  };
}

describe('AdminGpsMappingCourseClient compact layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps secondary information collapsed and compacts completed-hole status', () => {
    render(
      <AdminGpsMappingCourseClient
        course={course}
        mappedCourse={mappedCourse('READY')}
        scorecardHoles={scorecardHoles}
        googleMapsKey="test-key"
        actions={actions()}
      />,
    );

    expect(screen.getByTestId('gps-mapping-map')).toBeInTheDocument();
    expect(screen.getByText('Course Tools').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('View Coordinates').closest('details')).not.toHaveAttribute('open');
    expect(screen.queryByRole('button', { name: 'Mark Course Ready' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Suggested steps/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Ready Validation')).not.toBeInTheDocument();
    expect(screen.getByText('4/4 Ready')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show Bounds' })).toBeEnabled();
    expect(screen.getByText('2 Holes')).toBeInTheDocument();

    const readyHole = screen.getByRole('button', { name: /Hole 1 \| Par 5 \| 532 yd/i });
    expect(readyHole).toHaveTextContent('✓');
    expect(readyHole).not.toHaveTextContent('4/4 points');
    const incompleteHole = screen.getByRole('button', { name: /Hole 2 \| Par 3 \| 180 yd/i });
    expect(incompleteHole).toHaveTextContent('0/4 points');
    expect(incompleteHole).not.toHaveTextContent('draft');
  });

  it('keeps the course-ready action available for draft courses', () => {
    render(
      <AdminGpsMappingCourseClient
        course={course}
        mappedCourse={mappedCourse('DRAFT')}
        scorecardHoles={scorecardHoles}
        googleMapsKey="test-key"
        actions={actions()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Mark Course Ready' })).toBeInTheDocument();
  });

  it('counts each required latitude/longitude pair as one mapped point', () => {
    const draftCourse = mappedCourse('DRAFT');
    draftCourse.holes[0] = {
      ...mappedHole(1, 'DRAFT', false),
      teeLat: 49.9676829,
      teeLng: -98.3002436,
    };

    render(
      <AdminGpsMappingCourseClient
        course={course}
        mappedCourse={draftCourse}
        scorecardHoles={scorecardHoles}
        googleMapsKey="test-key"
        actions={actions()}
      />,
    );

    expect(screen.getByText('1/4 Complete')).toBeInTheDocument();
  });

  it('saves the latest hole geometry before marking the hole ready', async () => {
    const actionMocks = actions();

    render(
      <AdminGpsMappingCourseClient
        course={course}
        mappedCourse={mappedCourse('READY')}
        scorecardHoles={scorecardHoles}
        googleMapsKey="test-key"
        actions={actionMocks}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Hole Ready' }));

    await waitFor(() => expect(actionMocks.markHoleReady).toHaveBeenCalledWith('hole-1'));
    expect(actionMocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      mappedCourseId: 'mapped-course-1',
      holeNumber: 1,
      teeLat: 49.9676829,
      teeLng: -98.3002436,
    }));
    expect(actionMocks.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      actionMocks.markHoleReady.mock.invocationCallOrder[0],
    );
    expect(await screen.findByText('Hole 1 saved and marked ready.')).toBeInTheDocument();
  });
});
