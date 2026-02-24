import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth-config';
import LandingHeader from '@/components/landing/LandingHeader';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import InsightsCTA from '@/components/landing/InsightsCTA';
import WaitlistForm from '@/components/landing/WaitlistForm';
import LandingFooter from '@/components/landing/LandingFooter';

export const metadata: Metadata = {
  title: 'GolfIQ | Track Rounds. Unlock Insights. Score Lower.',
  description:
    'Track golf rounds, analyze strokes gained, and improve faster with GolfIQ insights built from real performance data.',
  keywords: [
    'golf app',
    'golf round tracker',
    'strokes gained app',
    'golf handicap tracker',
    'golf stats app',
    'golf performance analytics',
    'GolfIQ',
  ],
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'GolfIQ | Track Rounds. Unlock Insights. Score Lower.',
    description:
      'Track golf rounds, analyze strokes gained, and improve faster with GolfIQ insights built from real performance data.',
    url: 'https://www.golfiq.ca/',
    siteName: 'GolfIQ',
    images: [
      {
        url: '/twitter/golfiq-twitter-graphic.png',
        width: 1200,
        height: 630,
        alt: 'GolfIQ app preview',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GolfIQ | Track Rounds. Unlock Insights. Score Lower.',
    description:
      'Track golf rounds, analyze strokes gained, and improve faster with GolfIQ insights built from real performance data.',
    images: ['/twitter/golfiq-twitter-graphic.png'],
  },
};

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect('/dashboard');
  }

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'GolfIQ',
    url: 'https://www.golfiq.ca',
    logo: 'https://www.golfiq.ca/logos/share/golfiq-share.png',
    sameAs: [
      'https://facebook.com/golfiqofficial',
      'https://instagram.com/GolfIQApp',
      'https://x.com/GolfIQApp',
      'https://tiktok.com/@GolfIQApp',
      'https://threads.net/@GolfIQApp',
    ],
  };

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'GolfIQ',
    url: 'https://www.golfiq.ca',
  };

  const softwareApplicationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GolfIQ',
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Web',
    url: 'https://www.golfiq.ca',
    description:
      'Track golf rounds, analyze strokes gained, and improve faster with GolfIQ insights built from real performance data.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <div className="landing-page">
        <LandingHeader />
        <main className="landing-main">
          <Hero />
          <Features />
          <InsightsCTA />
          <Suspense fallback={null}>
            <WaitlistForm />
          </Suspense>
        </main>
        <LandingFooter />
      </div>
    </>
  );
}
