/** @jest-environment jsdom */

import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminGpsMappingCourseList from '@/components/gps/AdminGpsMappingCourseList';
import type { GpsMappingCourseListItem } from '@/lib/gps/mappingCourseList';

let intersectionCallback: IntersectionObserverCallback | null = null;
const observe = jest.fn();
const disconnect = jest.fn();

function course(id: string, clubName: string): GpsMappingCourseListItem {
  return {
    id,
    clubName,
    courseName: `${clubName} Course`,
    location: { city: 'Winnipeg', state: 'MB', country: 'Canada' },
    holeCount: 18,
    mappedCourse: null,
    requestCount: 0,
  };
}

describe('AdminGpsMappingCourseList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    intersectionCallback = null;
    global.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      observe = observe;
      disconnect = disconnect;
      unobserve() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = '';
      thresholds = [];
    };
  });

  it('loads the next page when the final course enters the viewport', async () => {
    const secondCourse = course('2', 'Second Club');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'success',
        courses: [secondCourse],
        hasMore: false,
      }),
    });

    render(
      <AdminGpsMappingCourseList
        initialCourses={[course('1', 'First Club')]}
        initialHasMore
        gpsMappingSchemaAvailable
        query="winnipeg"
        status="NOT_STARTED"
        latitude={49.8951}
        longitude={-97.1384}
        startMappingAction={jest.fn()}
      />,
    );

    expect(observe).toHaveBeenCalledTimes(1);
    expect(intersectionCallback).not.toBeNull();

    await act(async () => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(await screen.findByText('Second Club')).toBeInTheDocument();
    const requestUrl = String((global.fetch as jest.Mock).mock.calls[0][0]);
    const request = new URL(requestUrl, 'http://localhost');
    expect(request.pathname).toBe('/api/admin/gps-mapping/courses');
    expect(request.searchParams.get('page')).toBe('2');
    expect(request.searchParams.get('q')).toBe('winnipeg');
    expect(request.searchParams.get('status')).toBe('NOT_STARTED');
    expect(request.searchParams.get('lat')).toBe('49.8951');
    expect(request.searchParams.get('lng')).toBe('-97.1384');
    await waitFor(() => expect(disconnect).toHaveBeenCalled());
  });

  it('does not observe the final course when there are no more pages', () => {
    global.fetch = jest.fn();

    render(
      <AdminGpsMappingCourseList
        initialCourses={[course('1', 'Only Club')]}
        initialHasMore={false}
        gpsMappingSchemaAvailable
        query=""
        status="ALL"
        latitude={null}
        longitude={null}
        startMappingAction={jest.fn()}
      />,
    );

    expect(observe).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
