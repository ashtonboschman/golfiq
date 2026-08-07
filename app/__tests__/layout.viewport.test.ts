import type { ReactNode } from 'react';

jest.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter' }),
  Space_Grotesk: () => ({ variable: '--font-space-grotesk' }),
}));

jest.mock('@/app/app.css', () => ({}));
jest.mock('@/app/providers', () => ({
  Providers: ({ children }: { children: ReactNode }) => children,
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@/components/Layout', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@/components/BootstrapClient', () => () => null);
jest.mock('@/components/pwa/PwaManager', () => () => null);
jest.mock('@/components/rounds/LiveRoundAutoResumeGate', () => () => null);

import { viewport } from '@/app/layout';

describe('root viewport', () => {
  it('enables the edge-to-edge viewport used by the safe-area shell', () => {
    expect(viewport).toEqual({
      width: 'device-width',
      initialScale: 1,
      viewportFit: 'cover',
    });
  });
});
