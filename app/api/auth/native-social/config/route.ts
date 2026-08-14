import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
