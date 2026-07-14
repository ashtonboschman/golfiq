/** @jest-environment jsdom */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import MissTendenciesChart, {
  buildDirectionalMissViewModel,
} from '@/components/MissTendenciesChart';

type Series = {
  percentages: (number | null)[];
  counts: number[];
  tracked_misses: number;
  total_misses: number;
  untracked_misses: number;
};

const keys = ['miss_left', 'miss_right', 'miss_short', 'miss_long'] as const;

function series(overrides: Partial<Series> = {}): Series {
  return {
    percentages: [20, 50, 20, 10],
    counts: [2, 5, 2, 1],
    tracked_misses: 10,
    total_misses: 10,
    untracked_misses: 0,
    ...overrides,
  };
}

function data(fir: Series = series(), gir: Series = series({ percentages: [10, 20, 60, 10] })) {
  return {
    labels: ['Left', 'Right', 'Short', 'Long'],
    keys: [...keys],
    fir,
    gir,
  };
}

function sectionFor(name: 'Fairway' | 'Green'): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  if (!section) throw new Error(`Missing section for ${name}`);
  return section;
}

describe('MissTendenciesChart', () => {
  it('renders both directional sections with exact values and no chart canvas or count metadata', () => {
    const { container } = render(
      <MissTendenciesChart
        data={data(
          series({ tracked_misses: 10, total_misses: 12, untracked_misses: 2 }),
          series({ percentages: [0, 0, 0, 100], counts: [0, 0, 0, 8], tracked_misses: 8 }),
        )}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Miss Direction' })).toBeInTheDocument();
    expect(screen.queryByText('Share of tracked misses by direction')).not.toBeInTheDocument();

    const fairway = sectionFor('Fairway');
    const green = sectionFor('Green');
    for (const section of [fairway, green]) {
      for (const label of ['Left', 'Right', 'Short', 'Long']) {
        expect(within(section).getByText(label)).toBeInTheDocument();
      }
    }

    expect(within(fairway).getByText('50%')).toBeInTheDocument();
    expect(within(green).getByText('100%')).toBeInTheDocument();
    expect(within(green).getAllByText('0%')).toHaveLength(3);
    expect(container.querySelector('canvas')).not.toBeInTheDocument();
    expect(screen.queryByText(/primary miss/i)).not.toBeInTheDocument();
    expect(screen.queryByText('FIR Miss %')).not.toBeInTheDocument();
    expect(screen.queryByText('GIR Miss %')).not.toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
    expect(screen.queryByText(/tracked misses/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/without a recorded direction/i)).not.toBeInTheDocument();
  });

  it('keeps rounded 99% and 101% distributions without normalizing them', () => {
    render(
      <MissTendenciesChart
        data={data(
          series({ percentages: [33, 33, 33, 0], tracked_misses: 6 }),
          series({ percentages: [34, 34, 33, 0], tracked_misses: 6 }),
        )}
      />,
    );

    expect(within(sectionFor('Fairway')).getAllByText('33%')).toHaveLength(3);
    expect(within(sectionFor('Green')).getAllByText('34%')).toHaveLength(2);
    expect(within(sectionFor('Green')).getByText('33%')).toBeInTheDocument();
  });

  it('marks every tied maximum with equal emphasis', () => {
    render(
      <MissTendenciesChart
        data={data(series({ percentages: [50, 50, 0, 0], tracked_misses: 6 }))}
      />,
    );

    const strongestValues = sectionFor('Fairway').querySelectorAll(
      '.directional-miss-direction.is-strongest',
    );
    const strongestRegions = sectionFor('Fairway').querySelectorAll(
      '.directional-miss-region.is-strongest',
    );
    const wedgeRadii = Array.from(
      sectionFor('Fairway').querySelectorAll('.directional-miss-region'),
      (region) => Number(region.getAttribute('data-radius')),
    );
    expect(strongestValues).toHaveLength(2);
    expect(strongestRegions).toHaveLength(2);
    expect(wedgeRadii[0]).toBe(wedgeRadii[1]);
  });

  it.each([
    [1, true],
    [5, true],
    [6, false],
  ])('uses the conservative limited-data threshold at %i tracked misses', (trackedMisses, isLimited) => {
    render(
      <MissTendenciesChart
        data={data(series({ percentages: [0, 100, 0, 0], tracked_misses: trackedMisses }))}
      />,
    );

    const fairway = sectionFor('Fairway');
    expect(within(fairway).getByText('100%')).toBeInTheDocument();
    if (isLimited) {
      expect(within(fairway).getByText('Limited data')).toBeInTheDocument();
    } else {
      expect(within(fairway).queryByText('Limited data')).not.toBeInTheDocument();
    }
  });

  it('renders a whole-card empty state without target graphics', () => {
    const empty = series({
      percentages: [null, null, null, null],
      counts: [0, 0, 0, 0],
      tracked_misses: 0,
      total_misses: 0,
    });
    render(<MissTendenciesChart data={data(empty, empty)} />);

    expect(screen.getByText('No tracked miss directions yet.')).toBeInTheDocument();
    expect(screen.getByText('Record miss directions during rounds to see your tendencies.')).toBeInTheDocument();
    expect(screen.queryByTestId('fairway-miss-target')).not.toBeInTheDocument();
    expect(screen.queryByTestId('green-miss-target')).not.toBeInTheDocument();
  });

  it('renders one populated section and an honest empty state for the other', () => {
    const untrackedGreen = series({
      percentages: [null, null, null, null],
      counts: [0, 0, 0, 0],
      tracked_misses: 0,
      total_misses: 4,
      untracked_misses: 4,
    });
    render(<MissTendenciesChart data={data(series(), untrackedGreen)} />);

    const green = sectionFor('Green');
    expect(within(green).getByText('No tracked green misses')).toBeInTheDocument();
    expect(within(green).queryByText(/without a recorded direction/i)).not.toBeInTheDocument();
    expect(within(green).queryByTestId('green-miss-target')).not.toBeInTheDocument();
    expect(screen.getByTestId('fairway-miss-target')).toBeInTheDocument();
  });

  it('does not surface fully untracked count metadata in the whole-card state', () => {
    const untracked = series({
      percentages: [null, null, null, null],
      counts: [0, 0, 0, 0],
      tracked_misses: 0,
      total_misses: 1,
      untracked_misses: 1,
    });
    render(<MissTendenciesChart data={data(untracked, untracked)} />);

    expect(screen.getByText('No tracked miss directions yet.')).toBeInTheDocument();
    expect(screen.queryByText(/without a recorded direction/i)).not.toBeInTheDocument();
  });

  it('provides semantic direction values and decorative, non-focusable SVGs', () => {
    render(
      <MissTendenciesChart
        data={data(series({ tracked_misses: 10, total_misses: 11, untracked_misses: 1 }))}
      />,
    );

    const fairway = sectionFor('Fairway');
    expect(fairway.querySelector('dl')).toBeInTheDocument();
    expect(within(fairway).getByText('Left')).toBeInTheDocument();
    expect(within(fairway).getAllByText('20%')).toHaveLength(2);
    expect(fairway.querySelector('.directional-miss-summary')).not.toBeInTheDocument();
    expect(screen.getByTestId('fairway-miss-target')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('fairway-miss-target')).toHaveAttribute('focusable', 'false');
  });

  it('renders organic fairway and green cores inside the directional regions', () => {
    render(<MissTendenciesChart data={data()} />);

    expect(screen.getByTestId('fairway-miss-target').querySelector('.directional-miss-fairway-rough')).toBeInTheDocument();
    expect(screen.getByTestId('fairway-miss-target').querySelector('.directional-miss-fairway-main')).toBeInTheDocument();
    expect(screen.getByTestId('green-miss-target').querySelector('.directional-miss-green-main')).toBeInTheDocument();
    expect(screen.getByTestId('green-miss-target').querySelector('.directional-miss-green-flag')).toBeInTheDocument();
  });

  it('uses the same wedge geometry with radius increasing by miss percentage', () => {
    render(<MissTendenciesChart data={data()} />);

    const fairway = screen.getByTestId('fairway-miss-target');
    const leftRadius = Number(fairway.querySelector('.directional-miss-region.is-left')?.getAttribute('data-radius'));
    const rightRadius = Number(fairway.querySelector('.directional-miss-region.is-right')?.getAttribute('data-radius'));
    const shortRadius = Number(fairway.querySelector('.directional-miss-region.is-short')?.getAttribute('data-radius'));
    const longRadius = Number(fairway.querySelector('.directional-miss-region.is-long')?.getAttribute('data-radius'));

    expect(rightRadius).toBeGreaterThan(leftRadius);
    expect(leftRadius).toBe(shortRadius);
    expect(shortRadius).toBeGreaterThan(longRadius);
    expect(fairway.querySelectorAll('.directional-miss-arrow-line')).toHaveLength(4);
    expect(fairway.querySelectorAll('.directional-miss-arrow-head')).toHaveLength(4);
    expect(
      Array.from(fairway.querySelectorAll('.directional-miss-arrow-line'), (line) => line.getAttribute('d')),
    ).toEqual(['M110 60V-5', 'M60 110H-5', 'M160 110H225', 'M110 160V225']);
    expect(fairway.querySelectorAll('radialGradient')).toHaveLength(4);
    expect(fairway.querySelector('.directional-miss-region.is-right')).toHaveAttribute(
      'fill',
      'url(#fairway-right-miss-gradient)',
    );
  });

  it('normalizes wedge radii against the highest percentage in each area', () => {
    render(
      <MissTendenciesChart
        data={data(
          series({ percentages: [30, 60, 10, 0], tracked_misses: 10 }),
          series({ percentages: [100, 0, 0, 0], tracked_misses: 10 }),
        )}
      />,
    );

    const fairway = screen.getByTestId('fairway-miss-target');
    const thirtyPercentRadius = Number(
      fairway.querySelector('.directional-miss-region.is-left')?.getAttribute('data-radius'),
    );
    const sixtyPercentRadius = Number(
      fairway.querySelector('.directional-miss-region.is-right')?.getAttribute('data-radius'),
    );
    const tenPercentRadius = Number(
      fairway.querySelector('.directional-miss-region.is-short')?.getAttribute('data-radius'),
    );
    const zeroPercentRadius = Number(
      fairway.querySelector('.directional-miss-region.is-long')?.getAttribute('data-radius'),
    );
    const hundredPercentRadius = Number(
      screen.getByTestId('green-miss-target')
        .querySelector('.directional-miss-region.is-left')
        ?.getAttribute('data-radius'),
    );

    expect(sixtyPercentRadius).toBe(100);
    expect(thirtyPercentRadius).toBe(70);
    expect(tenPercentRadius).toBe(50);
    expect(zeroPercentRadius).toBe(1);
    expect(hundredPercentRadius).toBe(100);
  });

  it('maps keyed data safely and defaults malformed or missing values to zero', () => {
    const model = buildDirectionalMissViewModel({
      area: 'fairway',
      keys: ['miss_right'],
      series: {
        percentages: [100, Number.NaN],
        tracked_misses: 6,
        total_misses: 6,
        untracked_misses: 0,
      },
    });

    expect(model.directions.map((direction) => direction.percentage)).toEqual([0, 100, 0, 0]);
    expect(model.directions.find((direction) => direction.position === 'right')?.isStrongest).toBe(true);
    expect(model.directions.find((direction) => direction.position === 'left')?.isStrongest).toBe(false);
  });

  it('keeps Fairway before Green in the stacked DOM structure', () => {
    const { container } = render(<MissTendenciesChart data={data()} />);
    const sections = container.querySelectorAll('.directional-miss-section');

    expect(sections).toHaveLength(2);
    expect(within(sections[0] as HTMLElement).getByRole('heading', { name: 'Fairway' })).toBeInTheDocument();
    expect(within(sections[1] as HTMLElement).getByRole('heading', { name: 'Green' })).toBeInTheDocument();
  });
});
