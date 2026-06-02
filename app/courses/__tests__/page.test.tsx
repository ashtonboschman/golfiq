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
let mockGetCurrentPosition: jest.Mock;

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

    mockGetCurrentPosition = jest.fn((_success: any, error: any) => {
      error({ code: 1, message: 'denied' });
    });

    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: mockGetCurrentPosition,
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

  it('requests geolocation only once on initial render', async () => {
    render(<CoursesPage />);

    await screen.findByText('Assiniboine Park GC');
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('silently falls back when geolocation is denied and still renders course results', async () => {
    render(<CoursesPage />);

    expect(await screen.findByText('Assiniboine Park GC')).toBeInTheDocument();
    expect(
      screen.queryByText('Location access was denied. You can still search courses by name or city.')
    ).not.toBeInTheDocument();
  });

  it('handles missing geolocation without crashing and keeps the page usable', async () => {
    Object.defineProperty(window.navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });

    render(<CoursesPage />);

    expect(await screen.findByText('Assiniboine Park GC')).toBeInTheDocument();
    expect(
      screen.queryByText('Location is unavailable on this device. You can still search courses by name or city.')
    ).not.toBeInTheDocument();
  });

  it('keeps course search working when geolocation is denied', async () => {
    const user = userEvent.setup();
    render(<CoursesPage />);

    await screen.findByText('Assiniboine Park GC');
    (global as any).fetch.mockClear();

    await user.type(screen.getByPlaceholderText('Search Courses'), 'Assin');

    await waitFor(() => {
      const hasSearchCall = (global as any).fetch.mock.calls.some((call: any[]) =>
        String(call[0]).includes('search=Assin')
      );
      expect(hasSearchCall).toBe(true);
    });
  });
});
