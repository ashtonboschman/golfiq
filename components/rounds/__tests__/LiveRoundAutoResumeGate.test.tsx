/** @jest-environment jsdom */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveRoundAutoResumeGate from '@/components/rounds/LiveRoundAutoResumeGate';
import { useSession } from 'next-auth/react';
import {
  getLiveRoundResumeTarget,
  hasAutoResumeAttemptedThisSession,
  markAutoResumeAttemptedThisSession,
} from '@/lib/rounds/liveRoundResume';

const mockReplace = jest.fn();
let mockPathname = '/dashboard';
let mockResumeParam: string | null = null;

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => ({
    get: (key: string) => (key === 'resume' ? mockResumeParam : null),
    toString: () => (mockResumeParam ? `resume=${mockResumeParam}` : ''),
  }),
}));

jest.mock('@/lib/rounds/liveRoundResume', () => ({
  getLiveRoundResumeTarget: jest.fn(),
  hasAutoResumeAttemptedThisSession: jest.fn(),
  markAutoResumeAttemptedThisSession: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;
const mockedGetTarget = getLiveRoundResumeTarget as unknown as jest.Mock;
const mockedHasAttempted = hasAutoResumeAttemptedThisSession as unknown as jest.Mock;
const mockedMarkAttempted = markAutoResumeAttemptedThisSession as unknown as jest.Mock;

describe('LiveRoundAutoResumeGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/dashboard';
    mockResumeParam = null;
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: { id: '42' },
      },
    });
    mockedHasAttempted.mockReturnValue(false);
    mockedGetTarget.mockReturnValue('/rounds/add?from=dashboard&resume=1');
  });

  it('redirects eligible authenticated sessions to live-round resume target once', async () => {
    render(<LiveRoundAutoResumeGate />);

    await waitFor(() => {
      expect(mockedMarkAttempted).toHaveBeenCalledWith('42');
      expect(mockReplace).toHaveBeenCalledWith('/rounds/add?from=dashboard&resume=1');
    });
  });

  it('does nothing when already on add-round route', async () => {
    mockPathname = '/rounds/add';
    render(<LiveRoundAutoResumeGate />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('does nothing when resume query already present', async () => {
    mockResumeParam = '1';
    render(<LiveRoundAutoResumeGate />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('does nothing when auto-resume already attempted in this session', async () => {
    mockedHasAttempted.mockReturnValue(true);
    render(<LiveRoundAutoResumeGate />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});

