/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Features from '@/components/landing/Features';

describe('landing Features section', () => {
  it('describes only the verified round, GPS, club, insight, and social features', () => {
    render(<Features />);

    expect(screen.getByText('Everything You Need to Track, Review, and Understand')).toBeInTheDocument();
    expect(screen.getByText('Fast Round Tracking')).toBeInTheDocument();
    expect(screen.getByText(/track your score and the stats you care about/)).toBeInTheDocument();
    expect(screen.getByText('Live GPS and Hole Maps')).toBeInTheDocument();
    expect(screen.getByText('My Bag Club Suggestions')).toBeInTheDocument();
    expect(screen.getByText('Round Insights')).toBeInTheDocument();
    expect(screen.getByText('Dashboard and Game Trends')).toBeInTheDocument();
    expect(screen.getByText(/longer-term patterns across your rounds/)).toBeInTheDocument();
    expect(screen.getByText('Friends and Leaderboards')).toBeInTheDocument();
    expect(screen.getByText(/supported courses/)).toBeInTheDocument();
    expect(screen.queryByText('Course-Specific Insights')).not.toBeInTheDocument();
    expect(screen.queryByText(/Android/i)).not.toBeInTheDocument();
  });
});
