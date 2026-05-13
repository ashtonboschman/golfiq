/** @jest-environment jsdom */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AddRoundPage from '@/app/rounds/add/page';
import EditRoundPage from '@/app/rounds/edit/[id]/page';
import { useSession } from 'next-auth/react';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockShowMessage = jest.fn();
const mockShowConfirm = jest.fn();
const mockClearMessage = jest.fn();

let mockPathname = '/rounds/add';
let mockParams: Record<string, string> = {};
let mockQuery = new URLSearchParams();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  usePathname: () => mockPathname,
  useParams: () => mockParams,
  useSearchParams: () => ({
    get: (key: string) => mockQuery.get(key),
    has: (key: string) => mockQuery.has(key),
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    showConfirm: mockShowConfirm,
    clearMessage: mockClearMessage,
  }),
}));

jest.mock('react-select-async-paginate', () => ({
  AsyncPaginate: Object.assign(
    () => <div data-testid="async-paginate" />,
    { displayName: 'MockAsyncPaginate' },
  ),
}));

jest.mock('react-select', () =>
  Object.assign(
    () => <div data-testid="react-select" />,
    { displayName: 'MockReactSelect' },
  ),
);

jest.mock('@/components/HoleCard', () =>
  Object.assign(
    () => <div data-testid="hole-card" />,
    { displayName: 'MockHoleCard' },
  ),
);

const mockedUseSession = useSession as unknown as jest.Mock;

describe('round entry session guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockPathname = '/rounds/add';
    mockParams = {};
    mockQuery = new URLSearchParams();
  });

  it('redirects add-round to login when unauthenticated without any draft', async () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<AddRoundPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('keeps add-round on screen when unauthenticated and a draft exists', async () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: { user: { id: '42' } },
    });

    localStorage.setItem('golfiq:round:add:draft:v1:42', JSON.stringify({ savedAt: 'now' }));

    render(<AddRoundPage />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalledWith('/login');
    });
    expect(mockShowMessage).toHaveBeenCalledWith(
      expect.stringContaining('Connection/session issue detected'),
      'error',
    );
  });

  it('redirects edit-round to login when unauthenticated without any draft', async () => {
    mockPathname = '/rounds/edit/123';
    mockParams = { id: '123' };
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<EditRoundPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('keeps edit-round on screen when unauthenticated and a draft exists', async () => {
    mockPathname = '/rounds/edit/123';
    mockParams = { id: '123' };
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: { user: { id: '42' } },
    });

    localStorage.setItem('golfiq:round:edit:draft:v1:42:123', JSON.stringify({ savedAt: 'now' }));

    render(<EditRoundPage />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalledWith('/login');
    });
    expect(mockShowMessage).toHaveBeenCalledWith(
      expect.stringContaining('Connection/session issue detected'),
      'error',
    );
  });
});
