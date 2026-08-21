/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LeaderboardCard from '@/components/LeaderboardCard';

describe('LeaderboardCard', () => {
  it('displays an even-par best score as E', () => {
    render(
      <LeaderboardCard
        user={{
          user_id: 1,
          first_name: 'Test',
          last_name: 'Golfer',
          handicap: 10,
          average_score: 2.5,
          best_score: 0,
        }}
        rank={1}
        isCurrentUser
      />,
    );

    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.queryByText('-0')).not.toBeInTheDocument();
  });
});
