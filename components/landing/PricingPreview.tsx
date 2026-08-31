import { Check } from 'lucide-react';
import { PRICING } from '@/lib/subscription';
import LandingTrackedLink from './LandingTrackedLink';

const FREE_HIGHLIGHTS = [
  'Unlimited round tracking and storage',
  'Live GPS and My Bag club suggestions on supported courses',
  'Core dashboard stats and basic round insights',
] as const;

const PREMIUM_HIGHLIGHTS = [
  'Full strokes gained history and evidence-backed round insights',
  'All-time dashboard stats, filters, and longer trends',
  'Score and handicap outlooks, full rankings, and Premium themes',
] as const;

function PlanHighlights({ items }: { items: readonly string[] }) {
  return (
    <ul className="landing-plan-features">
      {items.map((item) => (
        <li key={item}>
          <Check size={18} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingPreview() {
  return (
    <section className="landing-pricing" aria-labelledby="landing-pricing-title">
      <div className="landing-section-header">
        <h2 id="landing-pricing-title" className="landing-section-title">Track Every Round Free. Premium Adds More Insight.</h2>
        <p className="landing-section-subtitle">
          Track, review, and understand every round for free. Premium unlocks deeper history, trends, insights, and rankings.
        </p>
      </div>

      <div className="landing-plan-grid">
        <article className="landing-plan-card">
          <div>
            <h3 className="landing-plan-name">Free</h3>
            <p className="landing-plan-price">$0 <span>forever</span></p>
          </div>
          <PlanHighlights items={FREE_HIGHLIGHTS} />
          <LandingTrackedLink
            href="/onboarding?source=landing-pricing"
            className="btn btn-secondary btn-large"
            ctaName="start_free"
            ctaLocation="pricing_free"
          >
            Start Free
          </LandingTrackedLink>
        </article>

        <article className="landing-plan-card landing-plan-card-featured">
          <div className="landing-plan-heading-row">
            <div>
              <h3 className="landing-plan-name">Premium</h3>
              <p className="landing-plan-price">
                ${PRICING.monthly.price.toFixed(2)} <span>CAD per month</span>
              </p>
            </div>
          </div>
          <PlanHighlights items={PREMIUM_HIGHLIGHTS} />
          <LandingTrackedLink
            href="/pricing"
            className="btn btn-accent btn-large"
            ctaName="view_full_pricing"
            ctaLocation="pricing_premium"
          >
            View Full Pricing
          </LandingTrackedLink>
        </article>
      </div>
      
    </section>
  );
}
