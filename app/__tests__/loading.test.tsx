/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Loading from '@/app/loading';

jest.mock('@/components/AppBootVisual', () => ({
  __esModule: true,
  default: () => <div data-testid="app-boot-visual">Boot Visual</div>,
}));

describe('root loading state', () => {
  it('renders the app boot visual while the initial route streams', () => {
    render(<Loading />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.getByTestId('app-boot-visual')).toBeInTheDocument();
  });
});
