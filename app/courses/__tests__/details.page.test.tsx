/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import CourseDetailsPage from '@/app/courses/[id]/page';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import LiveGpsHoleMap from '@/components/gps/LiveGpsHoleMap';
import { HEADER_BACK_NAVIGATION_EVENT } from '@/lib/ui/headerBackNavigation';

jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/app/providers', () => ({
  useMessage: jest.fn(),
}));

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

jest.mock('@/components/gps/LiveGpsHoleMap', () => ({
  __esModule: true,
  default: jest.fn(({ hole }: { hole: { holeNumber: number } }) => (
    <div data-testid="course-gps-preview-map">Mapped Hole {hole.holeNumber}</div>
  )),
}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: function MockSelect({ value }: { value: { label: string } | null }) {
    return <div>{value?.label ?? 'Select Tee'}</div>;
  },
}));

const mockedUseParams = useParams as jest.Mock;
const mockedUseRouter = useRouter as jest.Mock;
const mockedUseSession = useSession as jest.Mock;
const mockedUseMessage = useMessage as jest.Mock;
const mockedCaptureClientEvent = captureClientEvent as jest.Mock;
const mockedLiveGpsHoleMap = jest.mocked(LiveGpsHoleMap);
const push = jest.fn();
const replace = jest.fn();
const showMessage = jest.fn();
const clearMessage = jest.fn();
const showConfirm = jest.fn();

function apiResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response;
}

function coursePayload() {
  return {
    course: {
      id: 42,
      course_name: 'North',
      club_name: 'GolfIQ Club',
      location: {
        address: '123 Fairway',
        city: 'Winnipeg',
        state: 'MB',
        country: 'Canada',
      },
      tees: {
        male: [{
          id: 12,
          tee_name: 'White',
          gender: 'male',
          course_rating: 72,
          slope_rating: 120,
          total_yards: 6200,
          number_of_holes: 18,
          par_total: 72,
          holes: [{
            id: 1,
            hole_number: 1,
            par: 4,
            yardage: 390,
            handicap: 1,
          }],
        }],
        female: [],
      },
    },
  };
}

describe('/courses/[id] page GPS status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseParams.mockReturnValue({ id: '42' });
    mockedUseRouter.mockReturnValue({ push, replace });
    mockedUseSession.mockReturnValue({ status: 'authenticated', data: { user: { id: '1' } } });
    mockedUseMessage.mockReturnValue({ showMessage, clearMessage, showConfirm });
  });

  it('matches the current course layout while the course details are loading', () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as typeof fetch;

    const { container } = render(<CourseDetailsPage />);

    expect(screen.getByLabelText('Loading Live GPS status')).toBeInTheDocument();
    expect(container.querySelector('.course-club svg')).toBeNull();
    expect(container.querySelector('.course-location svg')).toBeNull();
    expect(container.querySelector('.course-gps-status-skeleton-copy')).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(
      Array.from(container.querySelectorAll('[aria-hidden="true"]'))
        .filter((element) => element.classList.contains('skeleton')),
    ).not.toHaveLength(0);
    expect(container.querySelector('.course-scorecard-meta .u-w-72')).toHaveClass('skeleton');
  });

  it('keeps the full page skeleton visible until Live GPS finishes loading', async () => {
    let resolveGps!: (response: Response) => void;
    const gpsResponse = new Promise<Response>((resolve) => {
      resolveGps = resolve;
    });

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/courses/42') return Promise.resolve(apiResponse(coursePayload()));
      if (url === '/api/gps/live/course/42') return gpsResponse;
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    render(<CourseDetailsPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/gps/live/course/42',
        expect.objectContaining({ cache: 'no-store' }),
      );
    });
    expect(screen.getByLabelText('Loading Live GPS status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'North' })).not.toBeInTheDocument();

    resolveGps(apiResponse({
      availability: {
        courseId: '42',
        available: true,
        coverage: 'full',
        expectedHoleNumbers: [1],
        availableHoleNumbers: [1],
        unavailableHoleNumbers: [],
        reason: 'available',
      },
      holes: [{
        holeNumber: 1,
        tee: { lat: 49, lng: -97 },
        green: {
          front: { lat: 49.001, lng: -97 },
          center: { lat: 49.002, lng: -97 },
          back: { lat: 49.003, lng: -97 },
        },
        targets: [],
      }],
    }));

    expect(await screen.findByRole('heading', { name: 'North' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading Live GPS status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview Course' })).toBeInTheDocument();
  });

  it('shows when live GPS is available for the course', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/courses/42') return Promise.resolve(apiResponse(coursePayload()));
      if (url === '/api/gps/live/course/42') {
        return Promise.resolve(apiResponse({
          availability: {
            courseId: '42',
            available: true,
            coverage: 'full',
            expectedHoleNumbers: [1],
            availableHoleNumbers: [1],
            unavailableHoleNumbers: [],
            reason: 'available',
          },
          holes: [{
            holeNumber: 1,
            tee: { lat: 49, lng: -97 },
            green: {
              front: { lat: 49.001, lng: -97 },
              center: { lat: 49.002, lng: -97 },
              back: { lat: 49.003, lng: -97 },
            },
            targets: [],
          }],
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    render(<CourseDetailsPage />);

    expect(await screen.findByText('Live GPS')).toBeInTheDocument();
    expect(await screen.findByText('Available')).toBeInTheDocument();
    const previewButton = screen.getByRole('button', { name: 'Preview Course' });
    const gpsCard = previewButton.closest('.course-gps-status-card');
    const gpsStatusRow = gpsCard?.querySelector('.course-gps-status-row');
    expect(previewButton).toHaveClass('course-gps-preview-button');
    expect(gpsCard).toContainElement(previewButton);
    expect(gpsStatusRow).toContainElement(screen.getByText('Available'));
    expect(gpsStatusRow).not.toContainElement(previewButton);
    expect(gpsStatusRow?.nextElementSibling).toBe(previewButton);
    expect(screen.queryByRole('button', { name: 'Request GPS' })).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith('/api/gps/course-requests?courseId=42', expect.anything());
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.gpsAvailable,
      expect.objectContaining({
        source_surface: 'course_details',
        course_id: 42,
        available: true,
        coverage: 'full',
      }),
      expect.objectContaining({ pathname: '/courses/42' }),
    );
  });

  it('previews mapped holes without score or review actions', async () => {
    const payload = coursePayload();
    payload.course.tees.male[0].holes.push({
      id: 2,
      hole_number: 2,
      par: 5,
      yardage: 510,
      handicap: 3,
    });

    const mappedHole = (holeNumber: number) => ({
      holeNumber,
      tee: { lat: 49 + holeNumber * 0.001, lng: -97 },
      green: {
        front: { lat: 49 + holeNumber * 0.0011, lng: -97 },
        center: { lat: 49 + holeNumber * 0.0012, lng: -97 },
        back: { lat: 49 + holeNumber * 0.0013, lng: -97 },
      },
      targets: [],
    });

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/courses/42') return Promise.resolve(apiResponse(payload));
      if (url === '/api/gps/live/course/42') {
        return Promise.resolve(apiResponse({
          availability: {
            courseId: '42',
            available: true,
            coverage: 'full',
            expectedHoleNumbers: [1, 2],
            availableHoleNumbers: [1, 2],
            unavailableHoleNumbers: [],
            reason: 'available',
          },
          holes: [mappedHole(1), mappedHole(2)],
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    render(<CourseDetailsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Course' }));
    expect(await screen.findByRole('dialog', { name: 'GPS preview for hole 1' })).toBeInTheDocument();
    expect(screen.getByTestId('course-gps-preview-map')).toHaveTextContent('Mapped Hole 1');
    expect(screen.getByText('Par 4 · 390 yd · HCP 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Log Score/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next Hole' }));
    expect(await screen.findByRole('dialog', { name: 'GPS preview for hole 2' })).toBeInTheDocument();
    expect(screen.getByTestId('course-gps-preview-map')).toHaveTextContent('Mapped Hole 2');
    expect(screen.getByText('Par 5 · 510 yd · HCP 3')).toBeInTheDocument();
    expect(mockedLiveGpsHoleMap).toHaveBeenLastCalledWith(
      expect.objectContaining({
        courseHoles: expect.arrayContaining([
          expect.objectContaining({ holeNumber: 1 }),
          expect.objectContaining({ holeNumber: 2 }),
        ]),
        hole: expect.objectContaining({ holeNumber: 2 }),
        par: 5,
      }),
      undefined,
    );

    const headerBackEvent = new CustomEvent(HEADER_BACK_NAVIGATION_EVENT, { cancelable: true });
    let dispatched = true;
    act(() => {
      dispatched = window.dispatchEvent(headerBackEvent);
    });
    expect(dispatched).toBe(false);
    expect(headerBackEvent.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog', { name: /GPS preview/i })).not.toBeInTheDocument();
  });

  it('omits a null-like address and its separator from the course location', async () => {
    const payload = coursePayload();
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/courses/42') {
        return Promise.resolve(apiResponse({
          course: {
            ...payload.course,
            location: { ...payload.course.location, address: 'null' },
          },
        }));
      }
      if (url === '/api/gps/live/course/42') {
        return Promise.resolve(apiResponse({
          availability: {
            courseId: '42',
            available: true,
            coverage: 'full',
            expectedHoleNumbers: [1],
            availableHoleNumbers: [1],
            unavailableHoleNumbers: [],
            reason: 'available',
          },
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const { container } = render(<CourseDetailsPage />);

    await screen.findByText('North');
    expect(container.querySelector('.course-location')).toHaveTextContent('Winnipeg, MB, Canada');
    expect(container.querySelector('.course-location')).not.toHaveTextContent('null');
    expect(container.querySelector('.course-location')).not.toHaveTextContent(/^\s*,/);
  });

  it('lets the user request GPS mapping when the course is not mapped', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/courses/42') return Promise.resolve(apiResponse(coursePayload()));
      if (url === '/api/gps/live/course/42') {
        return Promise.resolve(apiResponse({
          availability: {
            courseId: '42',
            available: false,
            coverage: 'none',
            expectedHoleNumbers: [1],
            availableHoleNumbers: [],
            unavailableHoleNumbers: [1],
            reason: 'no_mapping',
          },
        }));
      }
      if (url === '/api/gps/course-requests?courseId=42') {
        return Promise.resolve(apiResponse({
          requestedByCurrentUser: false,
          status: null,
          requestCount: 0,
        }));
      }
      if (url === '/api/gps/course-requests' && init?.method === 'POST') {
        return Promise.resolve(apiResponse({
          requested: true,
          status: 'REQUESTED',
          message: 'GPS mapping requested',
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    render(<CourseDetailsPage />);

    const requestButton = await screen.findByRole('button', { name: 'Request GPS' });
    fireEvent.click(requestButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/gps/course-requests', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ courseId: 42 }),
      }));
    });
    expect(await screen.findByRole('button', { name: 'Requested' })).toBeDisabled();
    expect(screen.getByText('GPS mapping requested. We will prioritize this course.')).toBeInTheDocument();
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.gpsMappingRequested,
      expect.objectContaining({
        source_surface: 'course_details',
        course_id: 42,
        request_count: 1,
      }),
      expect.objectContaining({ pathname: '/courses/42' }),
    );
  });
});
