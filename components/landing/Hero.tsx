import ScreenshotCarousel from './ScreenshotCarousel';
import LandingTrackedLink from './LandingTrackedLink';

export default function Hero() {
  return (
    <section className="landing-hero">
      <div className="landing-hero-content">
        <h1 className="landing-hero-title">
          Track Your Round. <span className="accent-text">Understand</span> What Shaped Your Score.
        </h1>

        <p className="landing-hero-subtitle">
          Log rounds quickly, use live GPS and club suggestions on supported courses, then see the stats and insights behind your score.
        </p>
        <div className="landing-hero-actions">
          <LandingTrackedLink
            href="/onboarding?source=landing"
            className="btn btn-accent btn-large"
            ctaName="start_free"
            ctaLocation="hero"
          >
            Start Free
          </LandingTrackedLink>
          <LandingTrackedLink
            href="/pricing"
            className="btn btn-secondary btn-large"
            ctaName="view_pricing"
            ctaLocation="hero"
          >
            View Pricing
          </LandingTrackedLink>
        </div>

        <div className="landing-hero-image">
          <ScreenshotCarousel />
        </div>
      </div>
    </section>
  );
}
