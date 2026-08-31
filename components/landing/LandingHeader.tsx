'use client';

import Image from 'next/image';
import LandingTrackedLink from './LandingTrackedLink';

export default function LandingHeader() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <button
          type="button"
          className="landing-logo"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
        >
          <Image
            src="/logos/wordmark/golfiq-wordmark.png"
            alt="GolfIQ"
            width={160}
            height={40}
            priority
          />
        </button>

        <nav className="landing-nav">
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('features');
            }}
            className="landing-nav-link"
          >
            Features
          </a>
          <a
            href="#insights"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('insights');
            }}
            className="landing-nav-link"
          >
            Insights
          </a>
          <LandingTrackedLink
            href="/pricing"
            className="landing-nav-link"
            ctaName="pricing"
            ctaLocation="header_nav"
          >
            Pricing
          </LandingTrackedLink>
        </nav>

        <div className="landing-header-actions">
          <LandingTrackedLink
            href="/login"
            className="btn btn-accent"
            ctaName="login"
            ctaLocation="header"
          >
            Login
          </LandingTrackedLink>
        </div>
      </div>
    </header>
  );
}
