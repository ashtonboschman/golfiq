/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Features from '@/components/landing/Features';

describe('landing Features section', () => {
  it('does not render stale Course-Specific Insights claim', () => {
    render(<Features />);

    expect(screen.getByText('Everything You Need to Improve')).toBeInTheDocument();
    expect(screen.getByText('Intelligent Insights')).toBeInTheDocument();
    expect(screen.queryByText('Course-Specific Insights')).not.toBeInTheDocument();
  });
});

