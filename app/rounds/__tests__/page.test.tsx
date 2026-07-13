/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import RoundsPage from '@/app/rounds/page';
import {
  consumeLiveRoundExitRedirect,
  markLiveRoundExitRedirect,
} from '@/lib/rounds/liveRoundNavigation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/app/providers', () => ({
  useMessage: jest.fn(),
}));

jest.mock('@/components/RoundCard', () => ({
  __esModule: true,
  default: function MockRoundCard({ round }: { round: { club_name: string; course_name: string } }) {
    return <div>Completed {round.club_name} {round.course_name}</div>;
  },
}));

jest.mock('@/components/skeleton/PageSkeletons', () => ({
  RoundListSkeleton: () => <div role="status">Loading Rounds</div>,
}));

const mockedUseRouter = useRouter as jest.Mock;
const mockedUseSession = useSession as jest.Mock;
const mockedUseMessage = useMessage as jest.Mock;
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

function liveSessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: '500',
    user_id: '1',
    course_id: '11',
    tee_id: '12',
    final_round_id: null,
    status: 'ACTIVE',
    date: '2026-07-13T00:00:00.000Z',
    tee_segment: 'back9',
    round_context: 'real',
    notes: null,
    start_hole_number: 10,
    active_hole_number: 10,
    active_hole_pass: 1,
    active_step: 'GPS',
    gpsEnabled: true,
    tracking_prefs: {
      fir: false,
      gir: false,
      chips: false,
      greenside_bunker_shots: false,
      putts: false,
      penalties: false,
    },
    started_at: '2026-07-13T12:00:00.000Z',
    last_saved_at: '2026-07-13T12:05:00.000Z',
    completed_at: null,
    discarded_at: null,
    created_at: '2026-07-13T12:00:00.000Z',
    updated_at: '2026-07-13T12:05:00.000Z',
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
      course_rating: 72,
      slope_rating: 120,
    },
    available_tee_segments: [],
    final_round: null,
    hole_drafts: [],
    ...overrides,
  };
}

describe('/rounds page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    mockedUseRouter.mockReturnValue({ push, replace });
    mockedUseSession.mockReturnValue({ status: 'authenticated', data: { user: { id: '1' } } });
    mockedUseMessage.mockReturnValue({ showMessage, clearMessage, showConfirm });
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: class MockIntersectionObserver {
        observe = jest.fn();
        disconnect = jest.fn();
      },
    });
  });

  it('shows active live rounds above completed rounds and resumes them', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/rounds/live/sessions') {
        return Promise.resolve(apiResponse({
          sessions: [liveSessionPayload()],
        }));
      }

      if (url.startsWith('/api/rounds?')) {
        return Promise.resolve(apiResponse({
          rounds: [{
            id: '700',
            date: '2026-07-12T00:00:00.000Z',
            score: 80,
            fir_hit: null,
            gir_hit: null,
            putts: null,
            penalties: null,
            net_score: null,
            round_context: 'real',
            hole_by_hole: true,
            course: {
              club_name: 'Completed Club',
              course_name: 'South',
            },
            location: {
              city: 'Winnipeg',
              state: 'MB',
            },
            tee: {
              id: '14',
              tee_name: 'Blue',
              number_of_holes: 18,
              par_total: 72,
            },
          }],
        }));
      }

      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    render(<RoundsPage />);

    expect(await screen.findByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('GolfIQ Club - North')).toBeInTheDocument();
    expect(screen.getByText('Hole 10')).toBeInTheDocument();
    expect(await screen.findByText('Completed Completed Club South')).toBeInTheDocument();

    markLiveRoundExitRedirect('500');
    fireEvent.click(screen.getByRole('button', { name: 'Continue live round' }));

    expect(push).toHaveBeenCalledWith('/rounds/live/500');
    expect(consumeLiveRoundExitRedirect('500')).toBe(false);
  });

  it('confirms and discards an active live round', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/rounds/live/sessions') {
        return Promise.resolve(apiResponse({
          sessions: [liveSessionPayload()],
        }));
      }

      if (url === '/api/rounds/live/sessions/500/discard' && init?.method === 'POST') {
        return Promise.resolve(apiResponse({
          session: liveSessionPayload({ status: 'DISCARDED' }),
        }));
      }

      if (url.startsWith('/api/rounds?')) {
        return Promise.resolve(apiResponse({ rounds: [] }));
      }

      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    render(<RoundsPage />);

    expect(await screen.findByText('GolfIQ Club - North')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard live round' }));

    expect(showConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Discard live round?',
      confirmText: 'Discard',
      confirmVariant: 'danger',
    }));

    await act(async () => {
      await showConfirm.mock.calls[0][0].onConfirm();
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/rounds/live/sessions/500/discard', {
        method: 'POST',
      });
      expect(screen.queryByText('GolfIQ Club - North')).not.toBeInTheDocument();
    });
  });
});
