/** @jest-environment jsdom */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import TrendCard from '@/components/TrendCard';

let mockLineProps: any;

jest.mock('react-chartjs-2', () => ({
  Line: (props: any) => {
    mockLineProps = props;
    return <div data-testid="trend-line" />;
  },
}));

describe('TrendCard', () => {
  it('caps Y-axis labels and keeps SG axis labels simpler than tooltip values', () => {
    render(
      <TrendCard
        trendData={{
          labels: ['Round 1', 'Round 2'],
          datasets: [
            {
              label: 'SG Total',
              data: [3.24, -1.6],
              borderColor: '#28a065',
            },
          ],
        }}
        accentColor="#2f6fff"
        surfaceColor="#171d27"
        textColor="#f1f3f6"
        gridColor="#2b3442"
        yStep={2}
        label="Strokes Gained History"
      />,
    );

    const yTicks = mockLineProps.options.scales.y.ticks;
    expect(yTicks.autoSkip).toBe(true);
    expect(yTicks.maxTicksLimit).toBe(7);
    expect(yTicks.callback(20)).toBe('+20');
    expect(yTicks.callback(0)).toBe('0');
    expect(yTicks.callback(-10)).toBe('-10');

    const tooltipLabel = mockLineProps.options.plugins.tooltip.callbacks.label;
    expect(tooltipLabel({ parsed: { y: 3.24 }, dataset: { label: 'SG Total' } })).toBe('+3.2');
  });
});
