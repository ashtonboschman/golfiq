'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function WaitlistForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [handicap, setHandicap] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);

  useEffect(() => {
    // Check for confirmation status in URL params
    const confirmed = searchParams.get('confirmed');
    const alreadyConfirmed = searchParams.get('already_confirmed');
    const error = searchParams.get('error');

    if (confirmed === 'true') {
      setMessage('✓ Email confirmed! You are on the list. We will notify you when beta opens.');
      setMessageType('success');
    } else if (alreadyConfirmed === 'true') {
      setMessage('You have already confirmed your email. Thanks for your interest!');
      setMessageType('success');
    } else if (error) {
      setMessage('There was an error confirming your email. Please try signing up again.');
      setMessageType('error');
    }

    // Fetch current waitlist count
    fetch('/api/waitlist')
      .then((res) => res.json())
      .then((data) => setWaitlistCount(data.count))
      .catch(() => setWaitlistCount(null));
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, handicap }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to join waitlist');
      }

      setMessage('✓ Success! Check your email to confirm your spot on the waitlist.');
      setMessageType('success');
      setEmail('');
      setName('');
      setHandicap('');

      // Update count
      if (waitlistCount !== null) {
        setWaitlistCount(waitlistCount + 1);
      }
    } catch (error: any) {
      setMessage(error.message || 'Something went wrong. Please try again.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="waitlist" className="landing-waitlist">
      <div className="landing-waitlist-inner">
        <div className="landing-waitlist-header">
          <h2 className="landing-section-title">Join the Beta</h2>
          <p className="landing-section-subtitle">
            Be among the first to experience GolfIQ. All beta testers get full premium access for free.
          </p>
          {waitlistCount !== null && waitlistCount > 0 && (
            <p className="landing-waitlist-count">
              Join {waitlistCount}+ golfers already on the list
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="landing-waitlist-form">
          <div className="landing-form-row">
            <input
              type="email"
              placeholder="Email address *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={(e) => {
                const input = e.target as HTMLInputElement;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              enterKeyHint="done"
              className="form-input landing-form-input"
              required
              disabled={loading}
            />
          </div>

          <div className="landing-form-row landing-form-row-split">
            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              className="form-input landing-form-input"
              disabled={loading}
            />
            <input
              type="text"
              placeholder="Handicap (optional)"
              value={handicap}
              onChange={(e) => setHandicap(e.target.value)}
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
              className="form-input landing-form-input"
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-accent btn-large btn-full" disabled={loading}>
            {loading ? 'Joining...' : 'Join Beta Waitlist'}
          </button>

          {message && (
            <div className={`landing-form-message ${messageType === 'error' ? 'error' : 'success'}`}>
              {message}
            </div>
          )}
        </form>

        <p className="landing-waitlist-disclaimer">
          By joining the waitlist, you agree to receive email updates about GolfIQ beta access.
          You can unsubscribe at any time.
        </p>
      </div>
    </section>
  );
}
