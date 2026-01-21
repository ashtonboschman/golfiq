import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./app.css";
import { Providers, PostHogProvider } from "./providers";
import Layout from "@/components/Layout";
import { Inter, Space_Grotesk, IBM_Plex_Sans } from 'next/font/google';
import BootstrapClient from '@/components/BootstrapClient';

export const metadata: Metadata = {
  title: "GolfIQ - Track Your Golf Game",
  description: "GolfIQ helps you track your golf rounds, analyze your performance, and improve your game with AI-powered insights.",
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
  const adSenseId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;

  return (
    <html lang="en" className={`${inter.variable} ${space_grotesk.variable} theme-dark`}>
      <head>
        <meta name="google-adsense-account" content="ca-pub-6375440969561474" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/logos/favicon/golfiq-icon-192.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/logos/favicon/golfiq-icon-512.png" />
        {adSenseId && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adSenseId}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body>
        <PostHogProvider>
          <Providers>
            <BootstrapClient />
            <Layout>{children}</Layout>
          </Providers>
        </PostHogProvider>
      </body>
    </html>
  );
}
