'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMessage } from '@/app/providers';
import Link from 'next/link';

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showMessage } = useMessage();

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      // Automatically verify when page loads with token
      verifyEmail(tokenParam);
    }
  }, [searchParams]);

  const verifyEmail = async (verificationToken: string) => {
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
  };

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <h1 className="auth-title">Verifying Email...</h1>
          </div>

          <p style={{ textAlign: 'center', color: '#666' }}>
            Please wait while we verify your email address.
          </p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h1 className="auth-title">Invalid Verification Link</h1>
          </div>

          <p style={{ marginBottom: '24px', textAlign: 'center', color: '#666' }}>
            This email verification link is invalid. Please check your email for the correct link.
          </p>

          <Link href="/login" className="btn btn-primary w-full" style={{ textAlign: 'center' }}>
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h1 className="auth-title">Email Verified!</h1>
          </div>

          <p style={{ marginBottom: '24px', textAlign: 'center', color: '#666' }}>
            Your email has been successfully verified. You can now access all features of GolfIQ.
          </p>

          <Link href="/dashboard" className="btn btn-primary w-full" style={{ textAlign: 'center' }}>
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <h1 className="auth-title">Verification Failed</h1>
          </div>

          <p style={{ marginBottom: '24px', textAlign: 'center', color: '#666' }}>
            {error}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Link href="/dashboard" className="btn btn-primary" style={{ textAlign: 'center' }}>
              Go to Dashboard
            </Link>
            <Link href="/login" className="btn btn-secondary" style={{ textAlign: 'center' }}>
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="loading-text">Loading...</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
