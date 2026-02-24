import type { Metadata } from "next";
import "./globals.css";
import "./app.css";
import { Providers, PostHogProvider } from "./providers";
import Layout from "@/components/Layout";
import { Inter, Space_Grotesk, IBM_Plex_Sans } from 'next/font/google';
import BootstrapClient from '@/components/BootstrapClient';
import PwaManager from '@/components/pwa/PwaManager';

export const metadata: Metadata = {
  metadataBase: new URL("https://www.golfiq.ca"),
  title: "GolfIQ | Track Rounds. Unlock Insights. Score Lower.",
  description:
    "Track golf rounds, analyze strokes gained, and improve faster with GolfIQ insights built from real performance data.",
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
    title: "GolfIQ | Track Rounds. Unlock Insights. Score Lower.",
    description:
      "Track golf rounds, analyze strokes gained, and improve faster with GolfIQ insights built from real performance data.",
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
    title: "GolfIQ | Track Rounds. Unlock Insights. Score Lower.",
    description:
      "Track golf rounds, analyze strokes gained, and improve faster with GolfIQ insights built from real performance data.",
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

const ibm_plex_sans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-ibm-plex-sans',
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
          '/register': true,
          '/forgot-password': true,
          '/reset-password': true,
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
            <PwaManager />
            <Layout>{children}</Layout>
          </Providers>
        </PostHogProvider>
      </body>
    </html>
  );
}
