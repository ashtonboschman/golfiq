import { NextRequest, NextResponse } from 'next/server';

function redirectToPng(request: NextRequest): NextResponse {
  const faviconUrl = new URL('/logos/favicon/golfiq-icon-48.png', request.url);
  const response = NextResponse.redirect(faviconUrl, 308);
  response.headers.set('Cache-Control', 'public, max-age=86400');
  return response;
}

export function GET(request: NextRequest) {
  return redirectToPng(request);
}

export function HEAD(request: NextRequest) {
  return redirectToPng(request);
}

