'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import { AsyncPaginate } from 'react-select-async-paginate';
import { selectStyles } from '@/lib/selectStyles';
import HoleCard from '@/components/HoleCard';

interface Round {
  date: string;
  course_id: string;
  tee_id: string;
  hole_by_hole: number;
  score: number | null;
  notes: string;
  fir_hit: number | null;
  gir_hit: number | null;
  putts: number | null;
  penalties: number | null;
  round_holes: any[];
  advanced_stats: number;
  par_total?: number | null;
}

interface HoleScore {
  hole_id: number;
  hole_number: number;
  par: number | null;
  score: number | null;
  fir_hit: number | null;
  gir_hit: number | null;
  putts: number | null;
  penalties: number | null;
}

interface CourseOption {
  label: string;
  value: number;
}

interface TeeOption {
  label: string;
  value: number;
  teeObj?: any;
}

export default function EditRoundPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { data: session, status } = useSession();
  const { showMessage, clearMessage } = useMessage();

  const [round, setRound] = useState<Round>({
    date: new Date().toISOString().split('T')[0],
    course_id: '',
    tee_id: '',
    hole_by_hole: 0,
    score: null,
    notes: '',
    fir_hit: null,
    gir_hit: null,
    putts: null,
    penalties: null,
    round_holes: [],
    advanced_stats: 0,
  });

  const [tees, setTees] = useState<any[]>([]);
  const [holes, setHoles] = useState<any[]>([]);
  const [holeScores, setHoleScores] = useState<HoleScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(null);
  const [selectedTee, setSelectedTee] = useState<TeeOption | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const isHBH = round.hole_by_hole === 1;
  const hasAdvanced = round.advanced_stats === 1;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Get user's geolocation for course sorting
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.log('Geolocation not available:', error);
        }
      );
    }
  }, []);

  const sanitizeNumeric = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '';
    return String(val).replace(/\D/g, '');
  };

  const getTotalScore = (holes: HoleScore[]) =>
    holes.reduce((sum, h) => sum + (h.score ?? 0), 0);

  const buildPayload = () => {
    const payload: any = {
      ...round,
      course_id: Number(round.course_id),
      tee_id: Number(round.tee_id),
    };
    if (isHBH) {
      payload.round_holes = holeScores.map((h) => ({
        hole_id: h.hole_id,
        score: h.score,
        fir_hit: hasAdvanced ? h.fir_hit : null,
        gir_hit: hasAdvanced ? h.gir_hit : null,
        putts: hasAdvanced ? h.putts : null,
        penalties: hasAdvanced ? h.penalties : null,
      }));
      payload.score = getTotalScore(holeScores);

      if (hasAdvanced) {
        ['fir_hit', 'gir_hit', 'putts', 'penalties'].forEach(
          (f) =>
            (payload[f] = holeScores.reduce(
              (s, h) => s + ((h[f as keyof HoleScore] as number) ?? 0),
              0
            ))
        );
      }
    } else if (hasAdvanced) {
      ['fir_hit', 'gir_hit', 'putts', 'penalties'].forEach(
        (f) => (payload[f] = round[f as keyof Round])
      );
    }
    return payload;
  };

  const loadCourseOptions = async (
    search: string,
    loadedOptions: any,
    additional?: { page: number }
  ) => {
    const { page } = additional || { page: 1 };
    try {
      const locationParam = userLocation ? `&lat=${userLocation.lat}&lng=${userLocation.lng}` : '';
      const res = await fetch(
        `/api/courses?search=${encodeURIComponent(search)}&limit=20&page=${page}${locationParam}`
      );
      const data = await res.json();
      const coursesArray = data.courses || [];

      return {
        options: coursesArray.map((course: any) => ({
          label: course.club_name == course.course_name ? course.course_name : course.club_name + ' - ' + course.course_name,
          value: course.id,
        })),
        hasMore: coursesArray.length === 20,
        additional: { page: page + 1 },
      };
    } catch (err) {
      console.error(err);
      return { options: [], hasMore: false, additional: { page: 1 } };
    }
  };

  const loadTeeOptions = async (
    search: string,
    loadedOptions: any,
    additional: { page: number } | undefined,
    courseId?: number
  ) => {
    if (!courseId) return { options: [], hasMore: false, additional: { page: 1 } };

    const { page } = additional || { page: 1 };
    try {
      const res = await fetch(
        `/api/tees?course_id=${courseId}&search=${encodeURIComponent(search)}&limit=20&page=${page}`
      );
      const data = await res.json();
      const teesArray = data.tees || [];

      const grouped = Object.entries(
        teesArray.reduce((acc: any, tee: any) => {
          const genderKey =
            tee.gender.charAt(0).toUpperCase() + tee.gender.slice(1).toLowerCase();
          if (!acc[genderKey]) acc[genderKey] = [];
          acc[genderKey].push({
            label: `${tee.tee_name} ${tee.total_yards ?? 0} yds (${tee.course_rating ?? 0}/${tee.slope_rating ?? 0}) ${tee.number_of_holes ?? 0} holes`,
            value: tee.id,
          });
          return acc;
        }, {})
      ).map(([label, options]) => ({ label, options: options as TeeOption[] }));

      return { options: grouped, hasMore: false, additional: { page: page + 1 } };
    } catch (err) {
      console.error(err);
      return { options: [], hasMore: false, additional: { page: page + 1 } };
    }
  };

  const fetchCourse = async (courseId: number) => {
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      const data = await res.json();
      return data.course || null;
    } catch (err) {
      console.error(err);
      showMessage('Error fetching course.', 'error');
      return null;
    }
  };

  const fetchTees = async (courseId: number) => {
    if (!courseId) return [];
    try {
      const res = await fetch(`/api/tees?course_id=${courseId}`);
      const data = await res.json();
      const teesArray = data.tees || [];
      setTees(teesArray);
      return teesArray;
    } catch (err) {
      console.error(err);
      showMessage('Error fetching tees.', 'error');
      return [];
    }
  };

  const fetchHoles = async (teeId: number, existingRoundHoles: any[] = []) => {
    if (!teeId) return [];
    try {
      const res = await fetch(`/api/tees/${teeId}/holes`);
      const data = await res.json();

      const holesArray = data.holes || [];
      setHoles(holesArray);

      const initScores = holesArray.map((hole: any) => {
        const existing = existingRoundHoles.find((h: any) => h.hole_id === hole.id);
        return {
          hole_id: hole.id,
          hole_number: hole.hole_number,
          par: hole.par,
          score: existing?.score ?? null,
          fir_hit: existing?.fir_hit ?? null,
          gir_hit: existing?.gir_hit ?? null,
          putts: existing?.putts ?? null,
          penalties: existing?.penalties ?? null,
        };
      });
      setHoleScores(initScores);
      return holesArray;
    } catch (err) {
      console.error(err);
      showMessage('Error fetching holes.', 'error');
      return [];
    }
  };

  // Fetch existing round for edit mode
  useEffect(() => {
    if (status !== 'authenticated' || !id) return;

    const fetchRound = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/rounds/${id}`);
        const result = await res.json();
        const data = result.round;

        const roundData = {
          date: data.date?.split('T')[0] ?? new Date().toISOString().split('T')[0],
          course_id: data.course_id?.toString() ?? '',
          tee_id: data.tee_id?.toString() ?? '',
          hole_by_hole: data.hole_by_hole === 1 ? 1 : 0,
          score: data.score ?? null,
          notes: data.notes ?? '',
          fir_hit: data.fir_hit ?? null,
          gir_hit: data.gir_hit ?? null,
          putts: data.putts ?? null,
          penalties: data.penalties ?? null,
          round_holes: data.round_holes || [],
          advanced_stats: data.advanced_stats === 1 ? 1 : 0,
          par_total: data.tee?.par_total ?? null,
        };

        setRound(roundData);

        // Fetch and set selected course
        if (roundData.course_id) {
          const foundCourse = await fetchCourse(Number(roundData.course_id));
          if (foundCourse) {
            setSelectedCourse({
              label: foundCourse.club_name == foundCourse.course_name
                ? foundCourse.course_name
                : foundCourse.club_name + ' - ' + foundCourse.course_name,
              value: foundCourse.id
            });
          }

          // Fetch tees and holes
          const fetchedTees = await fetchTees(Number(roundData.course_id));

          if (fetchedTees.length && roundData.tee_id) {
            const foundTee = fetchedTees.find((t: any) => t.id === Number(roundData.tee_id));
            if (foundTee) {
              setSelectedTee({
                label: `${foundTee.tee_name} ${foundTee.total_yards ?? 0} yds (${foundTee.course_rating ?? 0}/${foundTee.slope_rating ?? 0}) ${foundTee.number_of_holes ?? 0} holes`,
                value: foundTee.id,
                teeObj: foundTee,
              });

              if (roundData.tee_id) {
                await fetchHoles(Number(roundData.tee_id), roundData.round_holes || []);
              }
            }
          }
        }

        setInitialized(true);
      } catch (err) {
        console.error(err);
        showMessage('Error fetching round.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchRound();
  }, [id, status]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (['score', 'fir_hit', 'gir_hit', 'putts', 'penalties'].includes(name)) {
      const numericValue = sanitizeNumeric(value);

      const maxMap: Record<string, number> = {
        fir_hit: 14,
        gir_hit: 18,
        score: 150,
        putts: 99,
        penalties: 30,
      };

      let clampedValue =
        numericValue === ''
          ? ''
          : Math.min(Number(numericValue), maxMap[name]);

      setRound((prev) => ({
        ...prev,
        [name]: clampedValue === '' ? null : Number(clampedValue),
      }));
    } else {
      setRound((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleHoleScoreChange = (index: number, field: string, value: any) => {
    setHoleScores((prev) => {
      const updated = [...prev];
      const hole = updated[index];

      updated[index] = {
        ...hole,
        [field]:
          (field === 'fir_hit' || field === 'gir_hit') && isHBH
            ? value
            : sanitizeNumeric(value) === ''
            ? null
            : Number(sanitizeNumeric(value)),
      };

      return updated;
    });
  };

  const toggleHoleByHole = () => {
    setRound((prev) => {
      const newHBH = prev.hole_by_hole === 1 ? 0 : 1;
      if (newHBH === 1) {
        const fresh = holes.map((h: any) => {
          const existing = holeScores.find((hs) => hs.hole_id === h.id);
          return {
            hole_id: h.id,
            hole_number: h.hole_number,
            par: h.par,
            score: existing?.score ?? null,
            fir_hit: existing?.fir_hit ?? null,
            gir_hit: existing?.gir_hit ?? null,
            putts: existing?.putts ?? null,
            penalties: existing?.penalties ?? null,
          };
        });
        setHoleScores(fresh);
        return { ...prev, hole_by_hole: 1, score: null };
      }
      const sumScore = getTotalScore(holeScores);
      return { ...prev, hole_by_hole: 0, score: sumScore };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessage();

    if (!round.date || !round.course_id || !round.tee_id) {
      showMessage('Date, Course, and Tee are required.', 'error');
      return;
    }

    if (!isHBH && (round.score === null || round.score === undefined)) {
      showMessage('Score is required in Quick Score mode.', 'error');
      return;
    }

    if (isHBH) {
      const incomplete = holeScores.find((h) => h.score === null);
      if (incomplete) {
        showMessage(`Please enter a score for hole ${incomplete.hole_number}.`, 'error');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/rounds/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload()),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error saving round');

      // Route to stats page
      router.push(`/rounds/${id}/stats`);
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error saving round', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (val: number | null | undefined) =>
    val === null || val === undefined ? '' : val;

  const calculateTotals = () => {
    const totals = { score: 0, par: 0, fir_hit: 0, gir_hit: 0, putts: 0, penalties: 0 };
    let hasScore = false;
    holeScores.forEach((h) => {
      if (h.score !== null) {
        totals.score += h.score;
        hasScore = true;
      }
      if (h.par !== null) totals.par += h.par;
      if (hasAdvanced) {
        ['fir_hit', 'gir_hit', 'putts', 'penalties'].forEach((f) => {
          if (h[f as keyof HoleScore] !== null)
            totals[f as keyof typeof totals] += h[f as keyof HoleScore] as number;
        });
      }
    });
    return {
      score: hasScore ? totals.score : null,
      par: totals.par || null,
      fir_hit: totals.fir_hit || null,
      gir_hit: totals.gir_hit || null,
      putts: totals.putts || null,
      penalties: totals.penalties || null,
    };
  };

  const renderHoleCards = () => {
    if (!isHBH || !initialized) return null;

    const totals = calculateTotals();
    const show = (v: number | null) => (v === null ? '–' : v);

    return (
      <div>
        {holeScores.map((h, idx) => (
          <HoleCard
            key={h.hole_id}
            hole={h.hole_number}
            par={h.par}
            score={h.score}
            fir_hit={h.fir_hit}
            gir_hit={h.gir_hit}
            putts={h.putts}
            penalties={h.penalties}
            hasAdvanced={hasAdvanced}
            onChange={(holeNumber, field, value) => handleHoleScoreChange(idx, field, value)}
          />
        ))}

        {holeScores.length > 0 && (
          <div className="card hole-card-total">
            <div className="hole-header">Totals</div>
            <div className="hole-card-grid">
              <div className="hole-field">
                <strong>Par:</strong> {show(totals.par)}
              </div>
              <div className="hole-field">
                <strong>Score:</strong> {show(totals.score)}
              </div>
              {hasAdvanced && (
                <>
                  <div className="hole-field">
                    <strong>FIR:</strong> {show(totals.fir_hit)}
                  </div>
                  <div className="hole-field">
                    <strong>Putts:</strong> {show(totals.putts)}
                  </div>
                  <div className="hole-field">
                    <strong>GIR:</strong> {show(totals.gir_hit)}
                  </div>
                  <div className="hole-field">
                    <strong>Penalties:</strong> {show(totals.penalties)}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (status === 'loading' || loading || !initialized) return <p className="loading-text">Loading...</p>;

  return (
    <div className="page-stack">
      <div className='card'>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-row">
            <label className="form-label">Date</label>
            <input
              type="date"
              name="date"
              value={round.date}
              onChange={handleChange}
              className="form-input"
              required
            />
          </div>

          <div className="form-row">
            <label className="form-label">Course</label>
            <AsyncPaginate
              value={selectedCourse}
              loadOptions={loadCourseOptions}
              onChange={(option) => {
                setSelectedCourse(option);
                setSelectedTee(null);
                setRound((prev) => ({
                  ...prev,
                  course_id: option?.value.toString() ?? '',
                  tee_id: '',
                }));
                setHoles([]);
                setHoleScores([]);
              }}
              additional={{ page: 1 }}
              placeholder="Select Course"
              isClearable
              styles={selectStyles}
            />
          </div>

          <div className="form-row">
            <label className="form-label">Tee</label>
            <AsyncPaginate
              key={selectedCourse?.value || 'no-course'}
              value={selectedTee}
              loadOptions={(search, loadedOptions, additional) =>
                loadTeeOptions(
                  search,
                  loadedOptions,
                  additional as { page: number },
                  selectedCourse?.value
                )
              }
              onChange={async (option) => {
                setSelectedTee(option);
                const teeId = option?.value ?? '';
                setRound((prev) => ({ ...prev, tee_id: teeId.toString() }));

                if (teeId) {
                  const holesData = await fetchHoles(teeId, round.round_holes);
                  const totalPar = holesData.reduce((sum: number, h: any) => sum + (h.par ?? 0), 0);
                  setRound((prev) => ({ ...prev, par_total: totalPar }));
                }
              }}
              isDisabled={!selectedCourse}
              placeholder="Select Tee"
              isClearable
              additional={{ page: 1 }}
              styles={selectStyles}
            />
          </div>

          {initialized && (
            <>
              <button type="button" className="btn btn-toggle" onClick={toggleHoleByHole}>
                {isHBH ? 'Switch to Quick Score Mode' : 'Switch to Hole-by-Hole Mode'}
              </button>

              <button
                type="button"
                className="btn btn-toggle"
                onClick={() =>
                  setRound((prev) => ({ ...prev, advanced_stats: hasAdvanced ? 0 : 1 }))
                }
              >
                {hasAdvanced ? 'Remove Advanced Stats' : 'Add Advanced Stats'}
              </button>
            </>
          )}

          {!isHBH && (
            <div className="form-row">
              <label className="form-label">Par</label>
              <input type="text" value={round.par_total ?? ''} className="form-input" disabled />
            </div>
          )}

          {!isHBH && (
            <div className="form-row">
              <label className="form-label">Score</label>
              <input
                type="text"
                pattern="[0-9]*"
                name="score"
                value={formatValue(round.score)}
                onChange={handleChange}
                className="form-input"
                required
              />
            </div>
          )}

          {!isHBH &&
            hasAdvanced &&
            ['fir_hit', 'gir_hit', 'putts', 'penalties'].map((field) => {
              const labelMap: Record<string, string> = {
                fir_hit: 'FIR',
                gir_hit: 'GIR',
                putts: 'Putts',
                penalties: 'Penalties',
              };

              return (
                <div key={field} className="form-row">
                  <label className="form-label">{labelMap[field]}</label>
                  <input
                    type="text"
                    pattern="[0-9]*"
                    name={field}
                    value={formatValue(round[field as keyof Round] as number)}
                    onChange={handleChange}
                    className="form-input"
                  />
                </div>
              );
            })}

          {renderHoleCards()}

          <div className="form-row">
            <label className="form-label">Notes</label>
            <textarea
              name="notes"
              value={round.notes}
              onChange={(e) => {
                handleChange(e);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              rows={3}
              className="form-input"
              maxLength={500}
              placeholder="Add any notes about your round (max 500 chars)"
              wrap='soft'
            />
          </div>

          <div className="form-actions">
            <button type="button" onClick={() => router.push('/rounds')} className="btn btn-cancel">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-save">
              {loading ? 'Updating...' : 'Update Round'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
