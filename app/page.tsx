'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LandingHeader from '@/components/landing/LandingHeader';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import InsightsCTA from '@/components/landing/InsightsCTA';
import WaitlistForm from '@/components/landing/WaitlistForm';
import LandingFooter from '@/components/landing/LandingFooter';

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Redirect authenticated users to dashboard
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  // Show loading state while checking auth
  if (status === 'loading') {
    return (
      <div className="page-stack">
        <p className="loading-text">Loading...</p>
      </div>
    );
  }

  // If authenticated, don't render landing page (will redirect)
  if (status === 'authenticated') {
    return null;
  }

  // Show landing page for unauthenticated users
  return (
    <div className="landing-page">
      <LandingHeader />
      <main className="landing-main">
        <Hero />
        <Features />
        <InsightsCTA />
        <WaitlistForm />
      </main>
      <LandingFooter />
    </div>
  );
}
