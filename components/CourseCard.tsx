import { MapPin } from 'lucide-react';
import Link from 'next/link';

interface Location {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

interface Tee {
  number_of_holes?: number | null;
}

interface Course {
  id: number;
  club_name: string;
  course_name: string;
  location?: Location | null;
  tees?: {
    male?: Tee[];
    female?: Tee[];
  };
  distance?: number;
}

interface CourseCardProps {
  course: Course;
  locations?: Location[];
  tees?: Tee[];
}

export default function CourseCard({ course, locations = [], tees = [] }: CourseCardProps) {
  const location = locations.length > 0 ? locations[0] : (course.location || {});
  const city = location.city || '-';
  const state = location.state || '-';
  const country = location.country || '-';
  const locationString = `${city}, ${state}, ${country}`;

  const holes =
    tees.length > 0 && tees[0].number_of_holes
      ? `${tees[0].number_of_holes} Holes`
      : '- Holes';

  return (
    <Link href={`/courses/${course.id}`} className="card-link">
      <div className="card course-card">
        <h3 className="course-name">{course.club_name == course.course_name ? course.course_name : course.club_name + ' - ' + course.course_name || '-'}</h3>
        <h5 className="course-location"><MapPin size='14'/> {locationString}</h5>
        <p className="course-holes-tag">{holes}</p>
        {course.distance !== undefined && (
          <p className="course-distance">{course.distance.toFixed(1)} km away</p>
        )}
      </div>
    </Link>
  );
}
