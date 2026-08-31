/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LandingFooter from '@/components/landing/LandingFooter';

jest.mock('@/components/landing/SocialLinks', () => ({
  __esModule: true,
  default: () => <div data-testid="social-links" />,
}));

describe('LandingFooter', () => {
  it('routes contact to the in-app support page', () => {
    render(<LandingFooter />);

    expect(screen.getByRole('heading', { level: 2, name: 'Product' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Company' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Legal' })).toBeInTheDocument();
    const contactLink = screen.getByRole('link', { name: 'Contact' });
    expect(contactLink).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/#insights');
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
  });
});
