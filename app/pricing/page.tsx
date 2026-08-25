'use client';

import { useSession } from 'next-auth/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { PRICING } from '@/lib/subscription';
import { Check, X } from 'lucide-react';
import { clearSubscriptionCache, useSubscription } from '@/hooks/useSubscription';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import { getBillingPlatform } from '@/lib/platform';
import { redirectToUrl } from '@/lib/browser/redirect';
import {
  getNativePremiumOffering,
  isNativePurchaseCancelled,
  purchaseNativePremiumPlan,
  restoreNativePremiumPurchases,
  type NativePremiumOffering,
} from '@/lib/revenuecat/nativePurchases';
import { waitForServerPremiumEntitlement } from '@/lib/revenuecat/serverEntitlement';
import type { PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';

type PlanTab = 'monthly' | 'annual' | 'free';

function formatNativePrice(product: PurchasesStoreProduct | undefined): string {
  if (!product) return '...';
  return product.currencyCode
    ? `${product.priceString} ${product.currencyCode}`
    : product.priceString;
}

function formatNativeMonthlyEquivalent(product: PurchasesStoreProduct | undefined): string | null {
  if (!product?.pricePerMonthString) return null;
  return product.currencyCode
    ? `${product.pricePerMonthString} ${product.currencyCode}`
    : product.pricePerMonthString;
}

function PricingContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<PlanTab>('monthly');
  const [nativeOffering, setNativeOffering] = useState<NativePremiumOffering | null>(null);
  const [nativePlansLoading, setNativePlansLoading] = useState(false);
  const [restoringPurchases, setRestoringPurchases] = useState(false);
  const { isPremium, loading: subscriptionLoading, provider } = useSubscription();
  const viewedRef = useRef(false);
  const checkoutCancelTrackedRef = useRef(false);
  const billingPlatform = getBillingPlatform();
  const usesNativeBilling = billingPlatform === 'ios_iap';
  const billingError = searchParams.get('billing_error');
  const cancelled = searchParams.get('cancelled');
  const queryMessage = cancelled
    ? { text: 'Checkout cancelled. No charges were made.', type: 'error' as const }
    : billingError
      ? {
          text:
            {
              invalid_package: 'We could not open that plan. Please try again.',
              user_not_found: 'We could not find your account for checkout. Please sign in again and retry.',
              billing_unavailable: 'Web checkout is not configured right now. Please try again shortly.',
            }[billingError] || 'We could not start checkout. Please try again.',
          type: 'error' as const,
        }
      : null;
  const displayMessage = message ?? queryMessage;

  useEffect(() => {
    if (status !== 'authenticated' || viewedRef.current) return;
    viewedRef.current = true;
    captureClientEvent(
      ANALYTICS_EVENTS.pricingPageViewed,
      {
        source_page: pathname,
        billing_platform: billingPlatform,
        subscription_provider: provider,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          subscription_provider: provider,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: true,
      },
    );
  }, [billingPlatform, pathname, provider, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, status]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/pricing');
    }
  }, [status, router]);

  useEffect(() => {
    const appUserId = session?.user?.id ? String(session.user.id) : null;
    if (!usesNativeBilling || status !== 'authenticated' || !appUserId) return;

    let active = true;
    setNativeOffering(null);
    setNativePlansLoading(true);
    void getNativePremiumOffering(appUserId)
      .then((offering) => {
        if (!active) return;
        setNativeOffering(offering);
      })
      .catch((error) => {
        if (!active) return;
        console.error('[revenuecat] Failed to load native offering:', error);
        setMessage({
          text: error instanceof Error
            ? error.message
            : 'App Store subscription plans are unavailable right now.',
          type: 'error',
        });
      })
      .finally(() => {
        if (active) setNativePlansLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session?.user?.id, status, usesNativeBilling]);

  // Redirect premium users to settings
  useEffect(() => {
    if (status === 'authenticated' && !subscriptionLoading && isPremium) {
      router.push('/settings');
    }
  }, [status, subscriptionLoading, isPremium, router]);

  useEffect(() => {
    if (cancelled) {
      if (!checkoutCancelTrackedRef.current) {
        checkoutCancelTrackedRef.current = true;
        captureClientEvent(
          ANALYTICS_EVENTS.checkoutFailed,
          {
            failure_stage: 'user_cancelled',
            source_page: pathname,
            billing_platform: billingPlatform,
            subscription_provider: provider,
          },
          {
            pathname,
            user: {
              id: session?.user?.id,
              subscription_tier: session?.user?.subscription_tier,
              subscription_provider: provider,
              auth_provider: session?.user?.auth_provider,
            },
            isLoggedIn: status === 'authenticated',
          },
        );
      }
    }
  }, [billingPlatform, cancelled, pathname, provider, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, status]);

  const handleSubscribe = async (plan: 'monthly' | 'annual') => {
    if (loading !== null) return;

    const interval = plan === 'annual' ? 'year' : 'month';

    setLoading(interval);
    setMessage(null);
    checkoutCancelTrackedRef.current = false;
    captureClientEvent(
      ANALYTICS_EVENTS.upgradeCtaClicked,
      {
        cta_location: `pricing_${interval}_button`,
        source_page: pathname,
        billing_platform: billingPlatform,
        subscription_provider: provider,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          subscription_provider: provider,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );

    if (usesNativeBilling) {
      const appUserId = session?.user?.id ? String(session.user.id) : null;
      if (!appUserId || !nativeOffering) {
        setLoading(null);
        setMessage({ text: 'App Store subscription plans are unavailable right now.', type: 'error' });
        return;
      }

      captureClientEvent(
        ANALYTICS_EVENTS.checkoutStarted,
        {
          plan,
          source_page: pathname,
          billing_platform: billingPlatform,
          subscription_provider: 'apple',
        },
        {
          pathname,
          user: {
            id: session?.user?.id,
            subscription_tier: session?.user?.subscription_tier,
            subscription_provider: provider,
            auth_provider: session?.user?.auth_provider,
          },
          isLoggedIn: true,
        },
      );

      try {
        const result = await purchaseNativePremiumPlan(appUserId, plan);
        if (!result.hasPremium) {
          throw new Error('The App Store purchase did not activate Premium.');
        }

        setMessage({ text: 'Purchase complete. Confirming Premium access...', type: 'success' });
        const confirmed = await waitForServerPremiumEntitlement();
        if (!confirmed) {
          setMessage({
            text: 'Your purchase is complete, but Premium access is still syncing. Please check again shortly.',
            type: 'success',
          });
          return;
        }

        clearSubscriptionCache(appUserId);
        captureClientEvent(
          ANALYTICS_EVENTS.checkoutCompleted,
          {
            plan,
            source_page: pathname,
            billing_platform: billingPlatform,
            subscription_provider: 'apple',
          },
          {
            pathname,
            user: {
              id: session?.user?.id,
              subscription_tier: session?.user?.subscription_tier,
              subscription_provider: 'apple',
              auth_provider: session?.user?.auth_provider,
            },
            isLoggedIn: true,
          },
        );
        router.push('/settings');
      } catch (error) {
        const userCancelled = isNativePurchaseCancelled(error);
        if (!userCancelled) {
          console.error('[revenuecat] Native purchase failed:', error);
        }
        setMessage({
          text: userCancelled
            ? 'Purchase cancelled. No charge was made.'
            : 'We could not complete the App Store purchase. Please try again.',
          type: 'error',
        });
        captureClientEvent(
          ANALYTICS_EVENTS.checkoutFailed,
          {
            failure_stage: userCancelled ? 'user_cancelled' : 'native_purchase',
            plan,
            source_page: pathname,
            billing_platform: billingPlatform,
            subscription_provider: 'apple',
          },
          {
            pathname,
            user: {
              id: session?.user?.id,
              subscription_tier: session?.user?.subscription_tier,
              subscription_provider: provider,
              auth_provider: session?.user?.auth_provider,
            },
            isLoggedIn: true,
          },
        );
      } finally {
        setLoading(null);
      }
      return;
    }

    redirectToUrl(`/api/revenuecat/purchase-link?package=${plan}`);
  };

  const handleRestorePurchases = async () => {
    if (restoringPurchases || loading !== null) return;
    const appUserId = session?.user?.id ? String(session.user.id) : null;
    if (!appUserId) {
      setMessage({ text: 'Please sign in before restoring purchases.', type: 'error' });
      return;
    }

    setRestoringPurchases(true);
    setMessage(null);
    try {
      const result = await restoreNativePremiumPurchases(appUserId);
      if (!result.hasPremium) {
        setMessage({
          text: 'No active Premium subscription was found for this Apple account.',
          type: 'error',
        });
        return;
      }

      setMessage({ text: 'Purchase restored. Confirming Premium access...', type: 'success' });
      const confirmed = await waitForServerPremiumEntitlement();
      if (!confirmed) {
        setMessage({
          text: 'Your purchase was restored, but Premium access is still syncing. Please check again shortly.',
          type: 'success',
        });
        return;
      }

      clearSubscriptionCache(appUserId);
      router.push('/settings');
    } catch (error) {
      console.error('[revenuecat] Restore purchases failed:', error);
      setMessage({ text: 'We could not restore App Store purchases. Please try again.', type: 'error' });
    } finally {
      setRestoringPurchases(false);
    }
  };

  if (status === 'unauthenticated') {
    return null;
  }

  // Don't show pricing page to premium users
  if (isPremium) {
    return null;
  }

  const nativePurchaseFooter = usesNativeBilling ? (
    <div className="native-purchase-footer">
      <p className="secondary-text">Already subscribed through Apple?</p>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleRestorePurchases}
        disabled={restoringPurchases || loading !== null || nativePlansLoading}
      >
        {restoringPurchases ? 'Restoring...' : 'Restore Purchases'}
      </button>
      <p className="secondary-text native-purchase-legal">
        Subscriptions renew automatically unless cancelled through your Apple account.{' '}
        <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy Policy</Link>
      </p>
    </div>
  ) : null;

  return (
    <div className="page-stack">
      {displayMessage && (
        <div className={displayMessage.type === 'success' ? 'text-green' : 'text-red'}>
          {displayMessage.text}
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
              <h4>See what is costing you strokes.</h4>
              <div className="pricing-price">
                <span className="price-amount">
                  {usesNativeBilling
                    ? formatNativePrice(nativeOffering?.monthly.product)
                    : `$${PRICING.monthly.price.toFixed(2)}`}
                </span>
                <span className="price-period">/month</span>
              </div>
            </div>
            <div className="pricing-card-body">
              <ul className="pricing-features">
                <li><Check color='green' size='20' className="feature-icon"/> Full strokes gained breakdown by part of the game</li>
                <li><Check color='green' size='20' className="feature-icon"/> Post-round breakdowns and game trends across your rounds</li>
                <li><Check color='green' size='20' className="feature-icon"/> See where your scores and handicap may be heading</li>
                <li><Check color='green' size='20' className="feature-icon"/> Full-history trends across all your rounds</li>
                <li><Check color='green' size='20' className="feature-icon"/> Premium themes and flexible filters</li>
                <li><Check color='green' size='20' className="feature-icon"/> Everything in Free</li>
              </ul>
              <button
                className="btn-upgrade"
                aria-label="Subscribe monthly to Premium plan"
                onClick={() => handleSubscribe('monthly')}
                disabled={loading !== null || status === 'loading' || subscriptionLoading || (usesNativeBilling && !nativeOffering)}
              >
                {loading === 'month'
                  ? usesNativeBilling ? 'Purchasing...' : 'Loading...'
                  : usesNativeBilling ? 'Subscribe Monthly' : 'See the Full Breakdown'}
              </button>
              <div>
                <p className="price-subtext">
                  {usesNativeBilling
                    ? `${formatNativePrice(nativeOffering?.monthly.product)} billed monthly through the App Store. Cancel anytime.`
                    : `$${PRICING.monthly.price.toFixed(2)} CAD billed monthly. Cancel anytime.`}
                </p>
              </div>
              {nativePurchaseFooter}
            </div>
          </div>
        )}

        {activeTab === 'annual' && (
          <div className="pricing-card featured single">
            <div className="pricing-badge savings">
              {usesNativeBilling ? 'Best Value' : `Save ${PRICING.annual.savings}`}
            </div>
            <div className="pricing-card-header">
              <h2>Premium Annual</h2>
              <h4>Track your improvement across the full season.</h4>
              <div className="pricing-price">
                <span className="price-amount">
                  {usesNativeBilling
                    ? formatNativePrice(nativeOffering?.annual.product)
                    : `$${PRICING.annual.price.toFixed(2)}`}
                </span>
                <span className="price-period">/year</span>
              </div>
              <p className="price-breakdown">
                {usesNativeBilling
                  ? formatNativeMonthlyEquivalent(nativeOffering?.annual.product)
                    ? <>Only <strong>{formatNativeMonthlyEquivalent(nativeOffering?.annual.product)} per month</strong></>
                    : 'Annual billing through the App Store'
                  : <>Only <strong>${(PRICING.annual.price / 12).toFixed(2)} per month</strong></>}
              </p>
            </div>
            <div className="pricing-card-body">
              <ul className="pricing-features">
                <li><Check color='green' size='20' className="feature-icon"/> <span>{usesNativeBilling ? 'One annual payment for 12 months' : <>Save <strong>{PRICING.annual.savings}</strong> vs monthly</>}</span></li>
                <li><Check color='green' size='20' className="feature-icon"/> Track your improvement across the full season</li>
                <li><Check color='green' size='20' className="feature-icon"/> See how your game changes as more rounds stack up</li>
                <li><Check color='green' size='20' className="feature-icon"/> Annual subscription, billed yearly</li>
                <li><Check color='green' size='20' className="feature-icon"/> Built for golfers who want to improve consistently</li>
              </ul>
              <button
                className="btn-upgrade"
                aria-label="Subscribe annually to Premium plan"
                onClick={() => handleSubscribe('annual')}
                disabled={loading !== null || status === 'loading' || subscriptionLoading || (usesNativeBilling && !nativeOffering)}
              >
                {loading === 'year'
                  ? usesNativeBilling ? 'Purchasing...' : 'Loading...'
                  : usesNativeBilling ? 'Subscribe Annually' : 'See the Full Breakdown'}
              </button>
              <div>
                <p className="price-subtext">
                  {usesNativeBilling
                    ? `${formatNativePrice(nativeOffering?.annual.product)} billed yearly through the App Store. Cancel anytime.`
                    : `$${PRICING.annual.price.toFixed(2)} CAD billed yearly. Save ${PRICING.annual.savings} vs monthly.`}
                </p>
              </div>
              {nativePurchaseFooter}
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
                Free forever. Upgrade when you want a clearer breakdown.
              </p>
            </div>
            <div className="pricing-card-body">
              <ul className="pricing-features">
                <li><Check color='green' size='20' className="feature-icon"/> Unlimited round tracking & storage</li>
                <li><Check color='green' size='20' className="feature-icon"/> Handicap & core scoring stats (last 20 rounds)</li>
                <li><Check color='green' size='20' className="feature-icon"/> FIR%, GIR%, putts & basic performance stats</li>
                <li><Check color='green' size='20' className="feature-icon"/> 9 hole & 18 hole support</li>
                <li><Check color='green' size='20' className="feature-icon"/> Course search, scorecards, friends, & leaderboards</li>
                <li><Check color='green' size='20' className="feature-icon"/> Light & dark themes, multi-device sync</li>
                <li><Check color='green' size='20' className="feature-icon"/> Basic post-round insights</li>
                <li><X color='red' size='20' className="feature-icon"/> Full strokes gained breakdown by part of the game</li>
                <li><X color='red' size='20' className="feature-icon"/> Score direction and extra comparison views</li>
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
              {usesNativeBilling
                ? 'Yes. You can cancel anytime through your Apple subscription settings.'
                : 'Yes. You can cancel your subscription at any time from your settings page.'}
            </p>
          </div>
          <div className="card faq-item">
            <h3>What payment methods do you accept?</h3>
            <p>
              {usesNativeBilling
                ? 'App Store purchases use the payment method associated with your Apple account.'
                : 'We accept major credit cards through our secure web billing checkout.'}
            </p>
          </div>
          <div className="card faq-item">
            <h3>Can I switch plans?</h3>
            <p>
              {usesNativeBilling
                ? 'Yes. Manage plan changes through your Apple subscription settings.'
                : 'Yes. You can upgrade or downgrade your plan at any time from your settings page.'}
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
              Yes. We use industry-standard encryption and never store your payment information. {usesNativeBilling
                ? 'Apple securely handles App Store payments.'
                : 'All web payments are securely handled through our billing provider.'}
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
