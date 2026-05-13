/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MissTendenciesChart from '@/components/MissTendenciesChart';

jest.mock('react-chartjs-2', () => ({
  __esModule: true,
  Bar: () => <div data-testid="miss-tendencies-bar-chart">bar-chart</div>,
}));

describe('MissTendenciesChart', () => {
  const baseProps = {
    accentColor: '#2D6CFF',
    accentHighlight: '#36ad64',
    surfaceColor: '#171C26',
    textColor: '#EDEFF2',
    gridColor: '#2A313D',
  };

  it('renders empty-state copy when data is missing', () => {
    render(<MissTendenciesChart {...baseProps} data={null} />);

    expect(screen.getByText('FIR & GIR Miss Tendencies')).toBeInTheDocument();
    expect(
      screen.getByText('Track miss directions to reveal patterns over time.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('miss-tendencies-bar-chart')).not.toBeInTheDocument();
  });

  it('renders empty-state copy when tracked directional misses are zero', () => {
    render(
      <MissTendenciesChart
        {...baseProps}
        data={{
          labels: ['Left', 'Right', 'Short', 'Long'],
          keys: ['miss_left', 'miss_right', 'miss_short', 'miss_long'],
          fir: {
            percentages: [null, null, null, null],
            counts: [0, 0, 0, 0],
            tracked_misses: 0,
            total_misses: 0,
            untracked_misses: 0,
          },
          gir: {
            percentages: [null, null, null, null],
            counts: [0, 0, 0, 0],
            tracked_misses: 0,
            total_misses: 0,
            untracked_misses: 0,
          },
        }}
      />,
    );

    expect(
      screen.getByText('Track miss directions to reveal patterns over time.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('miss-tendencies-bar-chart')).not.toBeInTheDocument();
  });

  it('renders chart when directional miss data exists', () => {
    render(
      <MissTendenciesChart
        {...baseProps}
        data={{
          labels: ['Left', 'Right', 'Short', 'Long'],
          keys: ['miss_left', 'miss_right', 'miss_short', 'miss_long'],
          fir: {
            percentages: [40, 60, 0, 0],
            counts: [2, 3, 0, 0],
            tracked_misses: 5,
            total_misses: 6,
            untracked_misses: 1,
          },
          gir: {
            percentages: [0, 0, 70, 30],
            counts: [0, 0, 7, 3],
            tracked_misses: 10,
            total_misses: 10,
            untracked_misses: 0,
          },
        }}
      />,
    );

    expect(screen.getByTestId('miss-tendencies-bar-chart')).toBeInTheDocument();
    expect(
      screen.queryByText('Track miss directions to reveal patterns over time.'),
    ).not.toBeInTheDocument();
  });
});
