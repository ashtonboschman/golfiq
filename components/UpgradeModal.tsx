'use client';

import { Check, Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  features?: string[];
  showCloseButton?: boolean;
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
 *   title="Unlock AI-Powered Insights"
 *   message="You've logged 3 rounds! Upgrade to Premium to get AI-powered coaching and predictions."
 *   features={['AI Coach Analysis', 'Unlimited Analytics', 'Ad-Free Experience']}
 * />
 * ```
 */
export default function UpgradeModal({
  isOpen,
  onClose,
  title,
  message,
  features = [],
  showCloseButton = true,
}: UpgradeModalProps) {
  const router = useRouter();

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleUpgrade = () => {
    onClose();
    router.push('/pricing');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="upgrade-modal-backdrop"
        onClick={showCloseButton ? onClose : undefined}
      />

      {/* Modal */}
      <div className="upgrade-modal">
        <div className="upgrade-modal-content">
          {/* Icon */}
          <div className="upgrade-modal-icon"><Rocket/></div>

          {/* Title */}
          <h2 className="upgrade-modal-title">{title}</h2>

          {/* Message */}
          <p className="upgrade-modal-message">{message}</p>

          {/* Features List */}
          {features.length > 0 && (
            <ul className="upgrade-modal-features">
              {features.map((feature, index) => (
                <li key={index}>
                  <span className="upgrade-modal-checkmark"><Check color='green'/></span>
                  {feature}
                </li>
              ))}
            </ul>
          )}

          {/* Buttons */}
          <div className="upgrade-modal-buttons">
            <button
              className="upgrade-modal-button-primary"
              onClick={handleUpgrade}
            >
              Upgrade to Premium
            </button>
            {showCloseButton && (
              <button
                className="upgrade-modal-button-secondary"
                onClick={onClose}
              >
                Maybe Later
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
