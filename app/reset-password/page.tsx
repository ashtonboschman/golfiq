'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMessage } from '@/app/providers';
import { TriangleAlert, Eye, EyeOff, Check } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showMessage } = useMessage();

  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      showMessage('Invalid reset link. Please request a new password reset.', 'error');
      return;
    }

    if (password.length < 8) {
      showMessage('Password must be at least 8 characters long.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showMessage('Passwords do not match.', 'error');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (data.type === 'success') {
        setSuccess(true);
        showMessage(data.message, 'success');

        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        showMessage(data.message || 'An error occurred. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Reset password error:', error);
      showMessage('An error occurred. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="login-stack">
        <div className="card login-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ marginBottom: '16px' }}><TriangleAlert size={48} color="var(--color-warning)" /></div>
            <h1 className="auth-title">Invalid Reset Link</h1>
          </div>

          <p className='secondary-text' style={{ marginBottom: '24px', textAlign: 'center' }}>
            This password reset link is invalid or has expired. Please request a new one.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={() => router.push('/forgot-password')} className="btn btn-accent">
              Request New Reset Link
            </button>
            <button onClick={() => router.push('/login')} className="btn btn-secondary">
              Back to Login
            </button>
          </div>
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
            <h1 className="auth-title">Password Reset Successful</h1>
          </div>

          <p className='secondary-text' style={{ marginBottom: '24px', textAlign: 'center' }}>
            Your password has been successfully reset. You will be redirected to the login page shortly.
          </p>

          <button onClick={() => router.push('/login')} className="btn btn-accent">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-stack">
      <div className="card login-card">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 className="auth-title">Reset Password</h1>
          <p className='secondary-text'>
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="Enter new password (min 8 characters)"
              minLength={8}
              required
              disabled={loading}
              style={{ paddingRight: '45px' }}
              max={100}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '0',
                color: '#9AA3B2',
              }}
              aria-label="Toggle password visibility"
            >
              {showPassword ? <Eye/> : <EyeOff/>}
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
              placeholder="Confirm new password"
              minLength={8}
              required
              disabled={loading}
              style={{ paddingRight: '45px' }}
              max={100}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '0',
                color: '#9AA3B2',
              }}
              aria-label="Toggle confirm password visibility"
            >
              {showConfirmPassword ? <Eye/> : <EyeOff/>}
            </button>
          </div>

          <button type="submit" className="btn btn-accent" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <button onClick={() => router.push('/login')} className="btn btn-secondary">
          Back to Login
        </button>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="loading-text">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
