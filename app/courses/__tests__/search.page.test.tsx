/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CourseSearchPage from '@/app/courses/search/page';
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
  usePathname: () => '/courses/search',
}));

jest.mock('@/app/providers', () => ({
  useMessage: () => ({
    showMessage: mockShowMessage,
    clearMessage: mockClearMessage,
  }),
}));

jest.mock('@/components/skeleton/PageSkeletons', () => ({
  CoursesSearchSkeleton: () => <div>Loading...</div>,
}));

jest.mock('@/lib/analytics/client', () => ({
  captureClientEvent: jest.fn(),
}));

const mockedUseSession = useSession as unknown as jest.Mock;

describe('/courses/search page fallback flow', () => {
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
    (global as any).fetch = jest.fn();
  });

  it('shows fallback form after a no-result external API search', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ courses: [] }),
    });

    render(<CourseSearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/enter course name or city/i), {
      target: { value: 'Hidden Valley' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText("Still can't find it?")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Course' })).toBeInTheDocument();
    expect(mockShowMessage).not.toHaveBeenCalledWith(
      'No courses found. Try a different search term.',
      'error',
    );
  });

  it('shows fallback form before any search attempt', () => {
    render(<CourseSearchPage />);
    expect(screen.getByText('Search Tips:')).toBeInTheDocument();
    expect(screen.getByText('Try the full course name')).toBeInTheDocument();
    expect(screen.getByText('You can also search by city')).toBeInTheDocument();
    expect(screen.getByText("Can't find it? Request it below")).toBeInTheDocument();
    expect(screen.queryByText('How It Works')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/All users share a limit of 200 course searches per day/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Still can't find it?")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Course' })).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', async () => {
    mockedUseSession.mockReturnValue({
      status: 'unauthenticated',
      data: null,
    });

    render(<CourseSearchPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('enforces search input maxLength at 250 characters', () => {
    render(<CourseSearchPage />);
    const searchInput = screen.getByPlaceholderText(/enter course name or city/i) as HTMLInputElement;
    expect(searchInput.maxLength).toBe(250);
  });

  it('triggers search when Enter is pressed via onKeyDown', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ courses: [] }),
    });

    render(<CourseSearchPage />);
    const searchInput = screen.getByPlaceholderText(/enter course name or city/i);

    fireEvent.change(searchInput, {
      target: { value: 'Enter Trigger Course' },
    });
    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/golf-course-api/search?query=Enter%20Trigger%20Course',
      );
    });
  });

  it('prefills request course name from the search query', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ courses: [] }),
    });

    render(<CourseSearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/enter course name or city/i), {
      target: { value: 'Cedar Ridge' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await screen.findByText("Still can't find it?");
    const courseNameInput = screen.getByPlaceholderText('Course name') as HTMLInputElement;
    expect(courseNameInput.value).toBe('Cedar Ridge');
  });

  it('submits course request form and shows success message', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ courses: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Course request sent. We'll let you know once it's added." }),
      });

    render(<CourseSearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/enter course name or city/i), {
      target: { value: 'Maple Hills' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await screen.findByText("Still can't find it?");

    fireEvent.change(screen.getByPlaceholderText('City'), {
      target: { value: 'Winnipeg' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request Course' }));

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('/api/courses/requests');
    });
    const [, requestOptions] = (global.fetch as jest.Mock).mock.calls[1];
    const requestBody = JSON.parse(requestOptions.body);
    expect(requestBody.courseName).toBe('Maple Hills');
    expect(requestBody.query).toBe('Maple Hills');
    expect(requestBody.source).toBe('global_api_no_result');

    expect(mockShowMessage).toHaveBeenCalledWith(
      "Course request sent. We'll let you know once it's added.",
      'success',
    );
  });

  it('uses manual request source before any search', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Course request sent. We'll let you know once it's added." }),
    });

    render(<CourseSearchPage />);

    fireEvent.change(screen.getByPlaceholderText('Course name'), {
      target: { value: 'Manual Only Course' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request Course' }));

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/courses/requests');
    });
    const [, requestOptions] = (global.fetch as jest.Mock).mock.calls[0];
    const requestBody = JSON.parse(requestOptions.body);
    expect(requestBody.source).toBe('manual');
  });

  it('uses manual request source after successful search with results', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          courses: [
            {
              id: 101,
              course_name: 'Results Course',
              club_name: 'Results Club',
              location: { city: 'Winnipeg', state: 'MB', country: 'Canada' },
              tees: {
                male: [{ tee_name: 'Blue' }],
                female: [],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Course request sent. We'll let you know once it's added." }),
      });

    render(<CourseSearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/enter course name or city/i), {
      target: { value: 'Results Course' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await screen.findByText('Results Course');

    fireEvent.change(screen.getByPlaceholderText('Course name'), {
      target: { value: 'Different Course Actually Needed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request Course' }));

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('/api/courses/requests');
    });
    const [, requestOptions] = (global.fetch as jest.Mock).mock.calls[1];
    const requestBody = JSON.parse(requestOptions.body);
    expect(requestBody.source).toBe('manual');
  });

  it('uses manual request source after external search error', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Course request sent. We'll let you know once it's added." }),
      });

    render(<CourseSearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/enter course name or city/i), {
      target: { value: 'Broken Search Query' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(mockShowMessage).toHaveBeenCalledWith('Server error', 'error');
    });

    fireEvent.change(screen.getByPlaceholderText('Course name'), {
      target: { value: 'Broken Search Course Request' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request Course' }));

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('/api/courses/requests');
    });
    const [, requestOptions] = (global.fetch as jest.Mock).mock.calls[1];
    const requestBody = JSON.parse(requestOptions.body);
    expect(requestBody.source).toBe('manual');
  });

  it('shows inline fallback error when request submission fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ courses: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Server failed' }),
      });

    render(<CourseSearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/enter course name or city/i), {
      target: { value: 'River Bend' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await screen.findByText("Still can't find it?");
    fireEvent.click(screen.getByRole('button', { name: 'Request Course' }));

    expect(await screen.findByText("We couldn't send the request. Please try again.")).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it('shows import results and keeps fallback visible when API search returns valid courses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        courses: [
          {
            id: 99,
            course_name: 'Pebble Beach Golf Links',
            club_name: 'Pebble Beach',
            location: {
              city: 'Monterey',
              state: 'CA',
              country: 'USA',
            },
            tees: {
              male: [{ tee_name: 'Blue' }],
              female: [],
            },
          },
        ],
      }),
    });

    render(<CourseSearchPage />);

    fireEvent.change(screen.getByPlaceholderText(/enter course name or city/i), {
      target: { value: 'Pebble' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Pebble Beach Golf Links')).toBeInTheDocument();
    expect(screen.getByText("Still can't find it?")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Course' })).toBeInTheDocument();
  });
});
