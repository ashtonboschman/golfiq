'use client';

import Link from 'next/link';
import ScreenshotCarousel from './ScreenshotCarousel';

export default function Hero() {
  return (
    <section className="landing-hero">
      <div className="landing-hero-content">
        <h1 className="landing-hero-title">
          Master Your Game with <span className="accent-text">Intelligent</span> Golf Analytics
        </h1>

        <p className="landing-hero-subtitle">
          Track every round, uncover hidden weaknesses, and improve faster with Intelligent Insights built from your real performance data.
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
