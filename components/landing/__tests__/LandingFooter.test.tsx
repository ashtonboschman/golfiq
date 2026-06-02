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

    const contactLink = screen.getByRole('link', { name: 'Contact' });
    expect(contactLink).toHaveAttribute('href', '/contact');
  });
});
