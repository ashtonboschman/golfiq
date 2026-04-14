/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminFeedbackPage from '@/app/admin/feedback/page';
import { useSession } from 'next-auth/react';

const mockPush = jest.fn();
const mockShowMessage = jest.fn();
const mockClearMessage = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    clearMessage: mockClearMessage,
  }),
}));

jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, inputId }: any) => (
    <select
      id={inputId}
      data-testid={inputId ?? 'react-select'}
      value={value?.value ?? ''}
      onChange={(e) => {
        const next = options.find((opt: any) => opt.value === e.target.value);
        onChange?.(next);
      }}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/components/skeleton/PageSkeletons', () => ({
  AdminPanelSkeleton: () => <div data-testid="admin-panel-skeleton">Loading...</div>,
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('/admin/feedback page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  it('redirects non-admin users to home', async () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '2' } },
    });

    render(<AdminFeedbackPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('renders feedback table for admin', async () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1' } },
    });

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        feedback: [
          {
            id: '10',
            userId: '5',
            email: 'user@example.com',
            firstName: 'Test',
            lastName: 'User',
            type: 'bug',
            message: 'Settings export failed.',
            page: '/settings',
            appVersion: '1.0.0',
            status: 'open',
            createdAt: '2026-04-10T10:00:00.000Z',
            updatedAt: '2026-04-10T10:00:00.000Z',
          },
        ],
      }),
    });

    render(<AdminFeedbackPage />);

    expect(await screen.findByText('Feedback Submissions')).toBeInTheDocument();
    expect(await screen.findByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByText('Settings export failed.')).toBeInTheDocument();
  });

  it('saves status changes for a feedback row', async () => {
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1' } },
    });

    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: [
            {
              id: '10',
              userId: '5',
              email: 'user@example.com',
              firstName: 'Test',
              lastName: 'User',
              type: 'bug',
              message: 'Settings export failed.',
              page: '/settings',
              appVersion: '1.0.0',
              status: 'open',
              createdAt: '2026-04-10T10:00:00.000Z',
              updatedAt: '2026-04-10T10:00:00.000Z',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feedback: {
            id: '10',
            status: 'resolved',
            updatedAt: '2026-04-10T12:00:00.000Z',
          },
        }),
      });

    render(<AdminFeedbackPage />);

    const emailCell = await screen.findByText('user@example.com');
    const row = emailCell.closest('tr');
    expect(row).not.toBeNull();
    if (!row) return;

    const statusSelect = within(row).getByDisplayValue('Open');
    fireEvent.change(statusSelect, { target: { value: 'resolved' } });

    fireEvent.click(within(row).getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith(
        '/api/admin/feedback',
        expect.objectContaining({
          method: 'PATCH',
        }),
      );
    });
    expect(mockShowMessage).toHaveBeenCalledWith('Feedback status updated.', 'success');
  });
});
