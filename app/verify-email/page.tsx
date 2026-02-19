'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMessage } from '@/app/providers';
import { Check, TriangleAlert, X, Loader2 } from 'lucide-react';
import { AuthCardSkeleton } from '@/components/skeleton/PageSkeletons';

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showMessage } = useMessage();

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const verifyEmail = useCallback(async (verificationToken: string) => {
    if (!verificationToken) {
      setError('Invalid verification link. Please check your email for the correct link.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationToken }),
      });

      const data = await res.json();

      if (data.type === 'success') {
        setSuccess(true);
        showMessage(data.message, 'success');
      } else {
        setError(data.message || 'Verification failed. Please try again.');
        showMessage(data.message || 'Verification failed. Please try again.', 'error');
      }
    } catch (err) {
      console.error('Email verification error:', err);
      setError('An error occurred. Please try again.');
      showMessage('An error occurred. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      // Automatically verify when page loads with token
      verifyEmail(tokenParam);
    }
  }, [searchParams, verifyEmail]);

  if (loading) {
    return (
      <div className="login-stack">
        <div className="card login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ marginBottom: '16px' }}><Loader2 size={50} className="spinning" /></div>
            <h1 className="auth-title">Verifying Email...</h1>
          </div>

          <p className="secondary-text" style={{ textAlign: 'center' }}>
            Please wait while we verify your email address.
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
            <div style={{ marginBottom: '16px' }}><TriangleAlert size={50} color="var(--color-warning)" /></div>
            <h1 className="auth-title">Invalid Verification Link</h1>
          </div>

          <p className="secondary-text" style={{ marginBottom: '24px', textAlign: 'center' }}>
            This email verification link is invalid. Please check your email for the correct link.
          </p>

          <button onClick={() => router.push('/login')} className="btn btn-accent">
            Go to Login
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
            <div style={{ marginBottom: '16px' }}><Check size={50} color="var(--color-success)" /></div>
            <h1 className="auth-title">Email Verified!</h1>
          </div>

          <p className="secondary-text" style={{ marginBottom: '24px', textAlign: 'center' }}>
            Your email has been successfully verified. You can now access all features of GolfIQ.
          </p>

          <button onClick={() => router.push('/dashboard')} className="btn btn-accent">
            Go to Dashboard
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
            <div style={{ marginBottom: '16px' }}><X size={50} color="var(--color-red)" /></div>
            <h1 className="auth-title">Verification Failed</h1>
          </div>

          <p className="secondary-text" style={{ marginBottom: '24px', textAlign: 'center' }}>
            {error}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={() => router.push('/dashboard')} className="btn btn-accent">
              Go to Dashboard
            </button>
            <button onClick={() => router.push('/login')} className="btn btn-secondary">
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <VerifyEmailForm />
    </Suspense>
  );
}
