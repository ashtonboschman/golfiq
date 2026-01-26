import type { Metadata } from "next";
import "./globals.css";
import "./app.css";
import { Providers, PostHogProvider } from "./providers";
import Layout from "@/components/Layout";
import { Inter, Space_Grotesk, IBM_Plex_Sans } from 'next/font/google';
import BootstrapClient from '@/components/BootstrapClient';

export const metadata: Metadata = {
  metadataBase: new URL("https://golfiq.ca"),
  title: "GolfIQ - Track Your Golf Game",
  description:
    "GolfIQ helps you track your golf rounds, analyze your performance, and improve your game with AI-powered insights.",

  icons: {
    apple: "/logos/favicon/golfiq-icon-180.png",
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
    ],
  },

  openGraph: {
    title: "GolfIQ - Track Your Golf Game",
    description:
      "Smart insights for golfers. Track rounds, analyze performance, and improve your game.",
    url: "https://golfiq.ca",
    siteName: "GolfIQ",
    images: [
      {
        url: "/logos/favicon/golfiq-icon-512.png",
        width: 512,
        height: 512,
        alt: "GolfIQ Logo",
      },
    ],
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "GolfIQ",
    description:
      "Smart insights for golfers. Track rounds and improve your game.",
    images: ["/logos/share/golfiq-share.png"],
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

  return (
    <html lang="en" className={`${inter.variable} ${space_grotesk.variable} theme-dark`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
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
