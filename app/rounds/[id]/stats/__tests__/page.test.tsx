/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoundStatsPage from '@/app/rounds/[id]/stats/page';
import { useSession } from 'next-auth/react';
import { useSubscription } from '@/hooks/useSubscription';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockShowMessage = jest.fn();
const mockClearMessage = jest.fn();
const mockShowConfirm = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  useParams: () => ({
    id: '123',
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    clearMessage: mockClearMessage,
    showConfirm: mockShowConfirm,
  }),
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: jest.fn(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/RoundInsights', () => ({
  __esModule: true,
  default: () => <div data-testid="round-insights">Round Insights</div>,
}));

jest.mock('@/components/skeleton/PageSkeletons', () => ({
  RoundStatsPageSkeleton: () => <div data-testid="round-stats-skeleton" />,
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedUseSubscription = useSubscription as unknown as jest.Mock;

const statsPayload = {
  round_id: '123',
  course_name: 'Pebble Beach',
  tee_name: 'Blue',
  course_rating: 72.1,
  slope_rating: 130,
  date: '2026-02-13T00:00:00.000Z',
  number_of_holes: 18,
  total_score: 78,
  total_par: 72,
  score_to_par: 6,
  score_to_par_formatted: '+6',
  net_to_par_formatted: '+4',
  handicap_at_round: 12.3,
  greens_in_regulation: 8,
  gir_percentage: '44',
  total_holes_for_gir: 18,
  fairways_hit: 7,
  fir_percentage: '50',
  total_holes_for_fir: 14,
  total_putts: 33,
  putts_per_hole: '1.8',
  total_penalties: 1,
  scoring_by_par: [],
  hole_details: [],
  notes: null,
  hole_by_hole: false,
  sg_total: 0.8,
  sg_off_tee: 0.2,
  sg_approach: 0.3,
  sg_putting: 0.1,
  sg_penalties: 0.0,
  sg_residual: 0.2,
  confidence: 'MEDIUM',
  message: 'Solid round',
};

describe('/rounds/[id]/stats page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1' } },
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stats: statsPayload }),
    });
  });

  it('shows strokes gained summary for premium users', async () => {
    mockedUseSubscription.mockReturnValue({
      isPremium: true,
      loading: false,
    });

    render(<RoundStatsPage />);

    await screen.findByText('Pebble Beach');
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Off Tee')).toBeInTheDocument();
    expect(screen.getByText('Residual')).toBeInTheDocument();
  });

  it('does not render strokes gained summary for free users', async () => {
    mockedUseSubscription.mockReturnValue({
      isPremium: false,
      loading: false,
    });

    render(<RoundStatsPage />);

    await screen.findByText('Pebble Beach');
    expect(screen.queryByText('Off Tee')).not.toBeInTheDocument();
  });

  it('fetches round stats endpoint and does not call profile endpoint', async () => {
    mockedUseSubscription.mockReturnValue({
      isPremium: true,
      loading: false,
    });

    render(<RoundStatsPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/rounds/123/stats');
    });

    const allCalls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(allCalls.some((url) => url.includes('/api/users/profile'))).toBe(false);
  });
});
