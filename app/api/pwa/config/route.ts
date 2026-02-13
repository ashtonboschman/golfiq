import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, private, max-age=0',
  Pragma: 'no-cache',
} as const;

function resolveDefaultEnabled(): boolean {
  const explicit = process.env.PWA_SW_ENABLED_DEFAULT;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function resolveVersion(): string {
  return (
    process.env.NEXT_PUBLIC_SW_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.npm_package_version ||
    'dev'
  );
}

export async function GET() {
  let enabled = resolveDefaultEnabled();
  let source: 'default' | 'db' | 'db_error' = 'default';

  try {
    const flag = await prisma.featureFlag.findUnique({
      where: { flagName: 'pwa_sw_enabled' },
      select: { enabled: true },
    });

    if (flag) {
      enabled = flag.enabled;
      source = 'db';
    }
  } catch (error) {
    source = 'db_error';
    console.warn('[PWA] Failed to read pwa_sw_enabled feature flag:', error);
  }

  return NextResponse.json(
    {
      enabled,
      version: resolveVersion(),
      source,
    },
    { headers: NO_STORE_HEADERS },
  );
}
