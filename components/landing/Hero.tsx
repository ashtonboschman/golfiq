'use client';

import Link from 'next/link';
import ScreenshotCarousel from './ScreenshotCarousel';

export default function Hero() {
  return (
    <section className="landing-hero">
      <div className="landing-hero-content">
        <h1 className="landing-hero-title">
          Track your rounds. <span className="accent-text">Understand</span> what shaped them.
        </h1>

        <p className="landing-hero-subtitle">
          Your scorecard tells you what you shot. GolfIQ helps explain why.
        </p>
        <div className="landing-hero-actions">
          <Link href="/onboarding?source=landing" className="btn btn-accent btn-large">
            Get Started
          </Link>
        </div>

        <div className="landing-hero-image">
          <ScreenshotCarousel />
        </div>
      </div>
    </section>
  );
}
