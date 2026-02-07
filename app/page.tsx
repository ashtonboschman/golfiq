import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import LandingHeader from '@/components/landing/LandingHeader';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import InsightsCTA from '@/components/landing/InsightsCTA';
import WaitlistForm from '@/components/landing/WaitlistForm';
import LandingFooter from '@/components/landing/LandingFooter';

export const metadata: Metadata = {
  title: 'GolfIQ | AI Golf Analytics and Round Tracking',
  description:
    'Track golf rounds, analyze strokes gained, and improve faster with GolfIQ AI insights built from real performance data.',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'GolfIQ | AI Golf Analytics and Round Tracking',
    description:
      'Track golf rounds, analyze strokes gained, and improve faster with GolfIQ AI insights built from real performance data.',
    url: 'https://www.golfiq.ca/',
    siteName: 'GolfIQ',
    images: [
      {
        url: '/logos/share/golfiq-share.png',
        width: 1200,
        height: 630,
        alt: 'GolfIQ app preview',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GolfIQ | AI Golf Analytics and Round Tracking',
    description:
      'Track golf rounds, analyze strokes gained, and improve faster with GolfIQ AI insights built from real performance data.',
    images: ['/logos/share/golfiq-share.png'],
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
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://www.golfiq.ca/courses/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
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
    </>
  );
}
