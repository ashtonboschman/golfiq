'use client';

import { Check, AlertCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SubscriptionSuccessPage() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [countdown, setCountdown] = useState(5);
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialEndDate, setTrialEndDate] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Verify the checkout session and activate subscription
  useEffect(() => {
    const verifySession = async () => {
      const sessionId = searchParams.get('session_id');

      if (!sessionId) {
        setError('No session ID found');
        setVerifying(false);
        return;
      }

      try {
        const res = await fetch('/api/stripe/verify-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || 'Failed to verify session');
        }

        setVerified(true);
        if (data.trialEndDate) {
          setTrialEndDate(data.trialEndDate);
        }
      } catch (err: any) {
        console.error('Verification error:', err);
        setError(err.message);
      } finally {
        setVerifying(false);
      }
    };

    if (status === 'authenticated') {
      verifySession();
    }
  }, [status, searchParams]);

  // Countdown timer - only start after verification
  useEffect(() => {
    if (!verified || verifying) return;

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [verified, verifying]);

  // Redirect when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && verified) {
      router.push('/dashboard');
    }
  }, [countdown, verified, router]);

  if (status === 'loading' || verifying) {
    return <p className='loading-text'>Activating your subscription...</p>;
  }

  if (status === 'unauthenticated') {
    return null;
  }

  if (error) {
    const isWrongUser = error.includes('does not belong to this user');

    return (
      <div className="page-stack">
        <div className="error-icon"><AlertCircle color='red' size={48} /></div>
        <h1>{isWrongUser ? 'Wrong Account' : 'Something went wrong'}</h1>
        <p className="error-message">
          {isWrongUser
            ? 'You are logged in with a different account than the one that started this checkout.'
            : error
          }
        </p>
        <p className="error-details">
          {isWrongUser
            ? 'Please log out and sign in with the account that initiated the subscription purchase.'
            : 'Your payment may have been processed. Please check your settings page or contact support.'
          }
        </p>
        <div className="success-actions">
          {isWrongUser ? (
            <button className="btn-primary" onClick={() => router.push('/api/auth/signout')}>
              Sign Out & Switch Account
            </button>
          ) : (
            <>
              <button className="btn-primary" onClick={() => router.push('/settings')}>
                Check Settings
              </button>
              <button className="btn-secondary" onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="success-icon"><Check color='green'/></div>
      <h1>Welcome to Premium!</h1>
      {trialEndDate ? (
        <>
          <p className="success-message">
            Your 14-day free trial has started!
          </p>
          <p className="success-details">
            You now have full access to all premium features. Your trial ends on{' '}
            {new Date(trialEndDate).toLocaleDateString()}. Cancel anytime before then to avoid charges.
          </p>
        </>
      ) : (
        <>
          <p className="success-message">
            Your subscription has been activated successfully.
          </p>
          <p className="success-details">
            You now have access to all premium features including Insights,
            full leaderboard access, and unlimited analytics history.
          </p>
        </>
      )}
      <div className="success-actions">
        <button
          className="btn-primary"
          onClick={() => router.push('/dashboard')}
        >
          Go to Dashboard
        </button>
        <button
          className="btn-secondary"
          onClick={() => router.push('/settings')}
        >
          Manage Subscription
        </button>
      </div>
      <p className="success-redirect">
        Redirecting to dashboard in {countdown} seconds...
      </p>
    </div>
  );
}
