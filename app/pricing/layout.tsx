import type { Metadata } from 'next';
import { PRICING } from '@/lib/subscription';

const pricingTitle = 'GolfIQ Pricing | Free and Premium Golf Plans';
const pricingDescription =
  'Compare GolfIQ Free and Premium plans for golf round tracking, GPS distances, strokes gained analysis, trends, and insights.';
const pricingUrl = 'https://www.golfiq.ca/pricing';

export const metadata: Metadata = {
  title: pricingTitle,
  description: pricingDescription,
  keywords: [
    'golf app pricing',
    'golf stats app',
    'golf GPS app',
    'strokes gained app',
    'golf analytics subscription',
    'GolfIQ pricing',
  ],
  alternates: {
    canonical: '/pricing',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: pricingTitle,
    description: pricingDescription,
    url: pricingUrl,
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
    title: pricingTitle,
    description: pricingDescription,
    images: ['/twitter/golfiq-twitter-graphic.png'],
  },
};

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GolfIQ',
  applicationCategory: 'SportsApplication',
  operatingSystem: 'Web, iOS',
  url: pricingUrl,
  description: pricingDescription,
  offers: [
    {
      '@type': 'Offer',
      name: 'GolfIQ Free',
      price: '0',
      priceCurrency: 'CAD',
      url: pricingUrl,
    },
    {
      '@type': 'Offer',
      name: 'GolfIQ Premium Monthly',
      price: PRICING.monthly.price.toFixed(2),
      priceCurrency: PRICING.monthly.currency,
      url: pricingUrl,
    },
    {
      '@type': 'Offer',
      name: 'GolfIQ Premium Annual',
      price: PRICING.annual.price.toFixed(2),
      priceCurrency: PRICING.annual.currency,
      url: pricingUrl,
    },
  ],
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      {children}
    </>
  );
}
