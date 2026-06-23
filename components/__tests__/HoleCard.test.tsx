/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import HoleCard from '@/components/HoleCard';

describe('HoleCard short-game controls', () => {
  it('renders chips and greenside bunker controls and commits tracked values', () => {
    const onChange = jest.fn();

    render(
      <HoleCard
        hole={1}
        par={4}
        score={4}
        fir_hit={null}
        fir_direction={null}
        gir_hit={null}
        gir_direction={null}
        putts={2}
        penalties={0}
        chips={null}
        greenside_bunker_shots={null}
        onChange={onChange}
        onNext={() => {}}
      />,
    );

    expect(screen.getByText('Chips')).toBeInTheDocument();
    expect(screen.getByText('Greenside Bunker Shots')).toBeInTheDocument();
    expect(screen.getByText('Putts')).toBeInTheDocument();
    expect(screen.getByText('Penalties')).toBeInTheDocument();

    const statLabelOrder = screen
      .getAllByText(/^(Chips|Greenside Bunker Shots|Putts|Penalties)$/)
      .map((el) => el.textContent);
    expect(statLabelOrder).toEqual([
      'Chips',
      'Greenside Bunker Shots',
      'Putts',
      'Penalties',
    ]);

    const chipsLabel = screen.getByText('Chips');
    const bunkerLabel = screen.getByText('Greenside Bunker Shots');
    fireEvent.click(within(chipsLabel.closest('.stepper-field') as HTMLElement).getByRole('button', { name: '+' }));
    fireEvent.click(within(bunkerLabel.closest('.stepper-field') as HTMLElement).getByRole('button', { name: '+' }));

    fireEvent.click(screen.getByRole('button', { name: 'Next Hole' }));

    expect(onChange).toHaveBeenCalledWith(1, 'chips', 1);
    expect(onChange).toHaveBeenCalledWith(1, 'greenside_bunker_shots', 1);
  });

  it('hides disabled live-round stat controls while keeping score entry available', () => {
    render(
      <HoleCard
        hole={1}
        par={4}
        score={4}
        fir_hit={null}
        fir_direction={null}
        gir_hit={null}
        gir_direction={null}
        putts={2}
        penalties={0}
        chips={null}
        greenside_bunker_shots={null}
        trackingPrefs={{
          fir: false,
          gir: false,
          chips: false,
          greensideBunkerShots: false,
          putts: false,
          penalties: false,
        }}
        onChange={jest.fn()}
        onNext={() => {}}
      />,
    );

    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.queryByText('Fairway In Regulation')).not.toBeInTheDocument();
    expect(screen.queryByText('Green In Regulation')).not.toBeInTheDocument();
    expect(screen.queryByText('Chips')).not.toBeInTheDocument();
    expect(screen.queryByText('Greenside Bunker Shots')).not.toBeInTheDocument();
    expect(screen.queryByText('Putts')).not.toBeInTheDocument();
    expect(screen.queryByText('Penalties')).not.toBeInTheDocument();
  });
});
