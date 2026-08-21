/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CourseCard from '@/components/CourseCard';

const course = {
  id: 1,
  club_name: 'Test Golf Club',
  course_name: 'Test Course',
};

describe('CourseCard', () => {
  it('omits missing address fields from the location label', () => {
    render(
      <CourseCard
        course={course}
        locations={[{ address: null, city: 'Winnipeg', state: 'MB', country: 'Canada' }]}
      />,
    );

    expect(screen.getByText('Winnipeg, MB, Canada')).toBeInTheDocument();
    expect(screen.queryByText(/-,/)).not.toBeInTheDocument();
  });

  it('uses a single fallback when no location details are available', () => {
    render(<CourseCard course={course} />);

    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
