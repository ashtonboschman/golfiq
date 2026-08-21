/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportCoursePage from '@/app/admin/import-course/page';
import { useSession } from 'next-auth/react';

const mockShowMessage = jest.fn();
const mockClearMessage = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/admin/import-course',
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    clearMessage: mockClearMessage,
  }),
}));

jest.mock('@/components/ManualCourseForm', () => () => <div>Manual Course Form</div>);
jest.mock('@/components/skeleton/PageSkeletons', () => ({
  AdminPanelSkeleton: () => <div>Loading...</div>,
}));
jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('/admin/import-course GolfCourseAPI compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: {
        user: {
          id: '1',
          subscription_tier: 'free',
          auth_provider: 'password',
        },
      },
    });
  });

  it('loads full tee arrays after selecting a condensed search result', async () => {
    (global as any).fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          courses: [{
            id: '93kzhy6b',
            course_name: 'MacGregor Golf Course',
            club_name: 'MacGregor',
            tees: { male: 4, female: 3 },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          course: {
            id: '93kzhy6b',
            course_name: 'MacGregor Golf Course',
            club_name: 'MacGregor',
            tees: {
              male: [{
                tee_name: 'Blue',
                total_yards: 6500,
                course_rating: 72,
                slope_rating: 130,
                number_of_holes: 18,
                holes: [{ par: 4, yardage: 400, handicap: 1 }],
              }],
              female: [],
            },
          },
        }),
      });

    render(<ImportCoursePage />);

    fireEvent.change(screen.getByPlaceholderText(/enter course name or city/i), {
      target: { value: 'MacGregor' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search API' }));

    const resultName = await screen.findByText('MacGregor Golf Course');
    expect(screen.getByText(/4 male tees, 3 female tees/i)).toBeInTheDocument();
    fireEvent.click(resultName.closest('.admin-course-search-card') as HTMLElement);

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe(
        '/api/golf-course-api/courses/93kzhy6b',
      );
    });
    expect(await screen.findByText('Blue')).toBeInTheDocument();
    expect(screen.getByText('Selected:').parentElement).toHaveTextContent(
      'Selected: 1 male tees, 0 female tees',
    );
  });
});
