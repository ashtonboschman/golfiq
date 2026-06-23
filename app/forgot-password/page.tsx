'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMessage } from '@/app/providers';
import { Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { showMessage } = useMessage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      showMessage('Please enter your email address.', 'error');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await res.json();

      if (data.type === 'success') {
        setSubmitted(true);
        showMessage(data.message, 'success');
      } else {
        showMessage(data.message || 'An error occurred. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      showMessage('An error occurred. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="login-stack">
        <div className="card login-card">
          <div className="auth-status-header">
            <div className="auth-status-icon"><Mail size={50} color="var(--color-accent)" /></div>
            <h1 className="auth-title">Check Your Email</h1>
          </div>

          <div className="auth-copy-block">
            <p className="secondary-text auth-copy-tight">
              If an account exists for <strong>{email}</strong>, you will receive a password reset link shortly.
            </p>
            <p className="secondary-text auth-copy-small">
              The link will expire in 1 hour. Check your spam folder if you don't see it.
            </p>
          </div>

          <div className="auth-actions-stack">
            <button onClick={() => router.push('/login')} className="btn btn-accent">
              Return to Login
            </button>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setEmail('');
              }}
              className="btn btn-secondary"
            >
              Send Another Reset Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-stack">
      <div className="card login-card">
        <div className="auth-status-header">
          <h1 className="auth-title">Forgot Password</h1>
          <p className='secondary-text'>
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="form-input"
            placeholder="your.email@example.com"
            required
            disabled={loading}
            max={250}
            onFocus={(e) => {
              const input = e.target as HTMLInputElement;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            enterKeyHint="done"
          />

          <button type="submit" className="btn btn-accent" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <button onClick={() => router.push('/login')} className="btn btn-secondary">
          Back to Login
        </button>
      </div>
    </div>
  );
}
