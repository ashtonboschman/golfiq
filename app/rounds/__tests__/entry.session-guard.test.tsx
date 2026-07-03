/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AddRoundPage from '@/app/rounds/add/page';
import EditRoundPage from '@/app/rounds/edit/[id]/page';
import { useSession } from 'next-auth/react';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockShowMessage = jest.fn();
const mockShowConfirm = jest.fn();
const mockClearMessage = jest.fn();
const mockGetCurrentPosition = jest.fn();
const mockRequestLiveRoundGpsPermission = jest.fn();

let mockPathname = '/rounds/add';
let mockParams: Record<string, string> = {};
let mockQuery = new URLSearchParams();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  usePathname: () => mockPathname,
  useParams: () => mockParams,
  useSearchParams: () => ({
    get: (key: string) => mockQuery.get(key),
    has: (key: string) => mockQuery.has(key),
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    showConfirm: mockShowConfirm,
    clearMessage: mockClearMessage,
  }),
}));

jest.mock('@/lib/gps/browserLocation', () => ({
  requestLiveRoundGpsPermission: () => mockRequestLiveRoundGpsPermission(),
}));

jest.mock('react-select-async-paginate', () => ({
  AsyncPaginate: Object.assign(
    ({
      loadOptions,
      onChange,
      placeholder,
    }: {
      loadOptions?: (search: string, loaded: unknown[], additional: { page: number }) => Promise<unknown>;
      onChange?: (option: unknown) => void;
      placeholder?: string;
    }) => (
      <button
        type="button"
        data-testid="async-paginate"
        aria-label={placeholder || 'Select option'}
        onClick={async () => {
          if (placeholder === 'Select Course') {
            await loadOptions?.('', [], { page: 1 });
            onChange?.({ label: 'GolfIQ Club', value: 11 });
            return;
          }
          onChange?.({
            label: 'Blue 6500 yd (72/113) 18 holes',
            value: 21,
            teeObj: {
              id: 21,
              tee_name: 'Blue',
              gender: 'male',
              number_of_holes: 18,
              course_rating: 72,
              slope_rating: 113,
              par_total: 72,
              front_course_rating: 36,
              front_slope_rating: 113,
              back_course_rating: 36,
              back_slope_rating: 113,
              holes: [{ hole_number: 1, par: 4 }],
            },
          });
        }}
      />
    ),
    { displayName: 'MockAsyncPaginate' },
  ),
}));

jest.mock('react-select', () =>
  Object.assign(
    () => <div data-testid="react-select" />,
    { displayName: 'MockReactSelect' },
  ),
);

jest.mock('@/components/HoleCard', () =>
  Object.assign(
    () => <div data-testid="hole-card" />,
    { displayName: 'MockHoleCard' },
  ),
);

const mockedUseSession = useSession as unknown as jest.Mock;

describe('round entry session guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentPosition.mockReset();
    mockRequestLiveRoundGpsPermission.mockResolvedValue(null);
    localStorage.clear();
    mockPathname = '/rounds/add';
    mockParams = {};
    mockQuery = new URLSearchParams();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: mockGetCurrentPosition },
    });
  });

  it('defaults to Live Round and renders it before After Round', async () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '42' } },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const body = String(input).includes('/api/rounds/live/sessions')
        ? { sessions: [] }
        : { type: 'success', profile: null };
      return { ok: true, json: async () => body } as Response;
    }) as typeof fetch;

    render(<AddRoundPage />);

    const liveRoundButton = await screen.findByRole('button', { name: 'Live Round' });
    const afterRoundButton = screen.getByRole('button', { name: 'After Round' });

    expect(liveRoundButton).toHaveClass('active');
    expect(afterRoundButton).not.toHaveClass('active');
    expect(
      liveRoundButton.compareDocumentPosition(afterRoundButton)
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows a stable skeleton while checking for active live rounds', () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '42' } },
    });
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/api/rounds/live/sessions')) {
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ type: 'success', profile: null }),
      } as Response);
    }) as typeof fetch;

    render(<AddRoundPage />);

    expect(screen.getByRole('status', { name: 'Loading live rounds' })).toBeInTheDocument();
    expect(screen.queryByText('Checking for active live rounds...')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
    expect(screen.queryByText('Logging Mode')).not.toBeInTheDocument();
  });

  it('redirects add-round to login when unauthenticated without any draft', async () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<AddRoundPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('keeps add-round on screen when unauthenticated and a draft exists', async () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: { user: { id: '42' } },
    });

    localStorage.setItem('golfiq:round:add:draft:v1:42', JSON.stringify({ savedAt: 'now' }));

    render(<AddRoundPage />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalledWith('/login');
    });
    expect(mockShowMessage).toHaveBeenCalledWith(
      expect.stringContaining('Connection/session issue detected'),
      'error',
    );
  });

  it('uses ephemeral browser location for course proximity without rendering a map', async () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '42' } },
    });
    mockGetCurrentPosition.mockImplementationOnce((onSuccess: PositionCallback) => {
      onSuccess({
        coords: { latitude: 49.8951, longitude: -97.1384 },
      } as GeolocationPosition);
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/rounds/live/sessions')
        ? { sessions: [] }
        : url.includes('/api/courses?')
          ? { courses: [] }
          : { type: 'success', profile: null };
      return { ok: true, json: async () => body } as Response;
    }) as typeof fetch;

    const { container } = render(<AddRoundPage />);

    await waitFor(() => expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: 'Select Course' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('&lat=49.8951&lng=-97.1384'),
    ));
    expect(container.querySelector('canvas')).not.toBeInTheDocument();
    expect(container.querySelector('[class*="map"]')).not.toBeInTheDocument();
  });

  it('defaults GPS on after full course coverage is confirmed and allows opt-out', async () => {
    mockQuery = new URLSearchParams('mode=live');
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '42' } },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let body: Record<string, unknown> = { type: 'success', profile: null };
      if (url.includes('/api/rounds/live/sessions')) body = { sessions: [] };
      if (url.includes('/api/tees?')) body = { tees: [] };
      if (url.includes('/api/gps/live/course/11')) {
        body = {
          availability: {
            courseId: '11',
            available: true,
            coverage: 'full',
            expectedHoleNumbers: [1],
            availableHoleNumbers: [1],
            unavailableHoleNumbers: [],
            reason: 'available',
          },
        };
      }
      return { ok: true, json: async () => body } as Response;
    }) as typeof fetch;

    render(<AddRoundPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select Course' }));

    const gpsToggle = await screen.findByRole('checkbox', { name: 'Live GPS' });
    expect(screen.getByText('Live GPS')).toBeInTheDocument();
    const gpsHelp = screen.getByText('Hole maps and distances.');
    expect(gpsHelp).toHaveClass('combined-note');
    expect(gpsToggle).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Test GPS Location' })).not.toBeInTheDocument();
    expect(gpsToggle.closest('.live-gps-toggle')?.nextElementSibling).toBe(gpsHelp);
    expect(gpsHelp.nextElementSibling).toHaveClass('form-actions');

    fireEvent.click(gpsToggle);
    expect(gpsToggle).not.toBeChecked();
  });

  it('shows admins a test GPS location toggle beneath Live GPS', async () => {
    mockQuery = new URLSearchParams('mode=live');
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1' } },
    });
    mockGetCurrentPosition.mockImplementation((onSuccess: PositionCallback) => {
      onSuccess({
        coords: { latitude: 49.8951, longitude: -97.1384, accuracy: 5 },
      } as GeolocationPosition);
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let body: Record<string, unknown> = { type: 'success', profile: null };
      if (url.includes('/api/rounds/live/sessions')) {
        body = init?.method === 'POST'
          ? { session: { id: 'admin-gps-test' } }
          : { sessions: [] };
      }
      if (url.includes('/api/tees?')) body = { tees: [] };
      if (url.includes('/api/tees/21/holes')) {
        body = { holes: [{ id: 101, hole_number: 1, par: 4 }] };
      }
      if (url.includes('/api/gps/live/course/11')) {
        body = {
          availability: {
            courseId: '11',
            available: true,
            coverage: 'full',
            expectedHoleNumbers: [1],
            availableHoleNumbers: [1],
            unavailableHoleNumbers: [],
            reason: 'available',
          },
        };
      }
      return { ok: true, json: async () => body } as Response;
    }) as typeof fetch;

    render(<AddRoundPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select Course' }));

    const gpsToggle = await screen.findByRole('checkbox', { name: 'Live GPS' });
    const testGpsToggle = screen.getByRole('checkbox', { name: 'Test GPS Location' });
    expect(gpsToggle).toBeChecked();
    expect(testGpsToggle).toBeEnabled();
    expect(testGpsToggle.closest('.live-gps-toggle')).toBe(
      gpsToggle.closest('.live-gps-toggle')?.nextElementSibling,
    );

    fireEvent.click(testGpsToggle);
    expect(testGpsToggle).toBeChecked();

    fireEvent.click(gpsToggle);
    expect(testGpsToggle).toBeDisabled();
    expect(testGpsToggle).not.toBeChecked();

    fireEvent.click(gpsToggle);
    fireEvent.click(testGpsToggle);
    fireEvent.click(screen.getByRole('button', { name: 'Select Tee' }));
    expect(await screen.findByText('Round Type')).toBeInTheDocument();
    expect(screen.getByText('Starting Hole')).toBeInTheDocument();
    const startButton = await screen.findByRole('button', { name: 'Start Round' });
    await waitFor(() => expect(startButton).toBeEnabled());
    const locationCallCountBeforeStart = mockGetCurrentPosition.mock.calls.length;
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/rounds/live/admin-gps-test?gpsTestLocation=1');
    });
    expect(mockRequestLiveRoundGpsPermission).not.toHaveBeenCalled();
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(locationCallCountBeforeStart);
    const sessionCreateCall = (global.fetch as jest.Mock).mock.calls.find(
      ([input, init]: [RequestInfo | URL, RequestInit | undefined]) =>
        String(input) === '/api/rounds/live/sessions' && init?.method === 'POST',
    );
    expect(JSON.parse(String(sessionCreateCall?.[1]?.body))).toMatchObject({ gpsEnabled: true });
    expect(JSON.parse(String(sessionCreateCall?.[1]?.body))).not.toHaveProperty('gpsTestLocation');
  });

  it('shows only the active-round decision until Start New Round is selected', async () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1' } },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let body: Record<string, unknown> = { type: 'success', profile: null };
      if (url.includes('/api/rounds/live/sessions')) {
        body = {
          sessions: [{
            id: 'active-round',
            date: '2026-07-03',
            tee_segment: 'full',
            last_saved_at: '2026-07-03T16:07:00.000Z',
            active_hole_number: 1,
            course: { club_name: 'Portage Golf Club', course_name: 'Portage Golf Club' },
            tee: { tee_name: 'White', number_of_holes: 18 },
          }],
        };
      }
      if (url.includes('/api/tees?')) body = { tees: [] };
      if (url.includes('/api/gps/live/course/11')) {
        body = {
          availability: {
            courseId: '11',
            available: true,
            coverage: 'full',
            expectedHoleNumbers: [1],
            availableHoleNumbers: [1],
            unavailableHoleNumbers: [],
            reason: 'available',
          },
        };
      }
      return { ok: true, json: async () => body } as Response;
    }) as typeof fetch;

    render(<AddRoundPage />);

    const startNewButton = await screen.findByRole('button', { name: 'Start New Round' });
    expect(screen.queryByText('Logging Mode')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select Course' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select Tee' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Live GPS' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Test GPS Location' })).not.toBeInTheDocument();

    fireEvent.click(startNewButton);

    expect(screen.queryByText('Continue Live Round')).not.toBeInTheDocument();
    expect(screen.getByText('Logging Mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select Course' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/gps/live/course/11',
      expect.objectContaining({ cache: 'no-store' }),
    ));

    expect(await screen.findByRole('checkbox', { name: 'Live GPS' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Test GPS Location' })).not.toBeChecked();
  });

  it('keeps the production pre-start GPS permission request when Test GPS is inactive', async () => {
    mockQuery = new URLSearchParams('mode=live');
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '42' } },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let body: Record<string, unknown> = { type: 'success', profile: null };
      if (url.includes('/api/rounds/live/sessions')) {
        body = init?.method === 'POST'
          ? { session: { id: 'real-gps' } }
          : { sessions: [] };
      }
      if (url.includes('/api/tees?')) body = { tees: [] };
      if (url.includes('/api/tees/21/holes')) {
        body = { holes: [{ id: 101, hole_number: 1, par: 4 }] };
      }
      if (url.includes('/api/gps/live/course/11')) {
        body = {
          availability: {
            courseId: '11',
            available: true,
            coverage: 'full',
            expectedHoleNumbers: [1],
            availableHoleNumbers: [1],
            unavailableHoleNumbers: [],
            reason: 'available',
          },
        };
      }
      return { ok: true, json: async () => body } as Response;
    }) as typeof fetch;

    render(<AddRoundPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select Course' }));
    expect(await screen.findByRole('checkbox', { name: 'Live GPS' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Select Tee' }));

    const startButton = await screen.findByRole('button', { name: 'Start Round' });
    await waitFor(() => expect(startButton).toBeEnabled());
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockRequestLiveRoundGpsPermission).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/rounds/live/real-gps');
    });
  });

  it('shows no GPS UI when course coverage is unavailable', async () => {
    mockQuery = new URLSearchParams('mode=live');
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '42' } },
    });
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let body: Record<string, unknown> = { type: 'success', profile: null };
      if (url.includes('/api/rounds/live/sessions')) body = { sessions: [] };
      if (url.includes('/api/courses?')) body = { courses: [] };
      if (url.includes('/api/tees?')) body = { tees: [] };
      if (url.includes('/api/gps/live/course/11')) {
        body = {
          availability: {
            courseId: '11',
            available: false,
            coverage: 'none',
            expectedHoleNumbers: [1],
            availableHoleNumbers: [],
            unavailableHoleNumbers: [1],
            reason: 'not_published',
          },
        };
      }
      return { ok: true, json: async () => body } as Response;
    }) as typeof fetch;

    render(<AddRoundPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select Course' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/gps/live/course/11',
      expect.objectContaining({ cache: 'no-store' }),
    ));

    expect(screen.queryByRole('checkbox', { name: 'Live GPS' })).not.toBeInTheDocument();
    expect(screen.queryByText(/checking gps availability/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gps is not available/i)).not.toBeInTheDocument();
  });

  it('redirects edit-round to login when unauthenticated without any draft', async () => {
    mockPathname = '/rounds/edit/123';
    mockParams = { id: '123' };
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<EditRoundPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('keeps edit-round on screen when unauthenticated and a draft exists', async () => {
    mockPathname = '/rounds/edit/123';
    mockParams = { id: '123' };
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: { user: { id: '42' } },
    });

    localStorage.setItem('golfiq:round:edit:draft:v1:42:123', JSON.stringify({ savedAt: 'now' }));

    render(<EditRoundPage />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalledWith('/login');
    });
    expect(mockShowMessage).toHaveBeenCalledWith(
      expect.stringContaining('Connection/session issue detected'),
      'error',
    );
  });
});
