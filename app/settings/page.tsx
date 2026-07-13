'use client';

import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import SubscriptionBadge from '@/components/SubscriptionBadge';
import { useSubscription } from '@/hooks/useSubscription';
import { Download, MessageSquare, PartyPopper } from 'lucide-react';
import { useMessage } from '@/app/providers';
import { useTheme } from '@/context/ThemeContext';
import {
  DEFAULT_LIVE_ROUND_TRACKING_PREFS,
  LIVE_ROUND_TRACKING_SETTINGS,
  liveRoundTrackingPrefsToProfileFields,
  normalizeLiveRoundTrackingPrefs,
  profileFieldsToLiveRoundTrackingPrefs,
  type LiveRoundTrackingPrefs,
} from '@/lib/rounds/liveRoundTracking';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';
import { SkeletonBlock } from '@/components/skeleton/Skeleton';
import { getBillingPlatform } from '@/lib/platform';
import { isAdminUserId } from '@/lib/admin';

const FEEDBACK_MIN_LENGTH = 10;
const FEEDBACK_MAX_LENGTH = 2000;

type FeedbackType = 'bug' | 'idea' | 'other';
type FeedbackOption = {
  value: FeedbackType;
  label: string;
};

const FEEDBACK_TYPE_OPTIONS: FeedbackOption[] = [
  { value: 'other', label: 'General feedback' },
  { value: 'bug', label: 'Bug report' },
  { value: 'idea', label: 'Feature idea' },
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { tier, status: subscriptionStatus, endsAt, cancelAtPeriodEnd, loading, isPremium, provider } = useSubscription();
  const [managingSubscription, setManagingSubscription] = useState(false);
  const { showMessage, showConfirm } = useMessage();
  const [exporting, setExporting] = useState(false);
  const { theme, setTheme, availableThemes } = useTheme();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('other');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [billingQueryState, setBillingQueryState] = useState<string | null>(null);
  const [liveRoundTracking, setLiveRoundTracking] = useState<LiveRoundTrackingPrefs>(
    DEFAULT_LIVE_ROUND_TRACKING_PREFS,
  );
  const [savedLiveRoundTracking, setSavedLiveRoundTracking] = useState<LiveRoundTrackingPrefs>(
    DEFAULT_LIVE_ROUND_TRACKING_PREFS,
  );
  const [loadingLiveRoundTracking, setLoadingLiveRoundTracking] = useState(true);
  const [savingLiveRoundTracking, setSavingLiveRoundTracking] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/settings');
    }
  }, [status, router]);

  useEffect(() => {
    if (billingQueryState !== 'success') return;
    router.replace('/subscription/success?billing=success');
  }, [billingQueryState, router]);

  useEffect(() => {
    setBillingQueryState(new URLSearchParams(window.location.search).get('billing'));
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchProfile = async () => {
      setLoadingLiveRoundTracking(true);
      try {
        const response = await fetch('/api/users/profile');
        if ([401, 403].includes(response.status)) {
          router.push('/login?redirect=/settings');
          return;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load settings');
        }

        const nextPrefs = profileFieldsToLiveRoundTrackingPrefs(data.profile);
        setLiveRoundTracking(nextPrefs);
        setSavedLiveRoundTracking(nextPrefs);
      } catch (error: any) {
        console.error('Live round tracking settings error:', error);
        showMessage(error.message || 'Failed to load live round tracking settings.', 'error');
      } finally {
        setLoadingLiveRoundTracking(false);
      }
    };

    fetchProfile();
  }, [router, showMessage, status]);

  const liveRoundTrackingChanged = JSON.stringify(liveRoundTracking) !== JSON.stringify(savedLiveRoundTracking);

  const handleManageSubscription = async () => {
    setManagingSubscription(true);

    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to open billing portal');
      }

      // Redirect to Stripe billing portal
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error('Billing portal error:', error);
      showMessage(error.message || 'Failed to open billing portal', 'error');
      setManagingSubscription(false);
    }
  };

  const handleExportData = async (format: 'csv' | 'excel' | 'json') => {
    setExporting(true);

    try {
      const res = await fetch(`/api/export/rounds?format=${format}`);

      if (res.status === 403) {
        const data = await res.json();
        showMessage(data.message || 'Export is not available right now.', 'error');
        setExporting(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Export failed');
      }

      // Download the file
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const extensionByFormat: Record<'csv' | 'excel' | 'json', string> = {
        csv: 'csv',
        excel: 'xlsx',
        json: 'json',
      };
      a.download = `golfiq_rounds_${new Date().toISOString().split('T')[0]}.${extensionByFormat[format]}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showMessage('Data exported successfully!', 'success');
    } catch (error: any) {
      console.error('Export error:', error);
      showMessage(error.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleLiveRoundTrackingChange = (
    key: keyof LiveRoundTrackingPrefs,
    checked: boolean,
  ) => {
    setLiveRoundTracking((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const handleSaveLiveRoundTracking = async () => {
    setSavingLiveRoundTracking(true);

    try {
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(liveRoundTrackingPrefsToProfileFields(liveRoundTracking)),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save live round tracking settings.');
      }

      const nextPrefs = normalizeLiveRoundTrackingPrefs(liveRoundTracking);
      setLiveRoundTracking(nextPrefs);
      setSavedLiveRoundTracking(nextPrefs);
      showMessage(data.message || 'Live round tracking updated successfully!', 'success');
    } catch (error: any) {
      console.error('Save live round tracking error:', error);
      showMessage(error.message || 'Failed to save live round tracking settings.', 'error');
    } finally {
      setSavingLiveRoundTracking(false);
    }
  };

  const handleDeleteAccount = () => {
    showConfirm({
      title: 'Delete account?',
      message:
        'Delete your account permanently? This cannot be undone and will remove your rounds, insights, friends, profile, and subscription access.',
      cancelText: 'Keep Account',
      confirmText: 'Delete Account',
      variant: 'danger',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setDeletingAccount(true);
        try {
          const res = await fetch('/api/users/account', {
            method: 'DELETE',
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            throw new Error(data.message || 'Failed to delete account');
          }

          showMessage(data.message || 'Account deleted successfully.', 'success');
          try {
            localStorage.removeItem('golfiq:auth');
          } catch {
            // noop
          }
          await signOut({ redirect: false });
          router.replace('/');
        } catch (error: any) {
          console.error('Delete account error:', error);
          showMessage(error.message || 'Failed to delete account', 'error');
          setDeletingAccount(false);
        }
      },
    });
  };

  const handleSubmitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = feedbackMessage.trim();
    if (trimmed.length < FEEDBACK_MIN_LENGTH) {
      showMessage(`Feedback must be at least ${FEEDBACK_MIN_LENGTH} characters.`, 'error');
      return;
    }

    if (trimmed.length > FEEDBACK_MAX_LENGTH) {
      showMessage(`Feedback must be ${FEEDBACK_MAX_LENGTH} characters or less.`, 'error');
      return;
    }

    setSubmittingFeedback(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: feedbackType,
          message: trimmed,
          page: '/settings',
          appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to submit feedback.');
      }

      setFeedbackType('other');
      setFeedbackMessage('');
      showMessage(data?.message || 'Thanks for your feedback!', 'success');
    } catch (error: any) {
      console.error('Feedback submit error:', error);
      showMessage(error?.message || 'Failed to submit feedback.', 'error');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (status === 'unauthenticated') {
    return null;
  }

  const showSessionSkeleton = status === 'loading';
  const showSubscriptionSkeleton = showSessionSkeleton || loading;
  const liveRoundTrackingInputsDisabled =
    loadingLiveRoundTracking || savingLiveRoundTracking || showSessionSkeleton;
  const billingPlatform = getBillingPlatform();
  const usesNativeBilling = billingPlatform === 'ios_iap';
  const canManageStripeOnThisPlatform = provider === 'stripe' && !usesNativeBilling;

  const isCancelScheduled = subscriptionStatus === 'active' && cancelAtPeriodEnd;
  const isExpired = Boolean(endsAt && endsAt.getTime() <= Date.now());

  const handleUpgrade = () => {
    if (usesNativeBilling) {
      showMessage('App Store subscriptions coming soon.', 'error');
    }
    router.push('/pricing');
  };

  return (
    <div className="page-stack">
          {/* Subscription Section */}
          <section className="settings-section">
            <div className="settings-card">
              <div className="subscription-info">
                <div className="subscription-info-row">
                  <span className="subscription-label">Current Plan</span>
                  {showSubscriptionSkeleton ? (
                    <SkeletonBlock width={78} height={24} rounded="pill" />
                  ) : (
                    <SubscriptionBadge size="medium" />
                  )}
                </div>

                {showSubscriptionSkeleton ? (
                  <div className="subscription-detail-box">
                    <SkeletonBlock width="80%" height={14} />
                    <SkeletonBlock width="65%" height={14} />
                    <SkeletonBlock width="88%" height={14} />
                    <SkeletonBlock className="skeleton-btn" height={44} mt={8} />
                  </div>
                ) : (
                  <>
                    {tier === 'free' && (
                      <div className="subscription-detail-box">
                        <p>
                          You're currently on the free plan. Upgrade to Premium to unlock
                          full strokes gained breakdown, trends, deeper analytics history,
                          premium themes, and more!
                        </p>
                        <button
                          className="btn-upgrade"
                          onClick={handleUpgrade}
                        >
                          Upgrade to Premium
                        </button>
                      </div>
                    )}

                    {tier === 'premium' && (
                      <div className="subscription-detail-box">
                        <>
                          <p className="subscription-status">
                            Status <strong>{subscriptionStatus}</strong>
                          </p>
                          {endsAt && (
                            <>
                              {isExpired ? (
                                <p className="subscription-expiry warning">
                                  Subscription expired. Please update your payment method.
                                </p>
                              ) : (
                                <p className="subscription-expiry">
                                  {isCancelScheduled || subscriptionStatus === 'cancelled' ? 'Ends' : 'Renews'} on {endsAt.toLocaleDateString()}
                                </p>
                              )}
                            </>
                          )}
                          {subscriptionStatus === 'cancelled' && !endsAt && (
                            <p className="subscription-expiry warning">
                              Subscription cancelled.
                            </p>
                          )}
                          {subscriptionStatus === 'past_due' && (
                            <p className="subscription-expiry warning">
                              Payment is past due. Please update your payment method.
                            </p>
                          )}
                        </>
                        {canManageStripeOnThisPlatform && (
                          <>
                            <button
                              className="btn-manage"
                              onClick={handleManageSubscription}
                              disabled={managingSubscription}
                            >
                              {managingSubscription ? 'Opening...' : 'Manage Subscription'}
                            </button>
                            <p className="subscription-note">
                              You can update payment methods, view invoices, and cancel your
                              subscription from the billing portal.
                            </p>
                          </>
                        )}
                        {provider === 'stripe' && usesNativeBilling && (
                          <p className="subscription-note">
                            This subscription was started on the web. Billing management is currently available on the web.
                          </p>
                        )}
                        {provider === 'apple' && (
                          <p className="subscription-note">
                            Manage subscriptions through the App Store.
                          </p>
                        )}
                        {provider === 'revenuecat_web' && (
                          <p className="subscription-note">
                            Your web subscription is managed through the GolfIQ customer portal link included in your billing emails. Use that link to update payment details, cancel, or change plans.
                          </p>
                        )}
                        {provider === 'manual' && (
                          <p className="subscription-note">
                            Premium access is active on this account.
                          </p>
                        )}
                      </div>
                    )}

                    {tier === 'lifetime' && (
                      <div className="subscription-detail-box lifetime">
                        <p className="lifetime-note"><PartyPopper/> You have lifetime access to all Premium features!</p>
                        <p className="lifetime-subscription-note">
                          Thank you for your continued support. You'll never need to pay again.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Themes Section */}
          <section className="settings-section">
            <div className="settings-card">
              <div className="settings-theme-container">
                <label className="form-label">Theme</label>
                {!showSubscriptionSkeleton && !isPremium && (
                  <span className="settings-theme-description">
                    Upgrade to Premium to unlock additional themes!
                  </span>
                )}
                {showSessionSkeleton ? (
                  <SkeletonBlock className="skeleton-select" height={42} />
                ) : (
                  <Select
                    inputId="theme-select"
                    value={availableThemes.find(t => t.value === theme)}
                    onChange={(option) => {
                      if (!option) return;

                      const themeInfo = availableThemes.find(t => t.value === option.value);

                      if (themeInfo?.premiumOnly && !showSubscriptionSkeleton && !isPremium) {
                        showMessage('This theme is only available for Premium users. Upgrade to unlock!', 'error');
                        handleUpgrade();
                        return;
                      }

                      setTheme(option.value);
                      showMessage('Theme updated successfully!', 'success');
                    }}
                    options={availableThemes.map(t => ({
                      ...t,
                      label: t.premiumOnly && !showSubscriptionSkeleton && !isPremium ? `${t.label} (Premium)` : t.label,
                      isDisabled: t.premiumOnly && !showSubscriptionSkeleton && !isPremium,
                    }))}
                    isSearchable={false}
                    styles={selectStyles}
                    className="settings-theme-select"
                  />
                )}
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-card">
              <div className="preferences-container">
                <label className="form-label">Live Round Tracking</label>
                <p className="settings-feedback-helper">
                  Choose which stats GolfIQ shows while you track a live round.
                </p>
                {LIVE_ROUND_TRACKING_SETTINGS.map((setting) => (
                  <div key={setting.key} className="preference-row">
                    <div className="preference-info">
                      <div className="preference-title">{setting.label}</div>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        aria-label={setting.label}
                        checked={liveRoundTracking[setting.key]}
                        onChange={(event) =>
                          handleLiveRoundTrackingChange(setting.key, event.target.checked)
                        }
                        disabled={liveRoundTrackingInputsDisabled}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                ))}
                {!loadingLiveRoundTracking && liveRoundTrackingChanged && (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-save"
                      onClick={handleSaveLiveRoundTracking}
                      disabled={liveRoundTrackingInputsDisabled}
                    >
                      {savingLiveRoundTracking ? 'Saving...' : 'Save Live Round Tracking'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Data Export Section */}
          <section className="settings-section">
            <div className="settings-card">
              <div className="settings-export-container">
                <label className="form-label">Export</label>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleExportData('csv')}
                  disabled={exporting || showSessionSkeleton}
                >
                  <Download/>{exporting ? ' Exporting...' : ' Export CSV'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleExportData('json')}
                  disabled={exporting || showSessionSkeleton}
                >
                  <Download/>{exporting ? ' Exporting...' : ' Export JSON'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleExportData('excel')}
                  disabled={exporting || showSessionSkeleton}
                >
                  <Download/>{exporting ? ' Exporting...' : ' Export Excel'}
                </button>
              </div>
            </div>
          </section>

          {/* Feedback Section */}
          <section className="settings-section">
            <div className="settings-card">
              <form className="settings-feedback-container" onSubmit={handleSubmitFeedback}>
                <div className="settings-feedback-title-row">
                  <label className="form-label" htmlFor="feedback-type">
                    Feedback
                  </label>
                  <MessageSquare size={16} className="settings-feedback-icon" />
                </div>
                <p className="settings-feedback-helper">
                  Found a bug or have an idea? Submit it here and we will review it.
                </p>
                {showSessionSkeleton ? (
                  <SkeletonBlock className="skeleton-select" height={42} />
                ) : (
                  <Select<FeedbackOption, false>
                    inputId="feedback-type"
                    className="settings-feedback-select"
                    value={FEEDBACK_TYPE_OPTIONS.find((option) => option.value === feedbackType)}
                    onChange={(option) => {
                      if (!option) return;
                      setFeedbackType(option.value);
                    }}
                    options={FEEDBACK_TYPE_OPTIONS}
                    isSearchable={false}
                    styles={selectStyles}
                    isDisabled={submittingFeedback || showSessionSkeleton}
                  />
                )}
                <textarea
                  id="feedback-message"
                  className="form-input settings-feedback-textarea"
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder="Share details here..."
                  minLength={FEEDBACK_MIN_LENGTH}
                  maxLength={FEEDBACK_MAX_LENGTH}
                  disabled={submittingFeedback || showSessionSkeleton}
                  aria-label="Feedback message"
                />
                <div className="settings-feedback-footer">
                  <span className="settings-feedback-count">
                    {feedbackMessage.trim().length}/{FEEDBACK_MAX_LENGTH}
                  </span>
                  <button
                    type="submit"
                    className="btn btn-secondary settings-feedback-submit"
                    disabled={submittingFeedback || showSessionSkeleton}
                  >
                    {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Admin Section */}
          {isAdminUserId(session?.user?.id) && (
          <section className="settings-section">
            <div className="settings-card">
              <div className="settings-export-container">
                <label className="form-label">Admin Tools</label>
                <button
                  className="btn btn-secondary"
                  onClick={() => router.push('/admin/import-course')}
                >
                  Import Course Data
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => router.push('/admin/feedback')}
                >
                  Manage Feedback
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => router.push('/admin/gps-hole-prototype')}
                >
                  GPS Prototype
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => router.push('/admin/gps-mapping')}
                >
                  GPS Mapping
                </button>
              </div>
            </div>
          </section>
          )}

          <section className="settings-section">
            <div className="settings-card">
              <div className="settings-export-container">
                <label className="form-label">Help and Legal</label>
                <button
                  className="btn btn-secondary settings-nav-button"
                  onClick={() => router.push('/settings/blocked-users')}
                >
                  Blocked Users
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => router.push('/contact?from=settings')}
                >
                  Contact Support
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => router.push('/privacy?from=settings')}
                >
                  Privacy Policy
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => router.push('/terms?from=settings')}
                >
                  Terms of Service
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-card settings-danger-card">
              <div className="settings-danger-content">
                <label className="form-label">Delete Account</label>
                <p className="settings-danger-text">
                  This action is permanent and cannot be undone. Your GolfIQ account data will be deleted.
                </p>
                <button
                  className="btn btn-logout"
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount || showSessionSkeleton}
                >
                  {deletingAccount ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </section>
    </div>
  );
}
