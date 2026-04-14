'use client';

import { Check, Rocket } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef } from 'react';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import type { ReactNode } from 'react';

const MODAL_EVENT_DEDUPE_MS = 5000;
const modalViewedCache = new Map<string, number>();
const modalDismissedCache = new Map<string, number>();

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  titleBadge?: string;
  message: string;
  features?: string[];
  showCloseButton?: boolean;
  ctaLocation?: string;
  paywallContext?: string;
  milestoneRound?: number | null;
  analyticsMode?: 'upgrade' | 'none';
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  onPrimaryAction?: () => void;
  icon?: ReactNode;
}

/**
 * Upgrade Modal Component
 *
 * Beautiful modal to promote premium features
 *
 * Usage:
 * ```tsx
 * <UpgradeModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   title="Unlock Intelligent Insights"
 *   message="You've logged 3 rounds! Upgrade to Premium for advanced trends and deeper analysis."
 *   features={['Intelligent Insights', 'Unlimited Analytics']}
 * />
 * ```
 */
export default function UpgradeModal({
  isOpen,
  onClose,
  title,
  titleBadge,
  message,
  features = [],
  showCloseButton = true,
  ctaLocation = 'upgrade_modal',
  paywallContext = 'upgrade_modal',
  milestoneRound = null,
  analyticsMode = 'upgrade',
  primaryButtonLabel = 'Upgrade to Premium',
  secondaryButtonLabel = 'Maybe Later',
  onPrimaryAction,
  icon,
}: UpgradeModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const upgradeInitiatedRef = useRef(false);

  const getDedupeKey = useCallback(
    (suffix: string) =>
      `${session?.user?.id ?? 'anon'}:${pathname}:${ctaLocation}:${milestoneRound ?? 'none'}:${suffix}`,
    [ctaLocation, milestoneRound, pathname, session?.user?.id],
  );

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (analyticsMode === 'upgrade' && !upgradeInitiatedRef.current) {
          const dedupeKey = getDedupeKey('dismiss_escape');
          const now = Date.now();
          const lastSeen = modalDismissedCache.get(dedupeKey);
          if (!lastSeen || now - lastSeen > MODAL_EVENT_DEDUPE_MS) {
            modalDismissedCache.set(dedupeKey, now);
            captureClientEvent(
              ANALYTICS_EVENTS.checkoutFailed,
              {
                failure_stage: 'milestone_modal_dismissed',
                dismiss_source: 'escape',
                cta_location: ctaLocation,
                paywall_context: paywallContext,
                ...(milestoneRound != null ? { milestone_round: milestoneRound, rounds_lifetime: milestoneRound } : {}),
                source_page: pathname,
              },
              {
                pathname,
                user: {
                  id: session?.user?.id,
                  subscription_tier: session?.user?.subscription_tier,
                  auth_provider: session?.user?.auth_provider,
                },
                isLoggedIn: status === 'authenticated',
              },
            );
          }
        }
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [
    analyticsMode,
    ctaLocation,
    getDedupeKey,
    isOpen,
    milestoneRound,
    onClose,
    pathname,
    paywallContext,
    session?.user?.auth_provider,
    session?.user?.id,
    session?.user?.subscription_tier,
    status,
  ]);

  useEffect(() => {
    if (!isOpen || analyticsMode !== 'upgrade') {
      upgradeInitiatedRef.current = false;
      return;
    }

    const dedupeKey = getDedupeKey('viewed');
    const now = Date.now();
    const lastSeen = modalViewedCache.get(dedupeKey);
    if (lastSeen && now - lastSeen <= MODAL_EVENT_DEDUPE_MS) return;
    modalViewedCache.set(dedupeKey, now);

    captureClientEvent(
      ANALYTICS_EVENTS.paywallViewed,
      {
        paywall_context: paywallContext,
        locked_feature: 'premium_upgrade_modal',
        cta_location: ctaLocation,
        ...(milestoneRound != null ? { milestone_round: milestoneRound, rounds_lifetime: milestoneRound } : {}),
        source_page: pathname,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );
  }, [
    analyticsMode,
    ctaLocation,
    getDedupeKey,
    isOpen,
    milestoneRound,
    pathname,
    paywallContext,
    session?.user?.auth_provider,
    session?.user?.id,
    session?.user?.subscription_tier,
    status,
  ]);

  const handleDismiss = (source: 'button' | 'backdrop') => {
    if (analyticsMode === 'upgrade' && !upgradeInitiatedRef.current) {
      const dedupeKey = getDedupeKey(`dismiss_${source}`);
      const now = Date.now();
      const lastSeen = modalDismissedCache.get(dedupeKey);
      if (!lastSeen || now - lastSeen > MODAL_EVENT_DEDUPE_MS) {
        modalDismissedCache.set(dedupeKey, now);
        captureClientEvent(
          ANALYTICS_EVENTS.checkoutFailed,
          {
            failure_stage: 'milestone_modal_dismissed',
            dismiss_source: source,
            cta_location: ctaLocation,
            paywall_context: paywallContext,
            ...(milestoneRound != null ? { milestone_round: milestoneRound, rounds_lifetime: milestoneRound } : {}),
            source_page: pathname,
          },
          {
            pathname,
            user: {
              id: session?.user?.id,
              subscription_tier: session?.user?.subscription_tier,
              auth_provider: session?.user?.auth_provider,
            },
            isLoggedIn: status === 'authenticated',
          },
        );
      }
    }

    onClose();
  };

  if (!isOpen) return null;

  const handlePrimary = () => {
    upgradeInitiatedRef.current = true;
    if (analyticsMode === 'upgrade') {
      captureClientEvent(
        ANALYTICS_EVENTS.upgradeCtaClicked,
        {
          cta_location: ctaLocation,
          ...(milestoneRound != null ? { milestone_round: milestoneRound, rounds_lifetime: milestoneRound } : {}),
          source_page: pathname,
        },
        {
          pathname,
          user: {
            id: session?.user?.id,
            subscription_tier: session?.user?.subscription_tier,
            auth_provider: session?.user?.auth_provider,
          },
          isLoggedIn: status === 'authenticated',
        },
      );
    }
    onClose();
    if (onPrimaryAction) {
      onPrimaryAction();
      return;
    }
    if (analyticsMode === 'upgrade') {
      router.push('/pricing');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="upgrade-modal-backdrop"
        onClick={showCloseButton ? () => handleDismiss('backdrop') : undefined}
      />

      {/* Modal */}
      <div className="upgrade-modal">
        <div className="upgrade-modal-content">
          {/* Icon */}
          <div className="upgrade-modal-icon">{icon ?? <Rocket color='var(--color-accent)' size={50}/>}</div>

          {/* Title */}
          <div className="upgrade-modal-title-row">
            <h2 className="upgrade-modal-title">{title}</h2>
            {titleBadge ? <span className="upgrade-modal-title-badge">{titleBadge}</span> : null}
          </div>

          {/* Message */}
          <p className="upgrade-modal-message">{message}</p>

          {/* Features List */}
          {features.length > 0 && (
            <ul className="upgrade-modal-features">
              {features.map((feature, index) => (
                <li key={index}>
                  <span className="upgrade-modal-checkmark"><Check color='var(--color-success)'/></span>
                  {feature}
                </li>
              ))}
            </ul>
          )}

          {/* Buttons */}
          <div className="card">
            <button
              className="btn btn-upgrade"
              onClick={handlePrimary}
            >
              {primaryButtonLabel}
            </button>
            {showCloseButton && (
              <button
                className="btn btn-secondary"
                onClick={() => handleDismiss('button')}
              >
                {secondaryButtonLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
