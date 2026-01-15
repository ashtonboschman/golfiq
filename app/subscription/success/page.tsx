'use client';

import { Check } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SubscriptionSuccessPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Redirect when countdown reaches 0
  useEffect(() => {
    if (countdown === 0) {
      router.push('/dashboard');
    }
  }, [countdown, router]);

  if (status === 'loading') {
    return <p className='loading-text'>Loading...</p>;
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="page-stack">
          <div className="success-icon"><Check color='green'/></div>
          <h1>Welcome to Premium!</h1>
          <p className="success-message">
            Your subscription has been activated successfully.
          </p>
          <p className="success-details">
            You now have access to all premium features including Insights,
            full leaderboard access, and unlimited analytics history.
          </p>
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
