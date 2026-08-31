import type { Metadata, Viewport } from "next";
import { Suspense } from 'react';
import "./app.css";
import { Providers, PostHogProvider } from "./providers";
import Layout from "@/components/Layout";
import { Inter, Space_Grotesk } from 'next/font/google';
import BootstrapClient from '@/components/BootstrapClient';
import PwaManager from '@/components/pwa/PwaManager';
import LiveRoundAutoResumeGate from '@/components/rounds/LiveRoundAutoResumeGate';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.golfiq.ca"),
  applicationName: "GolfIQ",
  category: "sports",
  creator: "GolfIQ",
  publisher: "GolfIQ",
  title: "GolfIQ | Golf GPS, Round Tracking & Insights",
  description:
    "Track rounds quickly, use live GPS and My Bag club suggestions on supported courses, and understand your game with GolfIQ stats and insights.",
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },

  icons: {
    apple: "/logos/favicon/golfiq-icon-180.png",
    shortcut: "/logos/favicon/golfiq-icon-48.png",
    icon: [
      {
        url: "/logos/favicon/golfiq-icon-16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/logos/favicon/golfiq-icon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/logos/favicon/golfiq-icon-48.png",
        sizes: "48x48",
        type: "image/png",
      },
      {
        url: "/logos/favicon/golfiq-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  },

  openGraph: {
    title: "GolfIQ | Golf GPS, Round Tracking & Insights",
    description:
      "Track rounds quickly, use live GPS and My Bag club suggestions on supported courses, and understand your game with GolfIQ stats and insights.",
    url: "https://www.golfiq.ca",
    siteName: "GolfIQ",
    images: [
      {
        url: "/twitter/golfiq-twitter-graphic.png",
        width: 1200,
        height: 630,
        alt: "GolfIQ app preview",
      },
    ],
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "GolfIQ | Golf GPS, Round Tracking & Insights",
    description:
      "Track rounds quickly, use live GPS and My Bag club suggestions on supported courses, and understand your game with GolfIQ stats and insights.",
    images: ["/twitter/golfiq-twitter-graphic.png"],
  },
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter', // Define a CSS variable name
  display: 'swap',
});

const space_grotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeBootstrapScript = `
    (function() {
      try {
        var key = 'golfiq:theme';
        var authKey = 'golfiq:auth';
        var path = window.location.pathname;
        var publicDarkRoutes = {
          '/': true,
          '/login': true,
          '/onboarding': true,
          '/post-signup': true,
          '/register': true,
          '/forgot-password': true,
          '/reset-password': true,
          '/pricing': true,
          '/about': true,
          '/privacy': true,
          '/terms': true,
          '/contact': true
        };
        if (publicDarkRoutes[path]) return;
        if (localStorage.getItem(authKey) !== '1') return;
        var theme = localStorage.getItem(key);
        if (!theme) return;
        var root = document.documentElement;
        var classes = root.className
          .split(' ')
          .filter(function(c) { return c && c.indexOf('theme-') !== 0; });
        classes.push('theme-' + theme);
        root.className = classes.join(' ');
      } catch (e) {}
    })();
  `;

  return (
    <html lang="en" className={`${inter.variable} ${space_grotesk.variable} theme-dark`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        <PostHogProvider>
          <Providers>
            <BootstrapClient />
            <Suspense fallback={null}>
              <LiveRoundAutoResumeGate />
            </Suspense>
            <PwaManager />
            <Layout>{children}</Layout>
          </Providers>
        </PostHogProvider>
      </body>
    </html>
  );
}
