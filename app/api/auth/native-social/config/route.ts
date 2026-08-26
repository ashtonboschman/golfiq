import { NextResponse } from 'next/server';
import {
  getAuthProviderConfiguration,
  getPublicAuthProviderAvailability,
} from '@/lib/auth/providerConfiguration';

export const dynamic = 'force-dynamic';

export function GET() {
  const configuration = getAuthProviderConfiguration();

  return NextResponse.json(
    {
      googleClientId: configuration.native.google?.clientId ?? null,
      providers: getPublicAuthProviderAvailability(configuration),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
