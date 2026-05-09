/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import HoleCard from '@/components/HoleCard';

function baseProps(overrides: Partial<React.ComponentProps<typeof HoleCard>> = {}): React.ComponentProps<typeof HoleCard> {
  return {
    hole: 1,
    par: 4,
    score: 4,
    fir_hit: null,
    fir_direction: null,
    gir_hit: null,
    gir_direction: null,
    putts: 2,
    penalties: 0,
    onChange: jest.fn(),
    onNext: jest.fn(),
    ...overrides,
  };
}

describe('HoleCard directional one-tap capture', () => {
  it('selecting center sets hit and clears miss direction', () => {
    const onChange = jest.fn();
    render(
      <HoleCard
        {...baseProps({
          onChange,
          fir_hit: 0,
          fir_direction: 'miss_left',
        })}
      />,
    );

    const firGroup = screen.getByRole('group', { name: 'FIR result' });
    fireEvent.click(within(firGroup).getByRole('button', { name: 'Hit' }));

    fireEvent.click(screen.getByRole('button', { name: 'Next Hole' }));

    expect(onChange).toHaveBeenCalledWith(1, 'fir_hit', 1);
    expect(onChange).toHaveBeenCalledWith(1, 'fir_direction', null);
  });

  it('selecting directional buttons sets miss + correct direction in one tap', () => {
    const onChange = jest.fn();
    const cases: Array<{ label: string; expected: 'miss_left' | 'miss_right' | 'miss_long' | 'miss_short' }> = [
      { label: 'Left', expected: 'miss_left' },
      { label: 'Right', expected: 'miss_right' },
      { label: 'Long', expected: 'miss_long' },
      { label: 'Short', expected: 'miss_short' },
    ];

    for (const testCase of cases) {
      onChange.mockClear();
      const { unmount } = render(<HoleCard {...baseProps({ onChange, gir_hit: null, gir_direction: null })} />);
      const girGroup = screen.getByRole('group', { name: 'GIR result' });
      fireEvent.click(within(girGroup).getByRole('button', { name: testCase.label }));
      fireEvent.click(screen.getByRole('button', { name: 'Next Hole' }));

      expect(onChange).toHaveBeenCalledWith(1, 'gir_hit', 0);
      expect(onChange).toHaveBeenCalledWith(1, 'gir_direction', testCase.expected);
      unmount();
    }
  });

  it('changing from miss direction to hit clears direction', () => {
    const onChange = jest.fn();
    render(<HoleCard {...baseProps({ onChange, gir_hit: 0, gir_direction: 'miss_right' })} />);

    const girGroup = screen.getByRole('group', { name: 'GIR result' });
    fireEvent.click(within(girGroup).getByRole('button', { name: 'Hit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next Hole' }));

    expect(onChange).toHaveBeenCalledWith(1, 'gir_hit', 1);
    expect(onChange).toHaveBeenCalledWith(1, 'gir_direction', null);
  });

  it('tapping selected direction again clears hit/miss and direction', () => {
    const onChange = jest.fn();
    render(
      <HoleCard
        {...baseProps({
          onChange,
          fir_hit: 0,
          fir_direction: 'miss_right',
        })}
      />,
    );

    const firGroup = screen.getByRole('group', { name: 'FIR result' });
    fireEvent.click(within(firGroup).getByRole('button', { name: 'Right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next Hole' }));

    expect(onChange).toHaveBeenCalledWith(1, 'fir_hit', null);
    expect(onChange).toHaveBeenCalledWith(1, 'fir_direction', null);
  });

  it('FIR control is hidden for par 3 and GIR remains available', () => {
    render(<HoleCard {...baseProps({ par: 3 })} />);

    expect(screen.queryByRole('group', { name: 'FIR result' })).not.toBeInTheDocument();
    expect(screen.getByText('Not tracked on par 3s')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'GIR result' })).toBeInTheDocument();
  });

  it('existing direction values preload correctly', () => {
    render(
      <HoleCard
        {...baseProps({
          fir_hit: 0,
          fir_direction: 'miss_right',
          gir_hit: 0,
          gir_direction: 'miss_short',
        })}
      />,
    );

    expect(within(screen.getByRole('group', { name: 'FIR result' })).getByRole('button', { name: 'Right' })).toHaveClass('active');
    expect(within(screen.getByRole('group', { name: 'GIR result' })).getByRole('button', { name: 'Short' })).toHaveClass('active');
  });

  it('miss can still be logged with one tap', () => {
    const onChange = jest.fn();
    render(<HoleCard {...baseProps({ onChange, fir_hit: null, fir_direction: null })} />);

    const firGroup = screen.getByRole('group', { name: 'FIR result' });
    fireEvent.click(within(firGroup).getByRole('button', { name: 'Left' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next Hole' }));

    expect(onChange).toHaveBeenCalledWith(1, 'fir_hit', 0);
    expect(onChange).toHaveBeenCalledWith(1, 'fir_direction', 'miss_left');
    expect(screen.queryByRole('group', { name: 'FIR miss direction' })).not.toBeInTheDocument();
  });
});
