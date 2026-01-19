'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import SubscriptionBadge from '@/components/SubscriptionBadge';
import { useSubscription } from '@/hooks/useSubscription';
import { getDaysUntilExpiry, getTierDisplayName } from '@/lib/subscription';
import { Download, PartyPopper, Upload } from 'lucide-react';
import { useMessage } from '@/app/providers';
import { useTheme } from '@/context/ThemeContext';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { tier, status: subscriptionStatus, endDate, trialEndDate, loading, isPremium } = useSubscription();
  const [managingSubscription, setManagingSubscription] = useState(false);
  const { showMessage } = useMessage();
  const [exporting, setExporting] = useState(false);
  const { theme, setTheme, availableThemes } = useTheme();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/settings');
    }
  }, [status, router]);

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

  if (status === 'loading') {
    return <p className='loading-text'>Loading...</p>;
  }

  if (status === 'unauthenticated') {
    return null;
  }

  const daysUntilExpiry = endDate ? getDaysUntilExpiry(endDate, tier) : null;

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
                        {trialEndDate && new Date() < new Date(trialEndDate) ? (
                          <>
                            <p className="subscription-status" style={{ color: 'var(--color-success)' }}>
                              Status <strong>Free Trial Active</strong>
                            </p>
                            <p className="subscription-expiry">
                              Trial ends on {new Date(trialEndDate).toLocaleDateString()}
                              {' '}({Math.ceil((new Date(trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days remaining)
                            </p>
                            <p className="subscription-note">
                              Your card will be charged after the trial ends. Cancel anytime before then to avoid charges.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="subscription-status">
                              Status <strong>{subscriptionStatus}</strong>
                            </p>
                            {endDate && daysUntilExpiry !== null && (
                              <>
                                {daysUntilExpiry > 0 ? (
                                  <p className="subscription-expiry">
                                    Renews in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
                                  </p>
                                ) : (
                                  <p className="subscription-expiry warning">
                                    Subscription expired. Please update your payment method.
                                  </p>
                                )}
                              </>
                            )}
                            {subscriptionStatus === 'cancelled' && endDate && (
                              <p className="subscription-expiry warning">
                                Access ends on {endDate.toLocaleDateString()}
                              </p>
                            )}
                          </>
                        )}
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

          {/* Preferences Section */}
          <section className="settings-section">
            <div className="settings-card">                            
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: '1' }}>
                <label className="form-label">Theme</label>
                {!loading && !isPremium && (
                  <span style={{ color: 'var(--color-accent)' }}>
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
                />
              </div>
            </div>
          </section>

          {/* Data Export Section */}
          <section className="settings-section">
            <div className="settings-card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: '1' }}>
                <label className="form-label">Export</label>
                {!loading && !isPremium && (
                  <span style={{ color: 'var(--color-accent)' }}>
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
            <div className="settings-card">
              <button
                className="btn btn-secondary"
                onClick={() => router.push('/admin/import-course')}
              >
                <Upload/> Import Course Data
              </button>
            </div>
          </section>
          )}
    </div>
  );
}
