'use client';

import ScreenshotCarousel from './ScreenshotCarousel';

export default function Hero() {
  const scrollToWaitlist = () => {
    const element = document.getElementById('waitlist');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToFeatures = () => {
    const element = document.getElementById('features');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="landing-hero">
      <div className="landing-hero-content">
        <h1 className="landing-hero-title">
          Master Your Game with <span className="accent-text">Intelligent</span> Golf Analytics
        </h1>

        <p className="landing-hero-subtitle">
          Track every round, uncover hidden weaknesses, and improve faster with Intelligent Insights built from your real performance data.
        </p>
        <p className="landing-hero-subtitle">
          Free forever. Upgrade when you want deeper insights.
        </p>

        <div className="landing-hero-actions">
          <button onClick={scrollToWaitlist} className="btn btn-accent btn-large">
            Get Early Access
          </button>
          <button onClick={scrollToFeatures} className="btn btn-secondary btn-large">
            See How It Works
          </button>
        </div>

        <div className="landing-hero-image">
          <ScreenshotCarousel />
        </div>
      </div>
    </section>
  );
}
