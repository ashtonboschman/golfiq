'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import OnboardingInsightsPreview from '@/components/onboarding/previews/OnboardingInsightsPreview';
import OnboardingGpsPreview from '@/components/onboarding/previews/OnboardingGpsPreview';
import OnboardingLiveRoundPreview from '@/components/onboarding/previews/OnboardingLiveRoundPreview';
import OnboardingTrendPreview from '@/components/onboarding/previews/OnboardingTrendPreview';
import {
  ONBOARDING_TOTAL_STEPS,
  markOnboardingCompleted,
  readOnboardingState,
  writeOnboardingState,
} from '@/lib/onboarding/state';
import styles from './page.module.css';

function toStep(value: string | null): number {
  const parsed = Number(value ?? '1');
  if (!Number.isFinite(parsed)) return 1;
  const rounded = Math.floor(parsed);
  return Math.min(ONBOARDING_TOTAL_STEPS, Math.max(1, rounded));
}

function buildLoginHref(mode: 'register' | 'login'): string {
  const nextPath = mode === 'register' ? '/post-signup' : '/dashboard';
  return `/login?mode=${mode}&next=${encodeURIComponent(nextPath)}`;
}

function getCardMaxHeight(card: HTMLElement, wrapper: HTMLElement | null): number {
  const computedMaxHeight = Number.parseFloat(window.getComputedStyle(card).maxHeight);
  return Number.isFinite(computedMaxHeight)
    ? computedMaxHeight
    : (wrapper?.clientHeight ?? card.clientHeight);
}

function OnboardingContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const viewedStepsRef = useRef<Set<number>>(new Set());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cardShellRef = useRef<HTMLElement | null>(null);
  const insightsPreviewRef = useRef<HTMLDivElement | null>(null);
  const livePreviewRef = useRef<HTMLDivElement | null>(null);
  const trendPreviewRef = useRef<HTMLDivElement | null>(null);
  const [insightsPreviewMaxHeight, setInsightsPreviewMaxHeight] = useState<number | null>(null);
  const [livePreviewMaxHeight, setLivePreviewMaxHeight] = useState<number | null>(null);
  const [trendPreviewMaxHeight, setTrendPreviewMaxHeight] = useState<number | null>(null);

  const step = toStep(searchParams.get('step'));
  const source = searchParams.get('source') || 'direct';
  const isAnalyticsEligible = status === 'unauthenticated';
  const registerHref = useMemo(() => buildLoginHref('register'), []);
  const loginHref = useMemo(() => buildLoginHref('login'), []);

  const analyticsContext = useMemo(
    () => ({
      pathname,
      user: {
        id: session?.user?.id,
        subscription_tier: session?.user?.subscription_tier,
        auth_provider: session?.user?.auth_provider,
      },
      isLoggedIn: status === 'authenticated',
    }),
    [pathname, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, status],
  );

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [router, status]);

  // Keep onboarding as a fixed-screen flow; only inner preview regions should scroll.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const pageContainer = document.querySelector<HTMLElement>('main.page-container');

    const originalHtmlOverflow = html.style.overflow;
    const originalHtmlOverscrollBehaviorY = html.style.overscrollBehaviorY;
    const originalBodyOverflow = body.style.overflow;
    const originalBodyOverscrollBehaviorY = body.style.overscrollBehaviorY;
    const originalPageContainerOverflow = pageContainer?.style.overflow;
    const originalPageContainerOverscrollBehaviorY = pageContainer?.style.overscrollBehaviorY;

    html.style.overflow = 'hidden';
    html.style.overscrollBehaviorY = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehaviorY = 'none';
    if (pageContainer) {
      pageContainer.style.overflow = 'hidden';
      pageContainer.style.overscrollBehaviorY = 'none';
    }

    return () => {
      html.style.overflow = originalHtmlOverflow;
      html.style.overscrollBehaviorY = originalHtmlOverscrollBehaviorY;
      body.style.overflow = originalBodyOverflow;
      body.style.overscrollBehaviorY = originalBodyOverscrollBehaviorY;
      if (pageContainer) {
        pageContainer.style.overflow = originalPageContainerOverflow ?? '';
        pageContainer.style.overscrollBehaviorY = originalPageContainerOverscrollBehaviorY ?? '';
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAnalyticsEligible) return;
    const current = readOnboardingState();
    if (!current.startedAt) {
      captureClientEvent(
        ANALYTICS_EVENTS.onboardingStarted,
        { source },
        analyticsContext,
      );
    }

    writeOnboardingState({
      startedAt: current.startedAt ?? new Date().toISOString(),
      source: current.source ?? source,
      lastStep: step,
    });

    if (!viewedStepsRef.current.has(step)) {
      viewedStepsRef.current.add(step);
      captureClientEvent(
        ANALYTICS_EVENTS.onboardingStepViewed,
        { step, source },
        analyticsContext,
      );
    }
  }, [analyticsContext, isAnalyticsEligible, source, step]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (status !== 'unauthenticated') return;
    if (step !== 1) return;

    const card = cardShellRef.current;
    const wrapper = wrapperRef.current;
    const preview = insightsPreviewRef.current;
    if (!card || !preview) return;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const insightsViewport = preview.querySelector<HTMLElement>('[data-onboarding-insights-scroll]');
        const naturalPreviewHeight = insightsViewport?.scrollHeight ?? preview.scrollHeight;
        const currentPreviewHeight = preview.clientHeight;
        const maxCardHeight = getCardMaxHeight(card, wrapper);
        const projectedCardHeight = card.scrollHeight - currentPreviewHeight + naturalPreviewHeight;
        const overflow = projectedCardHeight - maxCardHeight;

        const nextValue = overflow > 1
          ? Math.max(190, Math.floor(naturalPreviewHeight - overflow - 4))
          : null;

        setInsightsPreviewMaxHeight((prev) => {
          if (prev === null && nextValue === null) return prev;
          if (prev !== null && nextValue !== null && Math.abs(prev - nextValue) <= 1) return prev;
          return nextValue;
        });
      });
    };

    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(card);
    }
    window.addEventListener('resize', measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [status, step]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (status !== 'unauthenticated') return;
    if (step !== 3) return;

    const card = cardShellRef.current;
    const wrapper = wrapperRef.current;
    const preview = livePreviewRef.current;
    if (!card || !preview) return;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const liveScrollViewport = preview.querySelector<HTMLElement>('[data-onboarding-live-scroll]');
        const naturalPreviewHeight = liveScrollViewport?.scrollHeight ?? preview.scrollHeight;
        const currentPreviewHeight = preview.clientHeight;
        const maxCardHeight = getCardMaxHeight(card, wrapper);
        const projectedCardHeight = card.scrollHeight - currentPreviewHeight + naturalPreviewHeight;
        const overflow = projectedCardHeight - maxCardHeight;

        const nextValue = overflow > 1
          ? Math.max(220, Math.floor(naturalPreviewHeight - overflow - 4))
          : null;

        setLivePreviewMaxHeight((prev) => {
          if (prev === null && nextValue === null) return prev;
          if (prev !== null && nextValue !== null && Math.abs(prev - nextValue) <= 1) return prev;
          return nextValue;
        });
      });
    };

    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(card);
    }
    window.addEventListener('resize', measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [status, step]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (status !== 'unauthenticated') return;
    if (step !== 4) return;

    const card = cardShellRef.current;
    const wrapper = wrapperRef.current;
    const preview = trendPreviewRef.current;
    if (!card || !preview) return;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const trendViewport = preview.querySelector<HTMLElement>('[data-onboarding-trend-scroll]');
        const naturalPreviewHeight = trendViewport?.scrollHeight ?? preview.scrollHeight;
        const currentPreviewHeight = preview.clientHeight;
        const maxCardHeight = getCardMaxHeight(card, wrapper);
        const projectedCardHeight = card.scrollHeight - currentPreviewHeight + naturalPreviewHeight;
        const overflow = projectedCardHeight - maxCardHeight;

        const nextValue = overflow > 1
          ? Math.max(180, Math.floor(naturalPreviewHeight - overflow - 4))
          : null;

        setTrendPreviewMaxHeight((prev) => {
          if (prev === null && nextValue === null) return prev;
          if (prev !== null && nextValue !== null && Math.abs(prev - nextValue) <= 1) return prev;
          return nextValue;
        });
      });
    };

    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(card);
    }
    window.addEventListener('resize', measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [status, step]);

  const navigateToStep = (nextStep: number) => {
    router.replace(`/onboarding?step=${nextStep}&source=${encodeURIComponent(source)}`);
  };

  const completeCurrentStep = (currentStep: number) => {
    if (!isAnalyticsEligible) return;
    captureClientEvent(
      ANALYTICS_EVENTS.onboardingStepCompleted,
      { step: currentStep, source },
      analyticsContext,
    );
  };

  const handleSkip = () => {
    markOnboardingCompleted();

    if (isAnalyticsEligible) {
      captureClientEvent(
        ANALYTICS_EVENTS.onboardingSkipped,
        { step, source },
        analyticsContext,
      );
    }
    router.push(registerHref);
  };

  const handleIntroLogin = () => {
    markOnboardingCompleted();
    if (!isAnalyticsEligible) return;

    captureClientEvent(
      ANALYTICS_EVENTS.onboardingSkipped,
      { step: 1, source },
      analyticsContext,
    );
    captureClientEvent(
      ANALYTICS_EVENTS.onboardingLoginStarted,
      { source },
      analyticsContext,
    );
  };

  const handleFinalCta = (mode: 'register' | 'login') => {
    completeCurrentStep(5);
    const beforeComplete = readOnboardingState();
    const startedAtMs = beforeComplete.startedAt ? Date.parse(beforeComplete.startedAt) : Number.NaN;
    const durationMs = Number.isFinite(startedAtMs) ? Math.max(0, Date.now() - startedAtMs) : null;

    markOnboardingCompleted();

    if (isAnalyticsEligible) {
      captureClientEvent(
        ANALYTICS_EVENTS.onboardingCompleted,
        {
          source,
          ...(durationMs != null ? { onboarding_duration_ms: durationMs } : {}),
        },
        analyticsContext,
      );
    }

    if (mode === 'register') {
      if (isAnalyticsEligible) {
        captureClientEvent(
          ANALYTICS_EVENTS.onboardingSignupStarted,
          { source },
          analyticsContext,
        );
      }
      router.push(registerHref);
      return;
    }

    if (isAnalyticsEligible) {
      captureClientEvent(
        ANALYTICS_EVENTS.onboardingLoginStarted,
        { source },
        analyticsContext,
      );
    }
    router.push(loginHref);
  };

  if (status !== 'unauthenticated') {
    return null;
  }

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <section
        ref={cardShellRef}
        className={`${styles.cardShell} ${step >= 1 && step <= 4 ? styles.cardShellConstrained : ''}`}
      >
        {step > 1 && (
          <div className={styles.topRow}>
            <div className={styles.dots} aria-label="Onboarding progress">
              {Array.from({ length: ONBOARDING_TOTAL_STEPS - 1 }).map((_, index) => {
                const onboardingStep = index + 1;
                return (
                  <span
                    key={`onboarding-dot-${onboardingStep}`}
                    className={`${styles.dot} ${onboardingStep === step - 1 ? styles.dotActive : ''}`}
                    aria-current={onboardingStep === step - 1 ? 'step' : undefined}
                  />
                );
              })}
            </div>
            {step < ONBOARDING_TOTAL_STEPS && (
              <button type="button" className={styles.skipButton} onClick={handleSkip}>
                Skip
              </button>
            )}
          </div>
        )}

        {step === 1 && (
          <div className={styles.screen}>
            <div className={styles.contentZone}>
              <div
                ref={insightsPreviewRef}
                className={`${styles.visual} ${styles.visualStep1} ${insightsPreviewMaxHeight ? styles.visualStep1Constrained : ''}`}
                style={
                  insightsPreviewMaxHeight
                    ? ({ ['--onboarding-insights-preview-max-height' as string]: `${insightsPreviewMaxHeight}px` } as Record<string, string>)
                    : undefined
                }
              >
                <OnboardingInsightsPreview />
              </div>
              <div className={styles.titleGroup}>
                <h1 className={styles.title}>Your Game, Explained.</h1>
                <p className={styles.copy}>
                  See how your scoring is trending, what’s working, and how consistent you’ve been.
                </p>
              </div>
            </div>
            <div className={styles.actionZone}>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  completeCurrentStep(1);
                  navigateToStep(2);
                }}
              >
                Get Started
              </button>
              <Link href={loginHref} className={`btn btn-secondary ${styles.secondaryButton}`} onClick={handleIntroLogin}>
                Sign In
              </Link>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.screen}>
            <div className={styles.contentZone}>
              <div className={styles.visual}>
                <OnboardingGpsPreview />
              </div>
              <div className={styles.titleGroup}>
                <h1 className={`${styles.title} ${styles.gpsTitle}`}>
                  <span>Less Guessing.</span>{' '}
                  <span>More Confidence.</span>
                </h1>
                <p className={styles.copy}>
                  Get live distances and club suggestions on mapped courses so you can focus on the shot.
                </p>
              </div>
            </div>
            <div className={styles.actionZone}>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  completeCurrentStep(2);
                  navigateToStep(3);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={`${styles.screen} ${styles.screenStep3}`}>
            <div className={`${styles.contentZone} ${styles.contentZoneStep3}`}>
              <div
                ref={livePreviewRef}
                className={`${styles.visual} ${styles.visualStep3} ${livePreviewMaxHeight ? styles.visualStep3Constrained : ''}`}
                style={
                  livePreviewMaxHeight
                    ? ({ ['--onboarding-live-preview-max-height' as string]: `${livePreviewMaxHeight}px` } as Record<string, string>)
                    : undefined
                }
              >
                <OnboardingLiveRoundPreview />
              </div>
              <div className={styles.titleGroup}>
                <h1 className={styles.title}>Built for the Pace of Play.</h1>
                <p className={styles.copy}>
                  Log each hole in seconds, track what matters, and keep play moving.
                </p>
              </div>
            </div>
            <div className={styles.actionZone}>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  completeCurrentStep(3);
                  navigateToStep(4);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className={`${styles.screen} ${styles.screenStep4}`}>
            <div className={`${styles.contentZone} ${styles.contentZoneStep4}`}>
              <div
                ref={trendPreviewRef}
                className={`${styles.visual} ${styles.visualStep4} ${trendPreviewMaxHeight ? styles.visualStep4Constrained : ''}`}
                style={
                  trendPreviewMaxHeight
                    ? ({ ['--onboarding-trend-preview-max-height' as string]: `${trendPreviewMaxHeight}px` } as Record<string, string>)
                    : undefined
                }
              >
                <OnboardingTrendPreview />
              </div>
              <h1 className={styles.title}>Your Game Gets Clearer With Every Round.</h1>
              <div className={styles.progressionLadder} aria-label="Round progression milestones">
                <div className={styles.progressionRow}>
                  <span className={styles.progressionBadge}>1 Round</span>
                  <p>See what shaped your score</p>
                </div>
                <div className={styles.progressionConnector} aria-hidden="true" />
                <div className={styles.progressionRow}>
                  <span className={styles.progressionBadge}>3 Rounds</span>
                  <p>Start spotting real patterns</p>
                </div>
                <div className={styles.progressionConnector} aria-hidden="true" />
                <div className={styles.progressionRow}>
                  <span className={styles.progressionBadge}>10 Rounds</span>
                  <p>See stronger game trends</p>
                </div>
              </div>
            </div>
            <div className={styles.actionZone}>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  completeCurrentStep(4);
                  navigateToStep(5);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className={`${styles.screen} ${styles.screenFinal}`}>
            <div className={`${styles.contentZone} ${styles.contentZoneFinal}`}>
              <div className={styles.titleGroup}>
                <h1 className={`${styles.title} ${styles.titleFinal}`}>Your Next Round Starts Here.</h1>
                <p className={styles.copy}>Track rounds, play with confidence, and understand your game.</p>
              </div>
            </div>
            <div className={`${styles.actionZone} ${styles.actionZoneFinal}`}>
              <button type="button" className="btn btn-accent" onClick={() => handleFinalCta('register')}>
                Create Free Account
              </button>
              <button type="button" className={`btn btn-secondary ${styles.secondaryButton}`} onClick={() => handleFinalCta('login')}>
                Sign In
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}
