import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.golfiq.ca';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/about', '/contact', '/pricing', '/privacy', '/terms'],
        disallow: [
          '/api/',
          '/admin/',
          '/dashboard',
          '/rounds',
          '/courses',
          '/friends',
          '/leaderboard',
          '/profile',
          '/settings',
          '/insights',
          '/subscription',
          '/users/',
          '/login',
          '/forgot-password',
          '/reset-password',
          '/verify-email',
          '/waitlist-confirm',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
