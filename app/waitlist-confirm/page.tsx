'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, TriangleAlert, X, Loader2 } from 'lucide-react';

function WaitlistConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      // Automatically confirm when page loads with token
      confirmWaitlist(tokenParam);
    }
  }, [searchParams]);

  const confirmWaitlist = async (confirmationToken: string) => {
    if (!confirmationToken) {
      setError('Invalid confirmation link. Please check your email for the correct link.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/waitlist/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: confirmationToken }),
      });

      const data = await res.json();

      if (data.type === 'success') {
        setSuccess(true);
      } else {
        setError(data.message || 'Confirmation failed. Please try again.');
      }
    } catch (err) {
      console.error('Waitlist confirmation error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="login-stack">
        <div className="card login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ marginBottom: '16px' }}><Loader2 size={48} className="spinning" /></div>
            <h1 className="auth-title">Confirming...</h1>
          </div>

          <p className="secondary-text" style={{ textAlign: 'center' }}>
            Please wait while we confirm your email address.
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="login-stack">
        <div className="card login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ marginBottom: '16px' }}><TriangleAlert size={48} color="var(--color-warning)" /></div>
            <h1 className="auth-title">Invalid Confirmation Link</h1>
          </div>

          <p className="secondary-text" style={{ marginBottom: '24px', textAlign: 'center' }}>
            This confirmation link is invalid. Please check your email for the correct link.
          </p>

          <button onClick={() => router.push('/')} className="btn btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="login-stack">
        <div className="card login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ marginBottom: '16px' }}><Check size={48} color="var(--color-success)" /></div>
            <h1 className="auth-title">You're Confirmed! 🎉</h1>
          </div>

          <p className="secondary-text" style={{ marginBottom: '24px', textAlign: 'center' }}>
            Thank you for confirming your email! We'll notify you as soon as GolfIQ launches.
          </p>

          <button onClick={() => router.push('/')} className="btn btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="login-stack">
        <div className="card login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ marginBottom: '16px' }}><X size={48} color="var(--color-red)" /></div>
            <h1 className="auth-title">Confirmation Failed</h1>
          </div>

          <p className="secondary-text" style={{ marginBottom: '24px', textAlign: 'center' }}>
            {error}
          </p>

          <button onClick={() => router.push('/')} className="btn btn-primary">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function WaitlistConfirmPage() {
  return (
    <Suspense fallback={<div className="loading-text">Loading...</div>}>
      <WaitlistConfirmForm />
    </Suspense>
  );
}
