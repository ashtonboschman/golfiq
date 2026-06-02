/** @jest-environment jsdom */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AboutPage from '@/app/about/page';
import PrivacyPage from '@/app/privacy/page';
import TermsPage from '@/app/terms/page';
import ContactPage from '@/app/contact/page';

describe('legal and support pages', () => {
  it('renders the updated about page positioning', () => {
    render(<AboutPage />);

    expect(
      screen.getByRole('heading', { name: /about golfiq/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your scorecard tells you what you shot/i)).toBeInTheDocument();
    expect(screen.getByText(/track rounds faster, understand your scores better/i)).toBeInTheDocument();
  });

  it('renders privacy policy disclosures', () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { name: /golfiq privacy policy/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/location data/i)).toBeInTheDocument();
    expect(screen.getAllByText(/posthog/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/account deletion/i)).toBeInTheDocument();
  });

  it('renders terms with billing and insights disclaimers', () => {
    render(<TermsPage />);

    expect(
      screen.getByRole('heading', { name: /golfiq terms of service/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/subscriptions and billing/i)).toBeInTheDocument();
    expect(screen.getByText(/billing is processed by stripe/i)).toBeInTheDocument();
    expect(screen.getByText(/does not guarantee lower scores/i)).toBeInTheDocument();
  });

  it('renders support page with settings-aware policy links', async () => {
    const page = await ContactPage({
      searchParams: Promise.resolve({ from: 'settings' }),
    });
    render(page);

    expect(
      screen.getByRole('heading', { name: /golfiq support/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy?from=settings',
    );
    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute(
      'href',
      '/terms?from=settings',
    );
    expect(screen.getByText(/safety and abuse reports/i)).toBeInTheDocument();
  });
});
