/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import LiveRoundSessionClient from '@/components/rounds/live/LiveRoundSessionClient';
import { requestLiveRoundNavigation } from '@/lib/rounds/liveRoundNavigation';
import type { LiveRoundSession } from '@/components/rounds/live/types';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/app/providers', () => ({
  useMessage: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.Mock;
const mockedUseSession = useSession as jest.Mock;
const mockedUseMessage = useMessage as jest.Mock;

function apiResponse(data: unknown): Response {
  return {
    ok: true,
    json: async () => data,
  } as Response;
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
    mockedUseRouter.mockReturnValue({ push, replace });
    mockedUseSession.mockReturnValue({ status: 'authenticated', data: { user: { id: '1' } } });
    mockedUseMessage.mockReturnValue({ showConfirm });
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

  it('skips the synthetic history guard when header back is confirmed', async () => {
    global.fetch = jest.fn().mockResolvedValue(apiResponse({ session: makeSession() })) as typeof fetch;
    const historyGo = jest.spyOn(window.history, 'go').mockImplementation(() => undefined);

    render(<LiveRoundSessionClient sessionId="500" />);
    await screen.findByText('GolfIQ Club - North');

    expect(requestLiveRoundNavigation({ back: true })).toBe(true);
    const confirmOptions = showConfirm.mock.calls.at(-1)?.[0];

    await act(async () => {
      await confirmOptions.onConfirm();
    });

    expect(historyGo).toHaveBeenCalledWith(-2);
    historyGo.mockRestore();
  });

  it('omits progress UI and hides unavailable hole handicap', async () => {
    const session = makeSession();
    session.hole_drafts[0].hole!.handicap = null;
    global.fetch = jest.fn().mockResolvedValue(apiResponse({ session })) as typeof fetch;

    render(<LiveRoundSessionClient sessionId="500" />);

    await screen.findByText('GolfIQ Club - North');
    expect(screen.queryByText(/Scored/)).not.toBeInTheDocument();
    expect(document.querySelector('.live-round-progress-bar')).not.toBeInTheDocument();
    expect(document.querySelector('.live-round-save-indicator')).toHaveClass('is-idle');
    expect(screen.queryByText('HCP')).not.toBeInTheDocument();
    expect(document.querySelector('.live-round-hole-summary')).toHaveClass('without-handicap');
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

    await screen.findByRole('button', { name: /Review Missing Scores/ });
    const navigationRequests = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(navigationRequests).toHaveLength(1);
  });
});
