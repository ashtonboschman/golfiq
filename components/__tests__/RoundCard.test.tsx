/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoundCard from '@/components/RoundCard';

const round = {
  id: 1,
  club_name: 'MacGregor Town & Country Golf Club',
  course_name: 'MacGregor Town & Country Golf Club',
  city: 'MacGregor',
  state: 'MB',
  tee_name: 'White',
  number_of_holes: 9,
  date: '2026-08-20T00:00:00.000Z',
  score: 48,
  par: 35,
  net_score: 40,
  fir_hit: 2,
  gir_hit: 3,
  putts: 21,
  penalties: 4,
  notes: 'Test note',
};

describe('RoundCard', () => {
  it('shows a compact scoring summary with stacked location and date metadata', () => {
    const { container } = render(<RoundCard round={round} showHoles />);

    expect(screen.getByText('MacGregor, MB')).toBeInTheDocument();
    expect(screen.getByText('Aug 20, 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Score 48, +13 to par')).toBeInTheDocument();
    expect(screen.getByText('+13')).toBeInTheDocument();
    expect(screen.queryByText('To Par')).not.toBeInTheDocument();
    expect(screen.getByText('9 Holes')).toBeInTheDocument();
    expect(container.querySelectorAll('.roundcard-meta-item svg')).toHaveLength(2);
    expect(container.querySelector('.roundcard-header')).not.toHaveClass('has-three-tags');
  });

  it('marks three-pill headers for stacked mobile layout', () => {
    const { container } = render(
      <RoundCard round={{ ...round, round_context: 'scramble' as const }} showHoles />,
    );

    expect(screen.getByText('SCRAMBLE')).toBeInTheDocument();
    expect(container.querySelector('.roundcard-header')).toHaveClass('has-three-tags');
  });

  it('leaves detailed round statistics for the round details page', () => {
    render(<RoundCard round={round} />);

    expect(screen.queryByText('Net')).not.toBeInTheDocument();
    expect(screen.queryByText('FIR')).not.toBeInTheDocument();
    expect(screen.queryByText('GIR')).not.toBeInTheDocument();
    expect(screen.queryByText('Putts')).not.toBeInTheDocument();
    expect(screen.queryByText('Pen')).not.toBeInTheDocument();
    expect(screen.queryByText('Test note')).not.toBeInTheDocument();
  });
});
