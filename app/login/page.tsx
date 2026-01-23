'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useMessage } from '../providers';
import { Eye, EyeOff } from 'lucide-react';

import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { message, showMessage, clearMessage } = useMessage();

  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [shouldRedirectToLanding, setShouldRedirectToLanding] = useState(false);

  // Lock scroll while on login page
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  // Redirect to landing page when private beta error is dismissed
  useEffect(() => {
    if (shouldRedirectToLanding && !message) {
      // Message was cleared (user clicked OK), now redirect
      router.push('/');
      setShouldRedirectToLanding(false);
    }
  }, [shouldRedirectToLanding, message, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessage();

    try {
      if (!isRegister) {
        // Login with NextAuth
        if (!form.email.trim()) {
          throw new Error('Please enter your email address');
        }
        if (!form.password) {
          throw new Error('Please enter your password');
        }

        const result = await signIn('credentials', {
          email: form.email,
          password: form.password,
          redirect: false,
        });

        if (result?.error) {
          // Provide user-friendly error messages
          if (result.error === 'CredentialsSignin' || result.error.includes('Invalid')) {
            throw new Error('Invalid email or password');
          }
          throw new Error(result.error);
        }

        if (result?.ok) {
          router.push('/dashboard');
        }
      } else {
        // Registration - Frontend validation
        if (!form.first_name.trim()) {
          throw new Error('First name is required');
        }
        if (form.first_name.trim().length > 50) {
          throw new Error('First name must be 50 characters or less');
        }
        if (!form.last_name.trim()) {
          throw new Error('Last name is required');
        }
        if (form.last_name.trim().length > 50) {
          throw new Error('Last name must be 50 characters or less');
        }
        if (!form.email.trim()) {
          throw new Error('Email address is required');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(form.email)) {
          throw new Error('Please enter a valid email address');
        }

        if (!form.password) {
          throw new Error('Password is required');
        }
        if (form.password.length < 8) {
          throw new Error('Password must be at least 8 characters long');
        }
        if (form.password.length > 100) {
          throw new Error('Password is too long (maximum 100 characters)');
        }
        if (form.password.includes(' ')) {
          throw new Error('Password cannot contain spaces');
        }
        if (!form.confirmPassword) {
          throw new Error('Please confirm your password');
        }
        if (form.password !== form.confirmPassword) {
          throw new Error('Passwords do not match');
        }

        const res = await fetch('/api/users/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: form.first_name,
            last_name: form.last_name,
            email: form.email,
            password: form.password,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          // Check if it's the private beta error
          if (res.status === 403 && data.message?.includes('private beta')) {
            showMessage(data.message, 'error');
            // Set flag to redirect when user dismisses the error modal
            setShouldRedirectToLanding(true);
            return;
          }
          throw new Error(data.message || 'Failed to create account. Please try again.');
        }

        showMessage('Account created successfully! Please check your email to verify your account. You can still login and use the app while unverified.', 'success');
        setIsRegister(false);
        setForm({ first_name: '', last_name: '', email: '', password: '', confirmPassword: '' });
        setShowPassword(false);
        setShowConfirmPassword(false);
      }
    } catch (err: any) {
      console.error('Login/register error:', err);
      showMessage(err.message || 'An error occurred. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-stack">
      <div className="card login-card">
        <form onSubmit={handleSubmit} className="form">
          {isRegister && (
            <>
              <input
                name="first_name"
                placeholder="First Name"
                value={form.first_name}
                onChange={handleChange}
                required
                className="form-input"
                max={100}
                onFocus={(e) => {
                  const len = e.target.value.length;
                  e.target.setSelectionRange(len, len);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                enterKeyHint="done"
              />
              <input
                name="last_name"
                placeholder="Last Name"
                value={form.last_name}
                onChange={handleChange}
                required
                className="form-input"
                max={100}
                onFocus={(e) => {
                  const len = e.target.value.length;
                  e.target.setSelectionRange(len, len);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                enterKeyHint="done"
              />
            </>
          )}
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
            className="form-input"
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
          <div style={{ position: 'relative' }}>
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              required
              className="form-input"
              style={{ paddingRight: '45px' }}
              max={100}
              onFocus={(e) => {
                const len = e.target.value.length;
                e.target.setSelectionRange(len, len);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              enterKeyHint="done"
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
          {isRegister && (
            <div style={{ position: 'relative' }}>
              <input
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm Password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                className="form-input"
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
          )}
          <button type="submit" className="btn btn-accent" disabled={loading}>
            {loading
              ? isRegister
                ? 'Registering...'
                : 'Logging in...'
              : isRegister
              ? 'Register'
              : 'Login'}
          </button>
        </form>

        {!isRegister && (
          <div style={{ textAlign: 'center', marginTop: '12px', marginBottom: '12px' }}>
            <Link href="/forgot-password" style={{ color: '#9AA3B2', fontSize: '14px', textDecoration: 'none' }}>
              Forgot Password?
            </Link>
          </div>
        )}

        <button onClick={() => setIsRegister(!isRegister)} className="btn btn-secondary">
          {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
        </button>
      </div>
    </div>
  );
}
