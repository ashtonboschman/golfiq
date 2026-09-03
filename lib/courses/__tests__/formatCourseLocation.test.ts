import { formatCourseLocation } from '@/lib/courses/formatCourseLocation';

describe('formatCourseLocation', () => {
  it('joins complete locations with commas', () => {
    expect(formatCourseLocation({
      address: '123 Fairway',
      city: 'Winnipeg',
      state: 'MB',
      country: 'Canada',
    })).toBe('123 Fairway, Winnipeg, MB, Canada');
  });

  it('omits missing and legacy null-like values without dangling commas', () => {
    expect(formatCourseLocation({
      address: ' null ',
      city: null,
      state: 'MB',
      country: 'Canada',
    })).toBe('MB, Canada');
  });

  it('uses the fallback when no location fields are usable', () => {
    expect(formatCourseLocation({
      address: '',
      city: 'undefined',
      state: null,
      country: null,
    })).toBe('-');
  });
});
