/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveHoleScoreEntry from '@/components/rounds/live/LiveHoleScoreEntry';
import type { LiveRoundHoleDraft, LiveRoundTrackingPrefs } from '@/components/rounds/live/types';

const trackingPrefs: LiveRoundTrackingPrefs = {
  fir: true,
  gir: true,
  chips: false,
  greensideBunkerShots: false,
  putts: false,
  penalties: false,
};

function draft(overrides: Partial<LiveRoundHoleDraft> = {}): LiveRoundHoleDraft {
  return {
    id: 'draft-1',
    session_id: 'session-1',
    hole_id: 'hole-1',
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
    created_at: null,
    updated_at: null,
    hole: { id: 'hole-1', hole_number: 1, par: 4, yardage: 400, handicap: 1 },
    ...overrides,
  };
}

describe('LiveHoleScoreEntry directional result control', () => {
  it.each(['FIR', 'GIR'] as const)('records a non-directional %s miss in one tap', (area) => {
    const onChange = jest.fn();
    render(<LiveHoleScoreEntry draft={draft()} trackingPrefs={trackingPrefs} onChange={onChange} />);

    fireEvent.click(within(screen.getByRole('group', { name: `${area} result` })).getByRole('button', { name: 'Miss' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining(area === 'FIR'
      ? { fir_hit: 0, fir_direction: null }
      : { gir_hit: 0, gir_direction: null }));
  });

  it('opens the direction picker for a saved miss and clears it on a second tap', () => {
    const onChange = jest.fn();
    render(
      <LiveHoleScoreEntry
        draft={draft({ gir_hit: 0, gir_direction: null })}
        trackingPrefs={trackingPrefs}
        onChange={onChange}
      />,
    );

    const miss = within(screen.getByRole('group', { name: 'GIR result' })).getByRole('button', { name: 'Miss' });
    expect(miss).toHaveClass('active', 'active-miss');
    fireEvent.click(miss);

    expect(screen.getByRole('group', { name: 'GIR miss direction' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(miss);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      gir_hit: null,
      gir_direction: null,
    }));
  });

  it('adds an optional direction to a saved GIR miss', () => {
    const onChange = jest.fn();
    render(
      <LiveHoleScoreEntry
        draft={draft({ gir_hit: 0, gir_direction: null })}
        trackingPrefs={trackingPrefs}
        onChange={onChange}
      />,
    );

    fireEvent.click(within(screen.getByRole('group', { name: 'GIR result' })).getByRole('button', { name: 'Miss' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'GIR miss direction' })).getByRole('button', { name: 'Right' }),
    );

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      gir_hit: 0,
      gir_direction: 'miss_right',
    }));
    expect(screen.queryByRole('group', { name: 'GIR miss direction' })).not.toBeInTheDocument();
  });

  it('keeps the miss when its selected direction is deselected', () => {
    const onChange = jest.fn();
    render(
      <LiveHoleScoreEntry
        draft={draft({ gir_hit: 0, gir_direction: 'miss_right' })}
        trackingPrefs={trackingPrefs}
        onChange={onChange}
      />,
    );

    fireEvent.click(within(screen.getByRole('group', { name: 'GIR result' })).getByRole('button', { name: 'Miss Right' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'GIR miss direction' })).getByRole('button', { name: 'Right' }),
    );

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      gir_hit: 0,
      gir_direction: null,
    }));
    expect(screen.queryByRole('group', { name: 'GIR miss direction' })).not.toBeInTheDocument();
  });

  it('keeps the saved GIR miss direction visible after the picker closes', () => {
    render(
      <LiveHoleScoreEntry
        draft={draft({ gir_hit: 0, gir_direction: 'miss_left' })}
        trackingPrefs={trackingPrefs}
        onChange={jest.fn()}
      />,
    );

    expect(
      within(screen.getByRole('group', { name: 'GIR result' })).getByRole('button', { name: 'Miss Left' }),
    ).toHaveClass('active', 'active-miss');
    expect(screen.queryByRole('group', { name: 'GIR miss direction' })).not.toBeInTheDocument();
  });

  it('closes the direction picker without consuming the next control tap', () => {
    const onChange = jest.fn();
    render(
      <LiveHoleScoreEntry
        draft={draft({ gir_hit: 0, gir_direction: null })}
        trackingPrefs={{ ...trackingPrefs, chips: true }}
        onChange={onChange}
      />,
    );

    fireEvent.click(within(screen.getByRole('group', { name: 'GIR result' })).getByRole('button', { name: 'Miss' }));
    expect(screen.getByRole('group', { name: 'GIR miss direction' })).toBeInTheDocument();

    const chipsField = screen.getByText('Chips').closest('.stepper-field');
    expect(chipsField).not.toBeNull();
    fireEvent.click(within(chipsField as HTMLElement).getByRole('button', { name: '+' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ chips: 1 }));
    expect(screen.queryByRole('group', { name: 'GIR miss direction' })).not.toBeInTheDocument();
  });
});
