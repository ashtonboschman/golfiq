import {
  buildGolfCourseTeeSelections,
  getGolfCourseTeeCount,
  getGolfCourseTees,
  hasFullGolfCourseTeeData,
} from '@/lib/courses/golfCourseApi';

describe('GolfCourseAPI response compatibility', () => {
  it('reads tee counts from condensed search results without treating them as arrays', () => {
    const course = { tees: { male: 4, female: 3 } };

    expect(getGolfCourseTeeCount(course, 'male')).toBe(4);
    expect(getGolfCourseTeeCount(course, 'female')).toBe(3);
    expect(getGolfCourseTees(course, 'male')).toEqual([]);
    expect(buildGolfCourseTeeSelections(course)).toEqual({});
    expect(hasFullGolfCourseTeeData(course)).toBe(false);
  });

  it('reads and selects full tee arrays from course-detail results', () => {
    const course = {
      tees: {
        male: [{ tee_name: 'Blue' }, { tee_name: 'White' }],
        female: [{ tee_name: 'Red' }],
      },
    };

    expect(getGolfCourseTeeCount(course, 'male')).toBe(2);
    expect(getGolfCourseTees(course, 'female')).toEqual([{ tee_name: 'Red' }]);
    expect(buildGolfCourseTeeSelections(course)).toEqual({
      'male-0': true,
      'male-1': true,
      'female-0': true,
    });
    expect(hasFullGolfCourseTeeData(course)).toBe(true);
  });
});
