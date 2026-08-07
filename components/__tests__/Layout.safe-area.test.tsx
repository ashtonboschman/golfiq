/** @jest-environment jsdom */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HeaderFallback } from '@/components/Layout';

describe('Layout safe-area shell', () => {
  it('uses the shared header structure for the suspense fallback', () => {
    const { container } = render(<HeaderFallback />);
    const header = container.querySelector('header.header');

    expect(header).toBeInTheDocument();
    expect(header?.firstElementChild).toHaveClass('header-inner');
  });
});
