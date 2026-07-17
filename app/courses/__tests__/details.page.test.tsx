/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import CourseDetailsPage from '@/app/courses/[id]/page';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

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
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    render(<CourseDetailsPage />);

    expect(await screen.findByText('Live GPS')).toBeInTheDocument();
    expect(await screen.findByText('Available')).toBeInTheDocument();
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
