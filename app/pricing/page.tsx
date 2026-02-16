'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { PRICING } from '@/lib/subscription';
import { Check, X } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

type PlanTab = 'monthly' | 'annual' | 'free';

function PricingContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<PlanTab>('monthly');
  const { isPremium, loading: subscriptionLoading } = useSubscription();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/pricing');
    }
  }, [status, router]);

  // Redirect premium users to settings
  useEffect(() => {
    if (status === 'authenticated' && !subscriptionLoading && isPremium) {
      router.push('/settings');
    }
  }, [status, subscriptionLoading, isPremium, router]);

  useEffect(() => {
    if (searchParams.get('cancelled')) {
      setMessage({ text: 'Checkout cancelled. No charges were made.', type: 'error' });
    }
  }, [searchParams]);

  // Clear loading state when page becomes visible (handles iOS popup X button)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && loading !== null) {
        setLoading(null);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loading]);

  const handleSubscribe = async (priceId: string, interval: 'month' | 'year') => {
    setLoading(interval);
    setMessage(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, interval }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      setMessage({ text: error.message || 'Failed to start checkout', type: 'error' });

      setLoading(null);
    }
  };

  if (status === 'unauthenticated') {
    return null;
  }

  // Don't show pricing page to premium users
  if (isPremium) {
    return null;
  }

  return (
    <div className="page-stack">
      {message && (
        <div className='secondary-text'>
          {message.text}
        </div>
      )}
      {/* Plan Tabs */}
      <div className="pricing-tabs">
        <button
          className={`pricing-tab ${activeTab === 'free' ? 'active' : ''}`}
          onClick={() => setActiveTab('free')}
        >
          Free
        </button>
        <button
          className={`pricing-tab ${activeTab === 'monthly' ? 'active' : ''}`}
          onClick={() => setActiveTab('monthly')}
        >
          Monthly
        </button>
        <button
          className={`pricing-tab ${activeTab === 'annual' ? 'active' : ''}`}
          onClick={() => setActiveTab('annual')}
        >
          Annual
        </button>
      </div>

      {/* Tab Content */}
      <div className="pricing-tab-content">
        {activeTab === 'monthly' && (
          <div className="pricing-card featured single">
            <div className="pricing-badge">Most Popular</div>
            <div className="pricing-card-header">
              <h2>Premium Monthly</h2>
              <h4>Deeper insights. Smarter decisions. Faster improvement.</h4>
              <div className="pricing-price">
                <span className="price-amount">${PRICING.monthly.price}</span>
                <span className="price-period">/month</span>
              </div>
            </div>
            <div className="pricing-card-body">
              <ul className="pricing-features">
                <li><Check color='green' size='20' className="feature-icon"/> Everything in Free</li>
                <li><Check color='green' size='20' className="feature-icon"/> Unlimited stat calculations & advanced trend charts</li>
                <li><Check color='green' size='20' className="feature-icon"/> Strokes gained per round & KPI comparisons</li>
                <li><Check color='green' size='20' className="feature-icon"/> Round-based and overall Intelligent Insights with personalized recommendations</li>
                <li><Check color='green' size='20' className="feature-icon"/> Course insights, tee recommendations & course-specific leaderboards</li>
                <li><Check color='green' size='20' className="feature-icon"/> Premium themes & enhanced filtering</li>
                <li><Check color='green' size='20' className="feature-icon"/> Priority support</li>
              </ul>
              <button
                className="btn-upgrade"
                aria-label="Subscribe monthly to Premium plan"
                onClick={() => handleSubscribe(PRICING.monthly.stripePriceId, 'month')}
                disabled={loading !== null || status === 'loading' || subscriptionLoading}
              >
                {loading === 'month' ? 'Loading...' : 'Upgrade to Premium'}
              </button>
              <div>
                <p className="price-subtext">
                  Billed ${PRICING.monthly.price}/month. Cancel anytime.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'annual' && (
          <div className="pricing-card featured single">
            <div className="pricing-badge savings">Save {PRICING.annual.savings}</div>
            <div className="pricing-card-header">
              <h2>Premium Annual</h2>
              <h4>Best value for committed golfers.</h4>
              <div className="pricing-price">
                <span className="price-amount">${PRICING.annual.price}</span>
                <span className="price-period">/year</span>
              </div>
              <p className="price-breakdown">
                Just <strong>${(PRICING.annual.price / 12).toFixed(2)}</strong>/month
              </p>
            </div>
            <div className="pricing-card-body">
              <ul className="pricing-features">
                <li><Check color='green' size='20' className="feature-icon"/> Everything in Premium</li>
                <li><Check color='green' size='20' className="feature-icon"/> <span>Save <strong>{PRICING.annual.savings}</strong> vs monthly</span></li>
                <li><Check color='green' size='20' className="feature-icon"/> Best value for dedicated golfers</li>
                <li><Check color='green' size='20' className="feature-icon"/> Full season & year-over-year analysis</li>
                <li><Check color='green' size='20' className="feature-icon"/> One payment, no monthly friction</li>
                <li><Check color='green' size='20' className="feature-icon"/> Ideal for long-term improvement tracking</li>
              </ul>
              <button
                className="btn-upgrade"
                aria-label="Subscribe annually to Premium plan"
                onClick={() => handleSubscribe(PRICING.annual.stripePriceId, 'year')}
                disabled={loading !== null || status === 'loading' || subscriptionLoading}
              >
                {loading === 'year' ? 'Loading...' : 'Upgrade to Premium Annual'}
              </button>
              <div>
                <p className="price-subtext">
                  Billed ${PRICING.annual.price}/year - One-time payment - Save {PRICING.annual.savings} vs monthly
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'free' && (
          <div className="pricing-card single">
            <div className="pricing-card-header">
              <h2 >Free</h2>
              <div className="pricing-price">
                <span className="price-amount">$0</span>
                <span className="price-period">/forever</span>
              </div>
              <p className="price-breakdown">
                Free forever. Upgrade when you want deeper insights.
              </p>
            </div>
            <div className="pricing-card-body">
              <ul className="pricing-features">
                <li><Check color='green' size='20' className="feature-icon"/> Unlimited round tracking & storage</li>
                <li><Check color='green' size='20' className="feature-icon"/> Handicap & core scoring stats (last 20 rounds)</li>
                <li><Check color='green' size='20' className="feature-icon"/> FIR%, GIR%, putts & basic performance stats</li>
                <li><Check color='green' size='20' className="feature-icon"/> 9-hole & 18-hole support</li>
                <li><Check color='green' size='20' className="feature-icon"/> Course search, scorecards, friends, & leaderboards</li>
                <li><Check color='green' size='20' className="feature-icon"/> Light & dark themes, multi-device sync</li>
                <li><X color='red' size='20' className="feature-icon"/> Advanced analytics & predictions</li>
                <li><X color='red' size='20' className="feature-icon"/> Round-based Intelligent Insights</li>
                <li><X color='red' size='20' className="feature-icon"/> Custom dashboards & advanced filters</li>
              </ul>
              <button
                className="pricing-button current"
                disabled
              >
                Current Plan
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pricing-faq">
        <h2>Frequently Asked Questions</h2>
        <div className="faq-grid">
          <div className="card faq-item">
            <h3>Can I cancel anytime?</h3>
            <p>
              Absolutely! You can cancel your subscription at any time from your settings page.
              You'll continue to have access until the end of your billing period.
            </p>
          </div>
          <div className="card faq-item">
            <h3>What payment methods do you accept?</h3>
            <p>
              We accept all major credit cards (Visa, MasterCard, American Express)
              through our secure payment processor, Stripe.
            </p>
          </div>
          <div className="card faq-item">
            <h3>Can I switch plans?</h3>
            <p>
              Yes! You can upgrade or downgrade your plan at any time from your
              settings page. Changes will be prorated automatically.
            </p>
          </div>
          <div className="card faq-item">
            <h3>What happens to my data if I cancel?</h3>
            <p>
              Your data is never deleted. If you cancel Premium, you'll revert to the Free plan
              and keep all your rounds, but lose access to Premium features.
            </p>
          </div>
          <div className="card faq-item">
            <h3>Is my data safe?</h3>
            <p>
              Absolutely. We use industry-standard encryption and never store your
              payment information. All payments are securely processed by Stripe.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingContent />
    </Suspense>
  );
}
