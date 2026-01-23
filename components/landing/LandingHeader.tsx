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
          <button onClick={() => scrollToSection('features')} className="landing-nav-link">
            Features
          </button>
          <button onClick={() => scrollToSection('insights')} className="landing-nav-link">
            AI Insights
          </button>
        </nav>

        <div className="landing-header-actions" style={{ whiteSpace: 'nowrap' }}>
          <Link href="/login" className="btn btn-secondary">
            Login
          </Link>
          <button onClick={() => scrollToSection('waitlist')} className="btn btn-accent">
            Join Beta
          </button>
        </div>
      </div>
    </header>
  );
}
