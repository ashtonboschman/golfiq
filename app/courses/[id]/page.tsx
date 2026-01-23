'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';
import { Landmark, MapPin, Plus } from 'lucide-react';

interface Hole {
  id: number;
  hole_number: number;
  par: number;
  yardage: number;
  handicap?: number | null;
}

interface Tee {
  id: number;
  tee_name: string;
  gender: string;
  course_rating: number;
  slope_rating: number;
  total_yards: number;
  number_of_holes: number;
  holes?: Hole[];
  par_total: number;
}

interface Course {
  id: number;
  course_name: string;
  club_name?: string;
  location: {
    address: string;
    city: string;
    state: string;
    country: string;
  };
  tees: {
    male?: Tee[];
    female?: Tee[];
  };
}

export default function CourseDetailsPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { data: session, status } = useSession();
  const { showMessage, clearMessage } = useMessage();

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeeId, setSelectedTeeId] = useState('');
  const [teesGrouped, setTeesGrouped] = useState<Record<string, Tee[]>>({});

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const fetchCourse = async () => {
      setLoading(true);
      clearMessage();
      try {
        const res = await fetch(`/api/courses/${id}`);

        if ([401, 403].includes(res.status)) {
          router.replace('/login');
          return;
        }

        if (res.status === 404) {
          setCourse(null);
          showMessage('Course not found', 'error');
          return;
        }

        const data = await res.json();

        if (data.type === 'error') {
          setCourse(null);
          showMessage(data.message || 'Error fetching course', 'error');
          return;
        }

        const courseObj = data.course;
        setCourse(courseObj);

        const tees = [...(courseObj.tees.male || []), ...(courseObj.tees.female || [])];

        const grouped = tees.reduce((acc: Record<string, Tee[]>, tee: Tee) => {
          const g = tee.gender.charAt(0).toUpperCase() + tee.gender.slice(1);
          (acc[g] ||= []).push(tee);
          return acc;
        }, {});
        setTeesGrouped(grouped);

        if (courseObj.tees.male?.length > 0) {
          const longest = courseObj.tees.male.reduce((a: Tee, b: Tee) =>
            b.total_yards > a.total_yards ? b : a
          );
          setSelectedTeeId(String(longest.id));
        } else if (tees.length > 0) {
          setSelectedTeeId(String(tees[0].id));
        } else {
          setSelectedTeeId('');
        }
      } catch (err: any) {
        setCourse(null);
        showMessage(err.message || 'Error fetching course', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [id, status, router, showMessage, clearMessage]);

  const allTees = useMemo(
    () => [...(course?.tees.male || []), ...(course?.tees.female || [])],
    [course]
  );
  const selectedTee = useMemo(
    () => allTees.find((t) => String(t.id) === String(selectedTeeId)),
    [allTees, selectedTeeId]
  );

  const selectOptions = useMemo(() => {
    if (!teesGrouped || Object.keys(teesGrouped).length === 0) return [];
    return Object.entries(teesGrouped).map(([gender, tees]) => ({
      label: gender,
      options: tees.map((t) => ({
        value: String(t.id),
        label: `${t.tee_name} ${t.total_yards} yds (${t.course_rating}/${t.slope_rating}) ${t.number_of_holes} holes`,
      })),
    }));
  }, [teesGrouped]);

  const computeTotals = (list: Hole[]) =>
    list.reduce(
      (acc, h) => {
        acc.par += Number(h.par || 0);
        acc.yards += Number(h.yardage || 0);
        return acc;
      },
      { par: 0, yards: 0 }
    );

  if (loading) return <p className="loading-text">Loading course details...</p>;
  if (!course) return null;

  const holes = selectedTee?.holes || [];
  const hasHandicap = holes.some((h) => h.handicap != null);

  const front9Totals = computeTotals(holes.slice(0, 9));
  const back9Totals = computeTotals(holes.slice(9, 18));
  const fullTotals = computeTotals(holes);

  return (
    <div className="page-stack">
      <button
        className="btn btn-add"
        onClick={() =>
          router.push(
            `/rounds/add?courseId=${course.id}&courseName=${encodeURIComponent(
              course.course_name
            )}&teeId=${selectedTee?.id}&teeName=${encodeURIComponent(
              selectedTee?.tee_name || ''
            )}&from=${encodeURIComponent(`/courses/${course.id}`)}`
          )
        }
        disabled={!allTees.length}
      >
        <Plus/> Add Round
      </button>

      <div className="card course-card">
        <div className="course-name-container">
          <h2 className="course-name">{course.course_name}</h2>
          <p className="round-holes-tag">
            {selectedTee?.number_of_holes} Holes
          </p>
        </div>
        <p className="course-club">
          <strong><Landmark size='14'/></strong> {course.club_name}
        </p>
        <p className="course-location">
          <strong><MapPin size='14'/></strong> {course.location.address}, {course.location.city}, {course.location.state},{' '}
          {course.location.country}
        </p>
      </div>

      <div className="card tee-select-card">
        <label htmlFor="tee-select">
          <strong >Select Tee</strong>
        </label>

        {allTees.length > 0 ? (
          <Select
            value={
              selectedTee
                ? {
                    value: String(selectedTee.id),
                    label: `${selectedTee.tee_name} ${selectedTee.total_yards} yds (${selectedTee.course_rating}/${selectedTee.slope_rating}) ${selectedTee.number_of_holes} holes`,
                  }
                : null
            }
            options={selectOptions}
            onChange={(option) => setSelectedTeeId(option?.value ?? '')}
            isClearable
            isSearchable={false}
            menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
            styles={{
              ...selectStyles,
              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
            }}
          />
        ) : (
          <p>No tees available for this course.</p>
        )}
      </div>

      {selectedTee && (
        <div className="card course-scorecard-meta">
          <div>
            <strong className='form-label'>Par</strong> {selectedTee.par_total}
          </div>
          <div>
            <strong className='form-label'>Yards</strong> {selectedTee.total_yards}
          </div>
          <div>
            <strong className='form-label'>Rating / Slope</strong> {selectedTee.course_rating} / {selectedTee.slope_rating}
          </div>
        </div>
      )}

      {selectedTee && holes.length > 0 && (
        <div className="card course-scorecard-wrapper">
          <table className="course-scorecard-left">
            <thead>
              <tr>
                <th>Hole</th>
              </tr>
              <tr>
                <th>Par</th>
              </tr>
              <tr>
                <th>Yards</th>
              </tr>
              {hasHandicap && (
                <tr>
                  <th>Hcp</th>
                </tr>
              )}
            </thead>
          </table>

          <div className="course-scorecard-scroll">
            <table className="course-scorecard-right">
              <thead>
                <tr>
                  {holes.map((h) => (
                    <th key={h.id}>{h.hole_number}</th>
                  ))}
                  <th>OUT</th>
                  {selectedTee.number_of_holes === 18 && <th>IN</th>}
                  <th>TOTAL</th>
                </tr>
                <tr>
                  {holes.map((h) => (
                    <th key={h.id}>{h.par}</th>
                  ))}
                  <th>{front9Totals.par}</th>
                  {selectedTee.number_of_holes === 18 && <th>{back9Totals.par}</th>}
                  <th>{fullTotals.par}</th>
                </tr>
                <tr>
                  {holes.map((h) => (
                    <th key={h.id}>{h.yardage}</th>
                  ))}
                  <th>{front9Totals.yards}</th>
                  {selectedTee.number_of_holes === 18 && <th>{back9Totals.yards}</th>}
                  <th>{fullTotals.yards}</th>
                </tr>
                {hasHandicap && (
                  <tr>
                    {holes.map((h) => (
                      <th key={h.id}>{h.handicap ?? '-'}</th>
                    ))}
                    <th>-</th>
                    {selectedTee.number_of_holes === 18 && <th>-</th>}
                    <th>-</th>
                  </tr>
                )}
              </thead>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
