/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminGpsMappingCourseClient from '@/components/gps/AdminGpsMappingCourseClient';
import type {
  GpsCourseMappingCourse,
  GpsMappedCourseSummary,
  GpsScorecardHole,
  SerializedMappedHole,
} from '@/lib/gps/adminMappingTypes';
import type { ReactNode } from 'react';

const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

jest.mock('@/components/gps/AdminGpsMappingMap', () => ({
  __esModule: true,
  default: ({
    overlay,
    onPointChange,
  }: {
    overlay?: ReactNode;
    onPointChange?: (field: 'tee', point: { lat: number; lng: number }) => void;
  }) => (
    <>
      <div data-testid="gps-mapping-map">
        {overlay}
        <button type="button" onClick={() => onPointChange?.('tee', { lat: 1, lng: 2 })}>
          Move Tee
        </button>
      </div>
      <details><summary>Map Diagnostics</summary></details>
    </>
  ),
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
    syncBackNine: jest.fn().mockResolvedValue({
      created: [],
      updated: [],
      missingSource: [],
      mappedHoles: [],
    }),
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
        courseCard={<section data-testid="course-card">Course Card</section>}
        actions={actions()}
      />,
    );

    expect(screen.getByTestId('gps-mapping-map')).toBeInTheDocument();
    const courseTools = screen.getByText('Course Tools').closest('details');
    const coordinateDetails = screen.getByText('View Coordinates').closest('details');
    const mapDiagnostics = screen.getByText('Map Diagnostics').closest('details');
    expect(courseTools).not.toHaveAttribute('open');
    expect(coordinateDetails).not.toHaveAttribute('open');
    expect(mapDiagnostics).not.toHaveAttribute('open');
    expect(mapDiagnostics?.nextElementSibling).toBe(coordinateDetails);
    expect(coordinateDetails?.nextElementSibling).toBe(courseTools);
    const courseCard = screen.getByTestId('course-card');
    const editor = screen.getByTestId('gps-mapping-map').closest('.gps-admin-main');
    const mappedHoles = screen.getByRole('region', { name: 'Mapped holes' });
    expect(editor?.nextElementSibling).toBe(courseCard);
    expect(courseCard.nextElementSibling).toBe(mappedHoles);
    expect(screen.queryByRole('button', { name: 'Mark Course Ready' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Suggested steps/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Ready Validation')).not.toBeInTheDocument();
    expect(screen.queryByText('Active Hole')).not.toBeInTheDocument();
    expect(screen.queryByText('Click the map or drag a marker to update the selected geometry field.')).not.toBeInTheDocument();
    const markerControls = screen.getByRole('combobox', { name: 'Coordinate Field' }).parentElement;
    expect(markerControls).toHaveClass('gps-admin-edit-controls');
    expect(within(markerControls as HTMLElement).getByRole('button', { name: 'Save & Mark Ready' })).toBeInTheDocument();

    const map = screen.getByTestId('gps-mapping-map');
    expect(within(map).getByText('Hole 1')).toBeInTheDocument();
    expect(within(map).getByText('Par 5 · 532 yd')).toBeInTheDocument();
    expect(within(map).getByText('4/4 Ready')).toHaveClass('gps-admin-status-pill', 'is-ready');
    expect(within(map).getByRole('button', { name: 'Previous Hole' })).toBeInTheDocument();
    expect(within(map).getByRole('button', { name: 'Next Hole' })).toBeInTheDocument();
    fireEvent.click(within(map).getByRole('button', { name: 'Next Hole' }));
    expect(within(map).getByText('Hole 2')).toBeInTheDocument();
    expect(within(map).getByText('Par 3 · 180 yd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fit Hole' })).not.toBeInTheDocument();
    expect(within(courseTools as HTMLElement).getByRole('checkbox', { name: 'Show Bounds' })).toBeEnabled();
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

    expect(screen.getByText('1/4 Complete')).toHaveClass('gps-admin-status-pill');
  });

  it('reverts unsaved active-hole geometry to the latest saved values', () => {
    render(
      <AdminGpsMappingCourseClient
        course={course}
        mappedCourse={mappedCourse('READY')}
        scorecardHoles={scorecardHoles}
        googleMapsKey="test-key"
        actions={actions()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Revert Hole Changes' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move Tee' }));
    expect(screen.getByText('1.0000000, 2.0000000')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revert Hole Changes' }));

    expect(screen.queryByRole('button', { name: 'Revert Hole Changes' })).not.toBeInTheDocument();
    expect(screen.getByText('49.9676829, -98.3002436')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Save & Mark Ready' }));

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

  it('does not sync the back nine when the admin cancels the warning', () => {
    const actionMocks = actions();
    const confirmMock = jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <AdminGpsMappingCourseClient
        course={course}
        mappedCourse={mappedCourse('DRAFT')}
        scorecardHoles={scorecardHoles}
        googleMapsKey="test-key"
        actions={actionMocks}
      />,
    );

    fireEvent.click(screen.getByText('Course Tools'));
    expect(screen.queryByRole('button', { name: 'Duplicate Front 9' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sync Back 9 From Front' }));

    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining(
      'Any existing back-nine GPS mapping will be overwritten and reset to Draft.',
    ));
    expect(actionMocks.syncBackNine).not.toHaveBeenCalled();
    confirmMock.mockRestore();
  });

  it('syncs the back nine after the admin confirms the overwrite warning', async () => {
    const actionMocks = actions();
    actionMocks.syncBackNine.mockResolvedValue({
      created: [10],
      updated: [11],
      missingSource: [3],
      mappedHoles: [],
    });
    const confirmMock = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <AdminGpsMappingCourseClient
        course={course}
        mappedCourse={mappedCourse('DRAFT')}
        scorecardHoles={scorecardHoles}
        googleMapsKey="test-key"
        actions={actionMocks}
      />,
    );

    fireEvent.click(screen.getByText('Course Tools'));
    fireEvent.click(screen.getByRole('button', { name: 'Sync Back 9 From Front' }));

    await waitFor(() => expect(actionMocks.syncBackNine).toHaveBeenCalledWith('mapped-course-1'));
    expect(await screen.findByText(
      'Created 1 back-nine holes. Updated 1. Missing front-nine sources 1.',
    )).toBeInTheDocument();
    confirmMock.mockRestore();
  });
});
