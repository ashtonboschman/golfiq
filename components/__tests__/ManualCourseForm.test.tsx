/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ManualCourseForm from '@/components/ManualCourseForm';

function input(container: HTMLElement, name: string) {
  const element = container.querySelector(`[name="${name}"]`);
  if (!element) throw new Error(`Missing input named ${name}`);
  return element as HTMLInputElement | HTMLSelectElement;
}

describe('ManualCourseForm', () => {
  beforeEach(() => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('includes front and back 9 rating and slope when creating an 18-hole tee preview', () => {
    const handleCourseCreated = jest.fn();
    const { container } = render(
      <ManualCourseForm
        onCourseCreated={handleCourseCreated}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.change(input(container, 'course_name'), { target: { value: 'Prairie Course' } });
    fireEvent.change(input(container, 'club_name'), { target: { value: 'Prairie Golf Club' } });
    fireEvent.change(input(container, 'tee_name'), { target: { value: 'Blue' } });
    fireEvent.change(input(container, 'course_rating'), { target: { value: '72.5' } });
    fireEvent.change(input(container, 'slope_rating'), { target: { value: '135' } });
    fireEvent.change(input(container, 'front_course_rating'), { target: { value: '36.2' } });
    fireEvent.change(input(container, 'front_slope_rating'), { target: { value: '134' } });
    fireEvent.change(input(container, 'back_course_rating'), { target: { value: '36.3' } });
    fireEvent.change(input(container, 'back_slope_rating'), { target: { value: '136' } });

    fireEvent.click(screen.getByRole('button', { name: 'Initialize 18 Holes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add This Tee to Course' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Course Preview' }));

    expect(handleCourseCreated).toHaveBeenCalledWith(expect.objectContaining({
      course_name: 'Prairie Course',
      club_name: 'Prairie Golf Club',
      tees: {
        male: [
          expect.objectContaining({
            tee_name: 'Blue',
            course_rating: 72.5,
            slope_rating: 135,
            front_course_rating: 36.2,
            front_slope_rating: 134,
            back_course_rating: 36.3,
            back_slope_rating: 136,
            number_of_holes: 18,
          }),
        ],
        female: [],
      },
    }));
  });

  it('can estimate front and back 9 values from full tee rating and slope', () => {
    const handleCourseCreated = jest.fn();
    const { container } = render(
      <ManualCourseForm
        onCourseCreated={handleCourseCreated}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.change(input(container, 'course_name'), { target: { value: 'Prairie Course' } });
    fireEvent.change(input(container, 'club_name'), { target: { value: 'Prairie Golf Club' } });
    fireEvent.change(input(container, 'tee_name'), { target: { value: 'Blue' } });
    fireEvent.change(input(container, 'course_rating'), { target: { value: '72.5' } });
    fireEvent.change(input(container, 'slope_rating'), { target: { value: '135' } });

    fireEvent.click(screen.getByRole('button', { name: 'Initialize 18 Holes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Estimate From Full Rating' }));

    expect(input(container, 'front_course_rating')).toHaveValue(36.3);
    expect(input(container, 'front_slope_rating')).toHaveValue(135);
    expect(input(container, 'back_course_rating')).toHaveValue(36.2);
    expect(input(container, 'back_slope_rating')).toHaveValue(135);

    fireEvent.click(screen.getByRole('button', { name: 'Add This Tee to Course' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Course Preview' }));

    expect(handleCourseCreated).toHaveBeenCalledWith(expect.objectContaining({
      tees: {
        male: [
          expect.objectContaining({
            front_course_rating: 36.3,
            front_slope_rating: 135,
            back_course_rating: 36.2,
            back_slope_rating: 135,
          }),
        ],
        female: [],
      },
    }));
  });
});
