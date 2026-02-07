'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function LandingHeader() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <div className="landing-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ cursor: 'pointer' }}>
          <Image
            src="/logos/wordmark/golfiq-wordmark.png"
            alt="GolfIQ"
            width={160}
            height={40}
            priority
          />
        </div>

        <nav className="landing-nav" style={{ whiteSpace: 'nowrap' }}>
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('features');
            }}
            className="landing-nav-link"
          >
            Features
          </a>
          <a
            href="#insights"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('insights');
            }}
            className="landing-nav-link"
          >
            AI Insights
          </a>
        </nav>

        <div className="landing-header-actions" style={{ whiteSpace: 'nowrap' }}>
          <Link href="/login" className="btn btn-secondary">
            Login
          </Link>
          <a
            href="#waitlist"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('waitlist');
            }}
            className="btn btn-accent"
          >
            Join Beta
          </a>
        </div>
      </div>
    </header>
  );
}
