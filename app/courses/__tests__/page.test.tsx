/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CoursesPage from '@/app/courses/page';
import { useSession } from 'next-auth/react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockShowMessage = jest.fn();
const mockClearMessage = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    clearMessage: mockClearMessage,
  }),
}));

jest.mock('@/components/skeleton/PageSkeletons', () => ({
  CourseListSkeleton: () => <div data-testid="course-list-skeleton">Loading...</div>,
}));

jest.mock('@/components/CourseCard', () => ({
  __esModule: true,
  default: ({ course }: any) => <div data-testid="course-card">{course.course_name}</div>,
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('/courses page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: '1' } },
    });

    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: jest.fn((_success: any, error: any) => {
          error({ message: 'denied' });
        }),
      },
    });

    (global as any).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        courses: [
          {
            id: 7,
            club_name: 'Assiniboine Club',
            course_name: 'Assiniboine Park GC',
            location: { city: 'Winnipeg', state: 'MB', country: 'Canada' },
            tees: { male: [], female: [] },
          },
        ],
      }),
    });
  });

  it('renders persistent Add Course button above input and above the list', async () => {
    const { container } = render(<CoursesPage />);

    await screen.findByText('Assiniboine Park GC');

    const input = screen.getByPlaceholderText('Search Courses');
    const ctaButton = screen.getByRole('button', { name: 'Add Course' });
    const firstCourseCard = screen.getByTestId('course-card');
    expect(Boolean(ctaButton.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(ctaButton.compareDocumentPosition(firstCourseCard) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    expect(container.querySelectorAll('[data-testid="course-card"]').length).toBeGreaterThan(0);
  });

  it('routes to the global course search page from CTA', async () => {
    const user = userEvent.setup();
    render(<CoursesPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Course' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Add Course' }));
    expect(mockPush).toHaveBeenCalledWith('/courses/search');
  });
});
