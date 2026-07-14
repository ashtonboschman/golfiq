/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import LiveRoundSessionClient from '@/components/rounds/live/LiveRoundSessionClient';
import { captureClientEvent } from '@/lib/analytics/client';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  consumeLiveRoundExitRedirect,
  markLiveRoundExitRedirect,
  requestLiveRoundNavigation,
} from '@/lib/rounds/liveRoundNavigation';
import type { LiveRoundSession } from '@/components/rounds/live/types';

const mockLiveGpsMapMount = jest.fn();

jest.mock('next/navigation', () => ({
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
  default: function MockLiveGpsHoleMap(props: {
    hole: { holeNumber: number };
    courseHoles?: Array<{ holeNumber: number }> | null;
    routeKey: string;
    userPosition?: { lat: number; lng: number } | null;
    userAccuracyMeters?: number | null;
    testLocationEnabled?: boolean;
    suggestionClubs?: Array<{ shortLabel: string; carryYards: number }>;
    onMapReady?: () => void;
  }) {
    const React = jest.requireActual<typeof import('react')>('react');
    const onMapReadyRef = React.useRef(props.onMapReady);
    onMapReadyRef.current = props.onMapReady;
    React.useEffect(() => {
      mockLiveGpsMapMount();
      onMapReadyRef.current?.();
    }, []);

    return (
      <div
        data-testid="live-gps-map"
        data-physical-hole={props.hole.holeNumber}
        data-course-hole-count={props.courseHoles?.length ?? 0}
        data-route-key={props.routeKey}
        data-user-lat={props.userPosition?.lat}
        data-user-accuracy={props.userAccuracyMeters ?? undefined}
        data-test-location-enabled={props.testLocationEnabled ? 'true' : 'false'}
        data-suggestion-clubs={props.suggestionClubs?.map((club) => club.shortLabel).join(',') ?? ''}
      >
        Google satellite map
      </div>
    );
  },
}));

const mockedUseRouter = useRouter as jest.Mock;
const mockedUseSession = useSession as jest.Mock;
const mockedUseMessage = useMessage as jest.Mock;
const mockedCaptureClientEvent = captureClientEvent as jest.Mock;
const mockGetCurrentPosition = jest.fn();
const mockWatchPosition = jest.fn();
const mockClearWatch = jest.fn();

function apiResponse(data: unknown): Response {
  return {
    ok: true,
    json: async () => data,
  } as Response;
}

function errorResponse(message: string): Response {
  return {
    ok: false,
    json: async () => ({ message }),
  } as Response;
}

function liveGpsMapping(holeNumbers = [1, 2]) {
  return {
    availability: {
      courseId: '11',
      available: true,
      coverage: 'full',
      expectedHoleNumbers: holeNumbers,
      availableHoleNumbers: holeNumbers,
      unavailableHoleNumbers: [],
      reason: 'available',
    },
    holes: holeNumbers.map((holeNumber) => ({
      holeNumber,
      tee: { lat: 49.9, lng: -97.1 },
      green: {
        front: { lat: 49.901, lng: -97.101 },
        center: { lat: 49.902, lng: -97.102 },
        back: { lat: 49.903, lng: -97.103 },
      },
      targets: [],
    })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function makeSession(overrides: Partial<LiveRoundSession> = {}): LiveRoundSession {
  return {
    id: '500',
    user_id: '1',
    course_id: '11',
    tee_id: '12',
    final_round_id: null,
    status: 'ACTIVE',
    date: '2026-06-26T00:00:00.000Z',
    tee_segment: 'front9',
    round_context: 'real',
    notes: null,
    start_hole_number: 1,
    active_hole_number: 1,
    active_hole_pass: 1,
    active_step: 'SCORE',
    gpsEnabled: false,
    tracking_prefs: {
      fir: false,
      gir: false,
      chips: false,
      greenside_bunker_shots: false,
      putts: false,
      penalties: false,
    },
    started_at: '2026-06-26T12:00:00.000Z',
    last_saved_at: '2026-06-26T12:00:00.000Z',
    completed_at: null,
    discarded_at: null,
    created_at: '2026-06-26T12:00:00.000Z',
    updated_at: '2026-06-26T12:00:00.000Z',
    course: {
      id: '11',
      club_name: 'GolfIQ Club',
      course_name: 'North',
    },
    tee: {
      id: '12',
      tee_name: 'White',
      gender: 'male',
      number_of_holes: 18,
      par_total: 72,
      course_rating: 36,
      slope_rating: 120,
    },
    available_tee_segments: [
      { value: 'full', label: '18 Holes' },
      { value: 'front9', label: 'Front 9' },
      { value: 'back9', label: 'Back 9' },
    ],
    final_round: null,
    hole_drafts: [{
      id: '1001',
      session_id: '500',
      hole_id: '101',
      hole_number: 1,
      display_hole_number: 1,
      pass: 1,
      score: 4,
      fir_hit: null,
      fir_direction: null,
      gir_hit: null,
      gir_direction: null,
      putts: null,
      penalties: null,
      chips: null,
      greenside_bunker_shots: null,
      created_at: '2026-06-26T12:00:00.000Z',
      updated_at: '2026-06-26T12:00:00.000Z',
      hole: {
        id: '101',
        hole_number: 1,
        par: 4,
        yardage: 400,
        handicap: 1,
      },
    }],
    ...overrides,
  };
}

function makeTwoHoleSession(overrides: Partial<LiveRoundSession> = {}): LiveRoundSession {
  const session = makeSession();
  const firstDraft = session.hole_drafts[0];
  const secondDraft = {
    ...firstDraft,
    id: '1002',
    hole_id: '102',
    hole_number: 2,
    display_hole_number: 2,
    score: null,
    hole: {
      ...firstDraft.hole!,
      id: '102',
      hole_number: 2,
      par: 3,
      yardage: 165,
      handicap: 3,
    },
  };

  return {
    ...session,
    hole_drafts: [firstDraft, secondDraft],
    ...overrides,
  };
}

function makeEighteenHoleSession(overrides: Partial<LiveRoundSession> = {}): LiveRoundSession {
  const session = makeSession({
    tee_segment: 'full',
    tee: {
      ...makeSession().tee!,
      course_rating: 72,
    },
  });
  const firstDraft = session.hole_drafts[0];

  return {
    ...session,
    hole_drafts: Array.from({ length: 18 }, (_, index) => {
      const holeNumber = index + 1;
      return {
        ...firstDraft,
        id: String(1000 + holeNumber),
        hole_id: String(100 + holeNumber),
        hole_number: holeNumber,
        display_hole_number: holeNumber,
        score: holeNumber === 1 ? 4 : null,
        hole: {
          ...firstDraft.hole!,
          id: String(100 + holeNumber),
          hole_number: holeNumber,
          par: holeNumber % 3 === 0 ? 5 : holeNumber % 2 === 0 ? 3 : 4,
          yardage: 350 + holeNumber,
          handicap: holeNumber,
        },
      };
    }),
    ...overrides,
  };
}

describe('LiveRoundSessionClient autosave navigation', () => {
  const push = jest.fn();
  const replace = jest.fn();
  const showConfirm = jest.fn();

  beforeAll(() => {
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    mockedUseRouter.mockReturnValue({ push, replace });
    mockedUseSession.mockReturnValue({ status: 'authenticated', data: { user: { id: '1' } } });
    mockedUseMessage.mockReturnValue({ showConfirm });
    mockWatchPosition.mockReturnValue(77);
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: mockGetCurrentPosition,
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
      },
    });
  });

  it('waits for a pending round tag save before leaving the live round', async () => {
    const initialSession = makeSession();
    const savedSession = makeSession({
      round_context: 'practice',
      last_saved_at: '2026-06-26T12:01:00.000Z',
      updated_at: '2026-06-26T12:01:00.000Z',
    });
    const contextSave = deferred<Response>();
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (!init?.method) {
        return Promise.resolve(apiResponse({ session: initialSession }));
      }
      if (init.method === 'PATCH' && url.endsWith('/api/rounds/live/sessions/500')) {
        return contextSave.promise;
      }
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Review Round' }));
    await screen.findByText('Round Summary');
    expect(screen.getByRole('heading', { name: 'GolfIQ Club - North' })).toBeInTheDocument();
    expect(screen.getByText('2026-06-26')).toBeInTheDocument();
    expect(document.querySelector('.live-round-header-meta')).toHaveTextContent('Front 9');
    expect(screen.getByText('White')).toBeInTheDocument();
    expect(screen.getByText('36.0 / 120')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tag +' }));
    fireEvent.click(screen.getByRole('button', { name: 'Practice Round' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestLiveRoundNavigation({ path: '/dashboard' })).toBe(true);
    expect(showConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Leave live round?',
      onConfirm: expect.any(Function),
    }));

    const confirmOptions = showConfirm.mock.calls.at(-1)?.[0];
    let confirmPromise!: Promise<void>;
    act(() => {
      confirmPromise = confirmOptions.onConfirm();
    });
    expect(push).not.toHaveBeenCalled();

    await act(async () => {
      contextSave.resolve(apiResponse({ session: savedSession }));
      await confirmPromise;
    });

    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('replaces to rounds when header back is confirmed', async () => {
    global.fetch = jest.fn().mockResolvedValue(apiResponse({ session: makeSession() })) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);
    await screen.findByRole('button', { name: 'Review Round' });

    expect(requestLiveRoundNavigation({ back: true })).toBe(true);
    const confirmOptions = showConfirm.mock.calls.at(-1)?.[0];

    await act(async () => {
      await confirmOptions.onConfirm();
    });

    expect(replace).toHaveBeenCalledWith('/rounds');
    expect(consumeLiveRoundExitRedirect('500')).toBe(true);
  });

  it('redirects stale live round history entries back to rounds once', async () => {
    markLiveRoundExitRedirect('500');
    global.fetch = jest.fn().mockResolvedValue(apiResponse({ session: makeSession() })) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/rounds'));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(consumeLiveRoundExitRedirect('500')).toBe(false);
  });

  it('omits progress UI and hides unavailable hole handicap', async () => {
    const session = makeSession();
    session.hole_drafts[0].hole!.handicap = null;
    global.fetch = jest.fn().mockResolvedValue(apiResponse({ session })) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    await screen.findByText('Yards');
    expect(screen.queryByText(/Scored/)).not.toBeInTheDocument();
    expect(document.querySelector('.live-round-progress-bar')).not.toBeInTheDocument();
    expect(document.querySelector('.live-round-save-indicator')).not.toBeInTheDocument();
    expect(screen.queryByText(/HCP/)).not.toBeInTheDocument();
    expect(document.querySelector('.live-round-hole-summary')).toHaveClass('without-handicap');
    expect(document.querySelector('.live-round-topbar')).not.toBeInTheDocument();
    expect(screen.queryByText('GolfIQ Club - North')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-06-26')).not.toBeInTheDocument();
    expect(screen.queryByText('White')).not.toBeInTheDocument();
    expect(screen.queryByText('36.0 / 120')).not.toBeInTheDocument();
    expect(mockLiveGpsMapMount).not.toHaveBeenCalled();
  });

  it('fetches and renders the active physical hole map, then logs the score on the same hole', async () => {
    const initialSession = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    const movedSession = makeSession({ gpsEnabled: true, active_step: 'SCORE' });
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/gps/live/course/11') return Promise.resolve(apiResponse(liveGpsMapping()));
      if (url === '/api/my-bag?mode=clubs') return Promise.resolve(apiResponse({ clubs: [] }));
      if (!init?.method) return Promise.resolve(apiResponse({ session: initialSession }));
      if (init.method === 'PATCH') return Promise.resolve(apiResponse({ session: movedSession }));
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    expect(await screen.findByTestId('live-gps-map')).toHaveAttribute('data-physical-hole', '1');
    expect(screen.getByTestId('live-gps-map')).toHaveAttribute('data-course-hole-count', '2');
    expect(document.querySelector('.live-round-gps-fullscreen')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/gps/live/course/11', expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }));
    expect(screen.queryByRole('button', { name: 'Use My Location' })).not.toBeInTheDocument();
    expect(screen.queryByText('GolfIQ Club - North')).not.toBeInTheDocument();
    expect(screen.getByText('Par 4 · 400 yd · HCP 1')).toBeInTheDocument();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.gpsMapLoaded,
      expect.objectContaining({
        source_surface: 'live_round',
        live_session_id: '500',
        course_id: '11',
        map_provider: 'google_maps',
      }),
      expect.objectContaining({ sourcePage: '/rounds/live/[sessionId]' }),
    );
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.gpsHoleViewed,
      expect.objectContaining({
        source_surface: 'live_round',
        live_session_id: '500',
        active_display_hole_number: 1,
        active_physical_hole_number: 1,
        mapped_hole_number: 1,
      }),
      expect.objectContaining({ sourcePage: '/rounds/live/[sessionId]' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Log Score/ }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.gpsLogScoreTapped,
      expect.objectContaining({
        source_surface: 'live_round',
        live_session_id: '500',
        active_display_hole_number: 1,
      }),
      expect.objectContaining({ sourcePage: '/rounds/live/[sessionId]' }),
    );
    const patchRequest = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    const patchBody = JSON.parse(patchRequest?.[1]?.body as string);
    expect(patchBody).toEqual(expect.objectContaining({
      active_hole_number: 1,
      active_hole_pass: 1,
      active_step: 'SCORE',
    }));
  });

  it('loads My Bag once for live GPS club suggestions', async () => {
    const initialSession = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    const movedSession = makeSession({ gpsEnabled: true, active_step: 'SCORE' });
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/gps/live/course/11') return Promise.resolve(apiResponse(liveGpsMapping()));
      if (url === '/api/my-bag?mode=clubs') {
        return Promise.resolve(apiResponse({
          clubs: [
            {
              clubDefinitionId: '10',
              carryYards: 250,
              clubDefinition: { shortLabel: 'DR', catalogueOrder: 10 },
            },
            {
              clubDefinitionId: '20',
              carryYards: 160,
              clubDefinition: { shortLabel: '7I', catalogueOrder: 280 },
            },
          ],
        }));
      }
      if (!init?.method) return Promise.resolve(apiResponse({ session: initialSession }));
      if (init.method === 'PATCH') return Promise.resolve(apiResponse({ session: movedSession }));
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    const map = await screen.findByTestId('live-gps-map');
    await waitFor(() => expect(map).toHaveAttribute('data-suggestion-clubs', 'DR,7I'));
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/my-bag?mode=clubs')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Log Score/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/my-bag?mode=clubs')).toHaveLength(1);
  });

  it('keeps one GPS map mounted across score entry and the next hole', async () => {
    const initialSession = makeTwoHoleSession({ gpsEnabled: true, active_step: 'GPS' });
    const scoreSession = makeTwoHoleSession({ gpsEnabled: true, active_step: 'SCORE' });
    const nextGpsSession = makeTwoHoleSession({
      gpsEnabled: true,
      active_step: 'GPS',
      active_hole_number: 2,
    });
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/gps/live/course/11') return Promise.resolve(apiResponse(liveGpsMapping()));
      if (!init?.method) return Promise.resolve(apiResponse({ session: initialSession }));
      if (init.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        return Promise.resolve(apiResponse({
          session: body.active_hole_number === 2 ? nextGpsSession : scoreSession,
        }));
      }
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    const firstMap = await screen.findByTestId('live-gps-map');
    expect(firstMap).toHaveAttribute('data-route-key', '1001');
    expect(mockLiveGpsMapMount).toHaveBeenCalledTimes(1);
    const handlePosition = mockWatchPosition.mock.calls[0][0] as PositionCallback;
    act(() => {
      handlePosition({
        coords: { latitude: 49.9, longitude: -97.1, accuracy: 8 },
        timestamp: 1000,
      } as GeolocationPosition);
    });
    expect(firstMap).toHaveAttribute('data-user-lat', '49.9');

    fireEvent.click(screen.getByRole('button', { name: /Log Score/ }));

    await screen.findByRole('button', { name: /Next Hole/ });
    expect(firstMap.closest('.live-round-gps-fullscreen')).toHaveClass('is-hidden');
    expect(firstMap).toHaveAttribute('data-user-lat', '49.9');
    expect(mockClearWatch).toHaveBeenCalledWith(77);
    expect(mockLiveGpsMapMount).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Next Hole/ }));

    await waitFor(() => {
      expect(screen.getByTestId('live-gps-map')).toHaveAttribute('data-route-key', '1002');
    });
    expect(screen.getByTestId('live-gps-map')).toHaveAttribute('data-physical-hole', '2');
    expect(screen.getByTestId('live-gps-map')).toHaveAttribute('data-user-lat', '49.9');
    expect(screen.getByTestId('live-gps-map').closest('.live-round-gps-fullscreen')).not.toHaveClass('is-hidden');
    expect(mockLiveGpsMapMount).toHaveBeenCalledTimes(1);
    expect(mockWatchPosition).toHaveBeenCalledTimes(2);
  });

  it('opens a GPS hole picker and jumps directly to a selected hole', async () => {
    const initialSession = makeTwoHoleSession({ gpsEnabled: true, active_step: 'GPS' });
    const secondGpsSession = makeTwoHoleSession({
      gpsEnabled: true,
      active_step: 'GPS',
      active_hole_number: 2,
    });
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/gps/live/course/11') return Promise.resolve(apiResponse(liveGpsMapping()));
      if (!init?.method) return Promise.resolve(apiResponse({ session: initialSession }));
      if (init.method === 'PATCH') return Promise.resolve(apiResponse({ session: secondGpsSession }));
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    expect(await screen.findByTestId('live-gps-map')).toHaveAttribute('data-route-key', '1001');
    fireEvent.click(screen.getByRole('button', { name: /Hole 1/ }));
    expect(screen.getByRole('dialog', { name: /Choose Hole/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => {
      expect(screen.getByTestId('live-gps-map')).toHaveAttribute('data-route-key', '1002');
    });
    const patchRequest = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    const patchBody = JSON.parse(patchRequest?.[1]?.body as string);
    expect(patchBody).toEqual(expect.objectContaining({
      active_hole_number: 2,
      active_hole_pass: 1,
      active_step: 'GPS',
    }));
    expect(screen.queryByRole('dialog', { name: /Choose Hole/ })).not.toBeInTheDocument();
  });

  it('shows GPS hole picker options in numeric order for a back-nine start', async () => {
    const session = makeEighteenHoleSession({
      gpsEnabled: true,
      active_step: 'GPS',
      start_hole_number: 10,
      active_hole_number: 10,
    });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? liveGpsMapping(Array.from({ length: 18 }, (_, index) => index + 1)) : { session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    await screen.findByTestId('live-gps-map');
    fireEvent.click(screen.getByRole('button', { name: /Hole 10/ }));
    const dialog = screen.getByRole('dialog', { name: /Choose Hole/ });
    const holeButtons = Array.from(dialog.querySelectorAll('.live-round-gps-hole-picker-option'));

    expect(holeButtons.map((button) => button.textContent)).toEqual([
      '1', '2', '3', '4', '5', '6',
      '7', '8', '9', '10', '11', '12',
      '13', '14', '15', '16', '17', '18',
    ]);
    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute('aria-current', 'true');
  });

  it('opens review from the GPS hole picker flag action', async () => {
    const session = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? liveGpsMapping() : { session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    await screen.findByTestId('live-gps-map');
    fireEvent.click(screen.getByRole('button', { name: /Hole 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Review/ }));

    expect(await screen.findByText('Round Summary')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Choose Hole/ })).not.toBeInTheDocument();
  });

  it('reuses the mounted GPS map after review and a jump back to the hole', async () => {
    const gpsSession = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    const scoreSession = makeSession({ gpsEnabled: true, active_step: 'SCORE' });
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/gps/live/course/11') return Promise.resolve(apiResponse(liveGpsMapping()));
      if (!init?.method) return Promise.resolve(apiResponse({ session: gpsSession }));
      if (init.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        return Promise.resolve(apiResponse({
          session: body.active_step === 'GPS' ? gpsSession : scoreSession,
        }));
      }
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    await screen.findByTestId('live-gps-map');
    expect(mockLiveGpsMapMount).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Log Score/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Review Round/ }));

    await screen.findByText('Round Summary');
    expect(mockLiveGpsMapMount).toHaveBeenCalledTimes(1);
    expect(mockClearWatch).toHaveBeenCalledWith(77);

    fireEvent.click(screen.getByRole('button', { name: /Hole 1/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Hole GPS/ }));

    await waitFor(() => {
      expect(screen.getByTestId('live-gps-map').closest('.live-round-gps-fullscreen')).not.toHaveClass('is-hidden');
    });
    expect(mockLiveGpsMapMount).toHaveBeenCalledTimes(1);
  });

  it('starts location watching automatically and sends updates to the map', async () => {
    const session = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? liveGpsMapping() : { session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));
    const handlePosition = mockWatchPosition.mock.calls[0][0] as PositionCallback;
    act(() => {
      handlePosition({
        coords: { latitude: 49.9, longitude: -97.1, accuracy: 8 },
      } as GeolocationPosition);
    });

    const map = await screen.findByTestId('live-gps-map');
    expect(map).toHaveAttribute('data-user-lat', '49.9');
    expect(map).toHaveAttribute('data-user-accuracy', '8');
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.gpsLocationAllowed,
      expect.objectContaining({
        source_surface: 'live_round',
        live_session_id: '500',
        location_source: 'watch_position',
      }),
      expect.objectContaining({ sourcePage: '/rounds/live/[sessionId]' }),
    );
  });

  it('enables draggable test GPS for the admin query flag', async () => {
    window.history.replaceState({}, '', '/rounds/live/500?gpsTestLocation=1');
    const session = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? liveGpsMapping() : { session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    expect(await screen.findByTestId('live-gps-map')).toHaveAttribute(
      'data-test-location-enabled',
      'true',
    );
    expect(screen.getByText('Test GPS · Drag Blue Dot')).toBeInTheDocument();
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it('ignores the test GPS query flag for non-admin users', async () => {
    window.history.replaceState({}, '', '/rounds/live/500?gpsTestLocation=1');
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '2' } },
    });
    const session = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? liveGpsMapping() : { session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    expect(await screen.findByTestId('live-gps-map')).toHaveAttribute(
      'data-test-location-enabled',
      'false',
    );
    expect(screen.queryByText('Test GPS · Drag Blue Dot')).not.toBeInTheDocument();
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
  });

  it('keeps the tee-based map usable when location permission is denied', async () => {
    const session = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? liveGpsMapping() : { session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    const handleError = mockWatchPosition.mock.calls[0][1] as PositionErrorCallback;
    act(() => {
      handleError({ code: 1 } as GeolocationPositionError);
    });

    expect(await screen.findByTestId('live-gps-map')).not.toHaveAttribute('data-user-lat');
    expect(screen.queryByText('Location unavailable. You can still use the hole map.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log Score/ })).toBeEnabled();
    expect(mockedCaptureClientEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.gpsLocationDenied,
      expect.objectContaining({
        source_surface: 'live_round',
        live_session_id: '500',
        location_source: 'watch_position',
        location_status: 'denied',
      }),
      expect.objectContaining({ sourcePage: '/rounds/live/[sessionId]' }),
    );
  });

  it('clears the location watch on the score step and never sends coordinates in API payloads', async () => {
    const initialSession = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    const movedSession = makeSession({ gpsEnabled: true, active_step: 'SCORE' });
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/gps/live/course/11') return Promise.resolve(apiResponse(liveGpsMapping()));
      if (!init?.method) return Promise.resolve(apiResponse({ session: initialSession }));
      if (init.method === 'PATCH') return Promise.resolve(apiResponse({ session: movedSession }));
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    const handlePosition = mockWatchPosition.mock.calls[0][0] as PositionCallback;
    act(() => {
      handlePosition({
        coords: { latitude: 49.9, longitude: -97.1, accuracy: 8 },
      } as GeolocationPosition);
    });
    fireEvent.click(screen.getByRole('button', { name: /Log Score/ }));

    await waitFor(() => expect(mockClearWatch).toHaveBeenCalledWith(77));
    const patchRequest = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    const payloadText = String(patchRequest?.[1]?.body);
    expect(payloadText).not.toContain('latitude');
    expect(payloadText).not.toContain('longitude');
    expect(payloadText).not.toContain('accuracy');
    expect(payloadText).not.toContain('49.9');
    expect(payloadText).not.toContain('-97.1');
  });

  it('clears the location watch when the live round view unmounts', async () => {
    const session = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? liveGpsMapping() : { session }),
    )) as typeof fetch;

    const { unmount } = render(<LiveRoundSessionClient sessionId="500" />);
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalledTimes(1));

    unmount();

    expect(mockClearWatch).toHaveBeenCalledWith(77);
  });

  it('uses physical hole geometry for a double-9 display hole', async () => {
    const doubleNineDraft = {
      ...makeSession().hole_drafts[0],
      display_hole_number: 10,
      hole_number: 1,
      pass: 2,
    };
    const session = makeSession({
      gpsEnabled: true,
      active_step: 'GPS',
      tee_segment: 'double9',
      active_hole_number: 10,
      active_hole_pass: 2,
      hole_drafts: [doubleNineDraft],
    });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? liveGpsMapping([1]) : { session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    expect(await screen.findByTestId('live-gps-map')).toHaveAttribute('data-physical-hole', '1');
    expect(screen.getByRole('button', { name: /Hole 10/ })).toBeInTheDocument();
    expect(screen.getByText('Physical Hole 1, Pass 2')).toBeInTheDocument();
  });

  it('shows the GPS fallback when the active physical hole is missing', async () => {
    const session = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? liveGpsMapping([2]) : { session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    expect(await screen.findByText('GPS unavailable for this hole.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log Score/ })).toBeEnabled();
  });

  it('shows the GPS fallback when mapping cannot be loaded', async () => {
    const session = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    global.fetch = jest.fn((url: string) => Promise.resolve(
      url === '/api/gps/live/course/11'
        ? errorResponse('Database error')
        : apiResponse({ session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    expect(await screen.findByText('GPS unavailable for this hole.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log Score/ })).toBeEnabled();
  });

  it('shows the GPS fallback for an unexpectedly partial mapping response', async () => {
    const session = makeSession({ gpsEnabled: true, active_step: 'GPS' });
    const partialMapping = liveGpsMapping([1]);
    partialMapping.availability.available = false;
    partialMapping.availability.coverage = 'partial';
    global.fetch = jest.fn((url: string) => Promise.resolve(
      apiResponse(url === '/api/gps/live/course/11' ? partialMapping : { session }),
    )) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    expect(await screen.findByText('GPS unavailable for this hole.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log Score/ })).toBeEnabled();
  });

  it('does not fetch mapping or render GPS for a score-only session', async () => {
    const session = makeSession();
    const fetchMock = jest.fn().mockResolvedValue(apiResponse({ session }));
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    await screen.findByText('Yards');
    expect(document.querySelector('.live-round-hole-summary')).toBeInTheDocument();
    expect(screen.queryByText('GolfIQ Club - North')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/gps/live/course/11', expect.anything());
    expect(screen.queryByTestId('live-gps-map')).not.toBeInTheDocument();
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it('lets a player switch a front 9 live round to 18 holes', async () => {
    const initialSession = makeSession();
    const expandedSession = makeTwoHoleSession({
      tee_segment: 'full',
      tee: {
        ...initialSession.tee!,
        course_rating: 72,
      },
    });
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (!init?.method) return Promise.resolve(apiResponse({ session: initialSession }));
      if (init.method === 'PATCH') {
        const body = init.body ? JSON.parse(init.body as string) : {};
        return Promise.resolve(apiResponse({ session: body.tee_segment === 'full' ? expandedSession : initialSession }));
      }
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    fireEvent.click(await screen.findByRole('button', { name: /Review Round/i }));
    expect(await screen.findByText('Round Summary')).toBeInTheDocument();

    const roundTypeSelect = await screen.findByRole('combobox', { name: /Round Type/i });
    fireEvent.change(roundTypeSelect, { target: { value: 'full' } });

    await waitFor(() => {
      const patchRequest = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patchRequest).toBeTruthy();
      expect(JSON.parse(patchRequest?.[1]?.body as string)).toEqual({ tee_segment: 'full' });
    });
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Round Type/i })).toHaveValue('full'));
    expect(screen.getByText('Round Summary')).toBeInTheDocument();
  });

  it('advances a GPS-enabled score screen to GPS on the next hole', async () => {
    const initialSession = makeSession({ gpsEnabled: true });
    initialSession.hole_drafts.push({
      ...initialSession.hole_drafts[0],
      id: '1002',
      hole_id: '102',
      hole_number: 2,
      display_hole_number: 2,
      score: null,
      hole: {
        id: '102',
        hole_number: 2,
        par: 3,
        yardage: 175,
        handicap: 2,
      },
    });
    const movedSession = makeSession({
      gpsEnabled: true,
      active_hole_number: 2,
      active_step: 'GPS',
      hole_drafts: initialSession.hole_drafts,
    });
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === '/api/gps/live/course/11') return Promise.resolve(apiResponse(liveGpsMapping()));
      if (!init?.method) return Promise.resolve(apiResponse({ session: initialSession }));
      if (init.method === 'PATCH') return Promise.resolve(apiResponse({ session: movedSession }));
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);
    const nextHoleButton = await screen.findByRole('button', { name: /Next Hole/ });
    expect(mockWatchPosition).not.toHaveBeenCalled();
    fireEvent.click(nextHoleButton);

    await screen.findByTestId('live-gps-map');
    const patchRequest = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    const patchBody = JSON.parse(patchRequest?.[1]?.body as string);
    expect(patchBody).toEqual(expect.objectContaining({
      active_hole_number: 2,
      active_hole_pass: 1,
      active_step: 'GPS',
    }));
  });

  it('waits for an active score save and advances from the first Next Hole tap', async () => {
    const initialSession = makeSession();
    initialSession.hole_drafts.push({
      ...initialSession.hole_drafts[0],
      id: '1002',
      hole_id: '102',
      hole_number: 2,
      display_hole_number: 2,
      score: null,
      hole: {
        id: '102',
        hole_number: 2,
        par: 3,
        yardage: 175,
        handicap: 2,
      },
    });
    const savedSession = makeSession({
      hole_drafts: initialSession.hole_drafts.map((draft) => (
        draft.id === '1001' ? { ...draft, score: 5 } : draft
      )),
    });
    const movedSession = makeSession({
      active_hole_number: 2,
      hole_drafts: savedSession.hole_drafts,
    });
    const holeSave = deferred<Response>();
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (!init?.method) return Promise.resolve(apiResponse({ session: initialSession }));
      if (init.method === 'POST' && url.endsWith('/holes')) return holeSave.promise;
      if (init.method === 'PATCH') return Promise.resolve(apiResponse({ session: movedSession }));
      throw new Error(`Unexpected request: ${init.method} ${url}`);
    });
    global.fetch = fetchMock as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    fireEvent.click(await screen.findByRole('button', { name: '+' }));
    const nextButton = screen.getByRole('button', { name: /Next Hole/ });
    fireEvent.click(nextButton);

    expect(nextButton).toBeDisabled();
    fireEvent.click(nextButton);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      holeSave.resolve(apiResponse({
        draft: savedSession.hole_drafts[0],
        session: savedSession,
      }));
    });

    await screen.findByRole('button', { name: /Review Round/ });
    const navigationRequests = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(navigationRequests).toHaveLength(1);
  });
});
