/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import GameTrendsCard from '@/components/insights/GameTrendsCard';
import { resolveGameTrendsMode } from '@/lib/insights/gameTrends/resolve';
import { projectGameTrendsForViewer } from '@/lib/insights/gameTrends/presentation';
import type { TrendEvidenceRound } from '@/lib/insights/trendEvidence';

function round(index: number): TrendEvidenceRound {
  return {
    roundId: String(index + 1),
    date: new Date(Date.UTC(2026, 6, 15 - index)),
    createdAt: new Date(Date.UTC(2026, 6, 15 - index, 1)),
    holes: 18,
    roundContext: 'real',
    completed: true,
    score: index < 3 ? 86 : 92,
    toPar: index < 3 ? 14 : 20,
    sgPartialAnalysis: false,
    shortGameOpportunityEligible: true,
    components: { off_the_tee: 0.7, approach: 0.1, short_game: 0, putting: -0.1, penalties: -0.8 },
  };
}

function dto(count = 5) {
  return projectGameTrendsForViewer(resolveGameTrendsMode({ rounds: Array.from({ length: count }, (_, index) => round(index)), mode: '18' }), 'free');
}

function dtoWithComponents(components: TrendEvidenceRound['components']) {
  const source = Array.from({ length: 5 }, (_, index) => ({ ...round(index), components }));
  return projectGameTrendsForViewer(resolveGameTrendsMode({ rounds: source, mode: '18' }), 'free');
}

describe('GameTrendsCard', () => {
  it('renders Strength and Opportunity as separate adaptive message cards', () => {
    const { container } = render(<GameTrendsCard trends={dto()} mode="18" loading={false} error={null} onRetry={jest.fn()} />);
    expect(screen.getByText('Recent Form')).toBeInTheDocument();
    expect(screen.queryByText('Game Profile')).not.toBeInTheDocument();
    expect(screen.getByText('Strength')).toBeInTheDocument();
    expect(screen.getByText('Opportunity')).toBeInTheDocument();
    expect(screen.getByText('Stability')).toBeInTheDocument();
    expect(container.querySelector('[data-icon-role="recent_form"]')).toBeInTheDocument();
    expect(container.querySelector('[data-icon-role="strength"]')).toBeInTheDocument();
    expect(container.querySelector('[data-icon-role="opportunity"]')).toBeInTheDocument();
    expect(container.querySelector('[data-icon-role="stable"]')).toBeInTheDocument();
    expect(container.querySelectorAll('.game-trends-message.insight-message')).toHaveLength(4);
    container.querySelectorAll('.game-trends-message-content').forEach((message) => {
      expect(message.querySelector(':scope > .game-trends-message-icon')).toBeInTheDocument();
      expect(message.querySelector(':scope > .game-trends-row-heading > h4')).toBeInTheDocument();
      expect(message.querySelector(':scope > .game-trends-copy')).toBeInTheDocument();
    });
    expect(container.querySelector('.game-trends-copy .secondary-text')).toBeNull();
    container.querySelectorAll('.game-trends-copy').forEach((copy) => {
      expect(copy.querySelectorAll(':scope > p')).toHaveLength(1);
      expect(copy.querySelector(':scope > p')).toHaveClass('game-trends-conclusion');
    });
  });

  it('shows Early Signal and free-safe copy without SG terminology', () => {
    const { container } = render(<GameTrendsCard trends={dto(5)} mode="18" loading={false} error={null} onRetry={jest.fn()} />);
    expect(screen.getByText('Early Signal')).toHaveClass('game-trends-context-label');
    expect(container.textContent).not.toMatch(/strokes gained|gaining strokes|losing strokes|\bSG\b/i);
  });

  it('renders a quiet mode-empty state and retry state', () => {
    const view = render(<GameTrendsCard trends={projectGameTrendsForViewer(resolveGameTrendsMode({ rounds: [], mode: '9' }), 'free')} mode="9" loading={false} error={null} onRetry={jest.fn()} />);
    expect(screen.getByText('No 9-hole rounds yet')).toBeInTheDocument();
    expect(screen.getByText('Add a 9-hole round to build this view.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Round' })).not.toBeInTheDocument();
    view.rerender(<GameTrendsCard trends={null} mode="9" loading={false} error="Game Trends could not load." onRetry={jest.fn()} />);
    expect(screen.getByText('GolfIQ couldn’t load Game Trends right now. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText('Game Trends could not load.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('uses grammatically correct mode-specific empty-state copy', () => {
    const empty = projectGameTrendsForViewer(resolveGameTrendsMode({ rounds: [], mode: '18' }), 'free');
    render(<GameTrendsCard trends={empty} mode="18" loading={false} error={null} onRetry={jest.fn()} />);

    expect(screen.getByText('Add an 18-hole round to build this view.')).toBeInTheDocument();
  });

  it('renders one-sided, Balanced and Building profile states without forcing missing roles', () => {
    const strengthOnly = dtoWithComponents({ off_the_tee: 0.8, approach: 0.4, short_game: 0.3, putting: 0.2, penalties: 0.1 });
    const opportunityOnly = dtoWithComponents({ off_the_tee: -0.1, approach: -0.2, short_game: -0.3, putting: -0.4, penalties: -0.8 });
    const balanced = dtoWithComponents({ off_the_tee: 0.1, approach: 0.1, short_game: 0.1, putting: 0.1, penalties: 0.1 });
    const view = render(<GameTrendsCard trends={strengthOnly} mode="18" loading={false} error={null} onRetry={jest.fn()} />);
    expect(screen.getByText('Strength')).toBeInTheDocument();
    expect(screen.queryByText('Opportunity')).not.toBeInTheDocument();
    expect(screen.queryByText('Game Profile')).not.toBeInTheDocument();
    expect(view.container.querySelectorAll('.game-trends-message')).toHaveLength(3);

    view.rerender(<GameTrendsCard trends={opportunityOnly} mode="18" loading={false} error={null} onRetry={jest.fn()} />);
    expect(screen.queryByText('Strength')).not.toBeInTheDocument();
    expect(screen.getByText('Opportunity')).toBeInTheDocument();
    expect(view.container.querySelectorAll('.game-trends-message')).toHaveLength(3);

    view.rerender(<GameTrendsCard trends={balanced} mode="18" loading={false} error={null} onRetry={jest.fn()} />);
    expect(screen.getByText('Balanced Game')).toBeInTheDocument();
    expect(view.container.querySelectorAll('.game-trends-message')).toHaveLength(3);

    view.rerender(<GameTrendsCard trends={dto(2)} mode="18" loading={false} error={null} onRetry={jest.fn()} />);
    expect(screen.getByText('Building Your Game Profile')).toBeInTheDocument();
    expect(screen.queryByText('Strength')).not.toBeInTheDocument();
    expect(screen.queryByText('Opportunity')).not.toBeInTheDocument();
  });

  it('shows one aggregate confidence badge with explanatory copy', () => {
    const { container } = render(<GameTrendsCard trends={dto()} mode="18" loading={false} error={null} onRetry={jest.fn()} />);
    const badge = screen.getByRole('button', { name: /Game Trends confidence:/ });
    expect(badge).toBeInTheDocument();
    expect(container.querySelector('.game-trends-inline-confidence')).toBeNull();
    fireEvent.click(badge);
    expect(screen.getByText('Game Trends Confidence')).toBeInTheDocument();
  });
});
