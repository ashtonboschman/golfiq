'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import OnboardingInsightsPreview from '@/components/onboarding/previews/OnboardingInsightsPreview';
import OnboardingLiveRoundPreview from '@/components/onboarding/previews/OnboardingLiveRoundPreview';
import OnboardingTrendPreview from '@/components/onboarding/previews/OnboardingTrendPreview';
import {
  ONBOARDING_GOALS,
  markOnboardingCompleted,
  readOnboardingState,
  writeOnboardingState,
  type OnboardingGoal,
} from '@/lib/onboarding/state';
import styles from './page.module.css';

const TOTAL_STEPS = 5;

function toStep(value: string | null): number {
  const parsed = Number(value ?? '1');
  if (!Number.isFinite(parsed)) return 1;
  const rounded = Math.floor(parsed);
  return Math.min(TOTAL_STEPS, Math.max(1, rounded));
}

function buildLoginHref(mode: 'register' | 'login'): string {
  return `/login?mode=${mode}&next=${encodeURIComponent('/post-signup')}`;
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
  const [sessionSelectedGoal, setSessionSelectedGoal] = useState<OnboardingGoal | null>(null);
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
        const maxCardHeight = wrapper?.clientHeight ?? card.clientHeight;
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
  }, [step]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
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
        const maxCardHeight = wrapper?.clientHeight ?? card.clientHeight;
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
  }, [step]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
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
        const maxCardHeight = wrapper?.clientHeight ?? card.clientHeight;
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
  }, [step]);

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
    if (isAnalyticsEligible) {
      captureClientEvent(
        ANALYTICS_EVENTS.onboardingSkipped,
        { step, source },
        analyticsContext,
      );
    }
    router.push(registerHref);
  };

  const handleGoalSelect = (goal: OnboardingGoal) => {
    setSessionSelectedGoal(goal);
    writeOnboardingState({
      selectedGoal: goal,
      lastStep: 2,
      source,
    });

    if (isAnalyticsEligible) {
      captureClientEvent(
        ANALYTICS_EVENTS.onboardingGoalSelected,
        {
          selected_goal: goal,
          source,
        },
        analyticsContext,
      );
    }
    completeCurrentStep(2);
    navigateToStep(3);
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

  if (status === 'loading') {
    return null;
  }

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <section
        ref={cardShellRef}
        className={`${styles.cardShell} ${step === 1 || step === 3 || step === 4 ? styles.cardShellConstrained : ''}`}
      >
        <div className={styles.topRow}>
          <div className={styles.dots} aria-label="Onboarding progress">
            {Array.from({ length: TOTAL_STEPS }).map((_, index) => {
              const dotStep = index + 1;
              return (
                <span
                  key={`onboarding-dot-${dotStep}`}
                  className={`${styles.dot} ${dotStep === step ? styles.dotActive : ''}`}
                  aria-current={dotStep === step ? 'step' : undefined}
                />
              );
            })}
          </div>
          <button type="button" className={styles.skipButton} onClick={handleSkip}>
            Skip
          </button>
        </div>

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
              <h1 className={styles.title}>Track your rounds. Understand what shaped them.</h1>
              <p className={styles.copy}>
                GolfIQ helps explain your score, not just record it.
              </p>
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
              <Link href={loginHref} className={styles.secondaryLink}>
                I already have an account
              </Link>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className={styles.screen}>
            <div className={styles.contentZone}>
              <h1 className={styles.title}>What's your current goal?</h1>
              <div className={styles.optionGrid}>
                {ONBOARDING_GOALS.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    className={`${styles.optionButton} ${sessionSelectedGoal === goal ? styles.optionActive : ''}`}
                    onClick={() => handleGoalSelect(goal)}
                  >
                    {goal}
                  </button>
                ))}
              </div>
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
              <h1 className={styles.title}>Fast, Distraction-Free Tracking</h1>
              <p className={styles.copy}>Log each hole in seconds and stay focused on the round.</p>
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
              <h1 className={styles.title}>Your game gets clearer as the rounds add up</h1>
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
                  <p>See stronger trends and clearer score patterns</p>
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
              <h1 className={`${styles.title} ${styles.titleFinal}`}>Start Learning Your Game</h1>
              <p className={styles.copy}>
                Create your account and start seeing what helped, what hurt, and what to work on next.
              </p>
            </div>
            <div className={`${styles.actionZone} ${styles.actionZoneFinal}`}>
              <button type="button" className="btn btn-accent" onClick={() => handleFinalCta('register')}>
                Create Free Account
              </button>
              <button type="button" className={`btn btn-secondary ${styles.secondaryButton}`} onClick={() => handleFinalCta('login')}>
                I Already Have an Account
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
