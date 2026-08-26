const DEVELOPMENT_APP_URL = 'http://localhost:3000';

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function getServerAppUrl(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredUrl =
    process.env.APP_URL?.trim() ||
    (!isProduction ? process.env.NEXT_PUBLIC_APP_URL?.trim() : '') ||
    (!isProduction ? DEVELOPMENT_APP_URL : '');

  if (!configuredUrl) {
    throw new Error('APP_URL must be configured in production.');
  }

  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error('APP_URL must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('APP_URL must use http or https.');
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('APP_URL must contain only the application origin.');
  }

  if (isProduction && (parsed.protocol !== 'https:' || isLoopbackHostname(parsed.hostname))) {
    throw new Error('APP_URL must be a public https origin in production.');
  }

  return parsed.origin;
}
