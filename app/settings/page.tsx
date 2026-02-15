'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import SubscriptionBadge from '@/components/SubscriptionBadge';
import { useSubscription } from '@/hooks/useSubscription';
import { Download, PartyPopper, Upload } from 'lucide-react';
import { useMessage } from '@/app/providers';
import { useTheme } from '@/context/ThemeContext';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { tier, status: subscriptionStatus, endsAt, cancelAtPeriodEnd, loading, isPremium } = useSubscription();
  const [managingSubscription, setManagingSubscription] = useState(false);
  const { showMessage } = useMessage();
  const [exporting, setExporting] = useState(false);
  const { theme, setTheme, availableThemes } = useTheme();
  const [showStrokesGained, setShowStrokesGained] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/settings');
    }
  }, [status, router]);

  // Fetch user profile to get current showStrokesGained preference
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/users/profile');
        if (res.ok) {
          const data = await res.json();
          setShowStrokesGained(data.profile?.showStrokesGained ?? false);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setLoadingProfile(false);
      }
    };

    if (status === 'authenticated') {
      fetchProfile();
    }
  }, [status]);

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

  const handleExportData = async (format: 'csv' | 'json') => {
    setExporting(true);

    try {
      const res = await fetch(`/api/export/rounds?format=${format}`);

      if (res.status === 403) {
        const data = await res.json();
        // Show upgrade message when limit reached
        const limitMessage = data.message || 'Free users are limited to 1 export per month. Upgrade to Premium for unlimited exports.';
        showMessage(limitMessage, 'error');
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
      a.download = `golfiq_rounds_${new Date().toISOString().split('T')[0]}.${format}`;
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

  const handleToggleStrokesGained = async (value: boolean) => {
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_strokes_gained: value }),
      });

      if (!res.ok) {
        throw new Error('Failed to update preference');
      }

      setShowStrokesGained(value);
      showMessage('Preference updated successfully!', 'success');
    } catch (error: any) {
      console.error('Update preference error:', error);
      showMessage(error.message || 'Failed to update preference', 'error');
    }
  };

  if (status === 'loading') {
    return <p className='loading-text'>Loading...</p>;
  }

  if (status === 'unauthenticated') {
    return null;
  }

  const isCancelScheduled = subscriptionStatus === 'active' && cancelAtPeriodEnd;
  const isExpired = Boolean(endsAt && endsAt.getTime() <= Date.now());

  return (
    <div className="page-stack">
          {/* Subscription Section */}
          <section className="settings-section">
            <div className="settings-card">
              <div className="subscription-info">
                <div className="subscription-info-row">
                  <span className="subscription-label">Current Plan</span>
                  <SubscriptionBadge size="medium" />
                </div>

                {loading && (
                  <p className="subscription-detail">Loading subscription details...</p>
                )}

                {!loading && (
                  <>
                    {tier === 'free' && (
                      <div className="subscription-detail-box">
                        <p>
                          You're currently on the free plan. Upgrade to Premium to unlock
                          advanced features like Insights, strokes gained, unlimited analytics history,
                          premium themes, and more!
                        </p>
                        <button
                          className="btn-upgrade"
                          onClick={() => router.push('/pricing')}
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
                {!loading && !isPremium && (
                  <span className="settings-theme-description">
                    Upgrade to Premium to unlock additional themes!
                  </span>
                )}
                <Select
                  value={availableThemes.find(t => t.value === theme)}
                  onChange={(option) => {
                    if (!option) return;

                    const themeInfo = availableThemes.find(t => t.value === option.value);

                    if (themeInfo?.premiumOnly && !loading && !isPremium) {
                      showMessage('This theme is only available for Premium users. Upgrade to unlock!', 'error');
                      router.push('/pricing');
                      return;
                    }

                    setTheme(option.value);
                    showMessage('Theme updated successfully!', 'success');
                  }}
                  options={availableThemes.map(t => ({
                    ...t,
                    label: t.premiumOnly && !loading && !isPremium ? `${t.label} (Premium)` : t.label,
                    isDisabled: t.premiumOnly && !loading && !isPremium,
                  }))}
                  isSearchable={false}
                  styles={selectStyles}
                  className="settings-theme-select"
                />
              </div>
            </div>
          </section>

          {/* Preferences Section */}
          {!loading && isPremium && (
            <section className="settings-section">
              <div className="settings-card">
                <div className="preferences-container">
                  <label className="form-label">Preferences</label>

                  <div className="preference-row">
                    <div className="preference-info">
                      <div className="preference-title">Show Strokes Gained</div>
                      <div className="preference-description">
                        Display strokes gained data in round statistics
                      </div>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={showStrokesGained}
                        onChange={(e) => handleToggleStrokesGained(e.target.checked)}
                        disabled={loadingProfile}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Data Export Section */}
          <section className="settings-section">
            <div className="settings-card">
              <div className="settings-export-container">
                <label className="form-label">Export</label>
                {!loading && !isPremium && (
                  <span className="settings-export-upgrade">
                    Upgrade to Premium for unlimited exports plus Json!
                  </span>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => handleExportData('csv')}
                  disabled={exporting}
                >
                  <Download/>{exporting ? ' Exporting...' : ' Export CSV'}
                </button>
                {!loading && isPremium && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleExportData('json')}
                    disabled={exporting}
                  >
                    <Download/>{exporting ? ' Exporting...' : ' Export JSON'}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Admin Section */}
          {session?.user?.id === '1' && (
          <section className="settings-section">
            <div className="card settings-card">
              <button
                className="btn btn-secondary"
                onClick={() => router.push('/admin/import-course')}
              >
                <Upload/> Import Course Data
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => router.push('/admin/waitlist')}
              >
                <Upload/> Manage Waitlist
              </button>
            </div>
          </section>
          )}
    </div>
  );
}
