import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-config';
import LandingHeader from '@/components/landing/LandingHeader';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import InsightsCTA from '@/components/landing/InsightsCTA';
import PricingPreview from '@/components/landing/PricingPreview';
import LandingFooter from '@/components/landing/LandingFooter';
import NativeRootEntryGate from '@/components/NativeRootEntryGate';
import { PRICING } from '@/lib/subscription';

export const metadata: Metadata = {
  title: 'GolfIQ | Golf GPS, Round Tracking & Insights',
  description:
    'Track rounds quickly, use live GPS and My Bag club suggestions on supported courses, and understand your game with GolfIQ stats and insights.',
  keywords: [
    'golf app',
    'golf round tracker',
    'golf GPS app',
    'golf club recommendations',
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
    title: 'GolfIQ | Golf GPS, Round Tracking & Insights',
    description:
      'Track rounds quickly, use live GPS and My Bag club suggestions on supported courses, and understand your game with GolfIQ stats and insights.',
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
    title: 'GolfIQ | Golf GPS, Round Tracking & Insights',
    description:
      'Track rounds quickly, use live GPS and My Bag club suggestions on supported courses, and understand your game with GolfIQ stats and insights.',
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
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'golfiqapp@gmail.com',
    },
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
    operatingSystem: 'Web, iOS',
    url: 'https://www.golfiq.ca',
    description:
      'Track rounds quickly, use live GPS and My Bag club suggestions on supported courses, and understand your game with GolfIQ stats and insights.',
    offers: [
      {
        '@type': 'Offer',
        name: 'GolfIQ Free',
        price: '0',
        priceCurrency: 'CAD',
        url: 'https://www.golfiq.ca/pricing',
      },
      {
        '@type': 'Offer',
        name: 'GolfIQ Premium Monthly',
        price: PRICING.monthly.price.toFixed(2),
        priceCurrency: PRICING.monthly.currency,
        url: 'https://www.golfiq.ca/pricing',
      },
      {
        '@type': 'Offer',
        name: 'GolfIQ Premium Annual',
        price: PRICING.annual.price.toFixed(2),
        priceCurrency: PRICING.annual.currency,
        url: 'https://www.golfiq.ca/pricing',
      },
    ],
  };

  return (
    <NativeRootEntryGate>
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
          <PricingPreview />
        </main>
        <LandingFooter />
      </div>
    </NativeRootEntryGate>
  );
}
