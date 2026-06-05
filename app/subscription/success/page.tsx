'use client';

import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { AuthCardSkeleton } from '@/components/skeleton/PageSkeletons';

function SubscriptionSuccessContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const billingSuccess = searchParams.get('billing') === 'success';
  const [countdown, setCountdown] = useState(5);
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    const verifyStripeSession = async (stripeSessionId: string) => {
      try {
        const res = await fetch('/api/stripe/verify-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: stripeSessionId }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || 'Failed to verify session');
        }

        setVerified(true);
      } catch (err: any) {
        console.error('Verification error:', err);
        setError(err.message);
      } finally {
        setVerifying(false);
      }
    };

    if (status !== 'authenticated') return;

    if (sessionId) {
      verifyStripeSession(sessionId);
      return;
    }

    if (billingSuccess) {
      setVerified(true);
      setVerifying(false);
      return;
    }

    setError('We could not confirm your subscription activation.');
    setVerifying(false);
  }, [billingSuccess, sessionId, status]);

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
    return (
      <div className="login-stack">
        <div className="card login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ marginBottom: '16px' }}><Loader2 size={50} className="spinning" /></div>
            <h1 className="auth-title">Activating Premium...</h1>
          </div>
          <p className="secondary-text" style={{ textAlign: 'center' }}>
            Please wait while we confirm your premium access.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  if (error) {
    const isWrongUser = error.includes('does not belong to this user');

    return (
      <div className="login-stack">
        <div className="card login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ marginBottom: '16px' }}><AlertCircle size={50} color="var(--color-red)" /></div>
            <h1 className="auth-title">{isWrongUser ? 'Wrong Account' : 'Something Went Wrong'}</h1>
          </div>

          <p className="secondary-text" style={{ marginBottom: '12px', textAlign: 'center' }}>
            {isWrongUser
              ? 'You are logged in with a different account than the one that started this checkout.'
              : error
            }
          </p>
          <p className="secondary-text" style={{ marginBottom: '24px', textAlign: 'center', fontSize: '14px' }}>
            {isWrongUser
              ? 'Please log out and sign in with the account that initiated the subscription purchase.'
              : 'Your payment may have been processed. Please check your settings page or contact support.'
            }
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {isWrongUser ? (
              <button className="btn btn-primary" onClick={() => router.push('/api/auth/signout')}>
                Sign Out & Switch Account
              </button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => router.push('/settings')}>
                  Check Settings
                </button>
                <button className="btn btn-toggle" onClick={() => router.push('/dashboard')}>
                  Go to Dashboard
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-stack">
      <div className="card login-card">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ marginBottom: '16px' }}><Check size={50} color="var(--color-success)" /></div>
          <h1 className="auth-title">Welcome to Premium!</h1>
        </div>

        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <p className="secondary-text" style={{ marginBottom: '12px' }}>
            Your premium access is active.
          </p>
          <p className="secondary-text" style={{ fontSize: '14px' }}>
            You now have access to premium insights, trends, deeper comparisons,
            full leaderboard access, and longer analytics history.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button className="btn btn-toggle" onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </button>
          <button className="btn btn-toggle" onClick={() => router.push('/settings')}>
            Manage Subscription
          </button>
        </div>

        <p className="secondary-text" style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px' }}>
          Redirecting to dashboard in {countdown} seconds...
        </p>
      </div>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <SubscriptionSuccessContent />
    </Suspense>
  );
}
