'use client';

import { useCallback, useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import { AsyncPaginate } from 'react-select-async-paginate';
import { selectStyles } from '@/lib/selectStyles';
import HoleCard from '@/components/HoleCard';
import { getLocalDateString } from '@/lib/dateUtils';
import { Plus } from 'lucide-react';
import Select from 'react-select';
import { resolveTeeContext, getValidTeeSegments, type TeeForResolver, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { markInsightsNudgePending, markRoundInsightsRefreshPending } from '@/lib/insights/insightsNudge';
import { SkeletonBlock } from '@/components/skeleton/Skeleton';

// Map API tee object (snake_case) to TeeForResolver (camelCase)
function apiTeeToResolver(tee: any): TeeForResolver {
  return {
    numberOfHoles: tee.number_of_holes,
    courseRating: tee.course_rating,
    slopeRating: tee.slope_rating,
    bogeyRating: tee.bogey_rating,
    parTotal: tee.par_total,
    nonPar3Holes: (tee.holes || []).filter((h: any) => h.par !== 3).length,
    frontCourseRating: tee.front_course_rating,
    frontSlopeRating: tee.front_slope_rating,
    frontBogeyRating: tee.front_bogey_rating,
    backCourseRating: tee.back_course_rating,
    backSlopeRating: tee.back_slope_rating,
    backBogeyRating: tee.back_bogey_rating,
    holes: (tee.holes || []).map((h: any) => ({ holeNumber: h.hole_number, par: h.par })),
  };
}

interface Round {
  date: string;
  course_id: string;
  tee_id: string;
  tee_segment: TeeSegment;
  hole_by_hole: number;
  score: number | null;
  notes: string;
  fir_hit: number | null;
  gir_hit: number | null;
  putts: number | null;
  penalties: number | null;
  round_holes: any[];
  par_total?: number | null;
}

interface HoleScore {
  hole_id: number;
  hole_number: number;
  pass: number;
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

function EditRoundContent() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || 'stats'; // Default to stats if not specified
  const { data: session, status } = useSession();
  const { showMessage, clearMessage, showConfirm } = useMessage();

  const [round, setRound] = useState<Round>({
    date: getLocalDateString(), // Use local timezone instead of UTC
    course_id: '',
    tee_id: '',
    tee_segment: 'full',
    hole_by_hole: 0,
    score: null,
    notes: '',
    fir_hit: null,
    gir_hit: null,
    putts: null,
    penalties: null,
    round_holes: [],
  });

  const [segmentOptions, setSegmentOptions] = useState<{ value: TeeSegment; label: string }[]>([]);

  const [tees, setTees] = useState<any[]>([]);
  const [holes, setHoles] = useState<any[]>([]);
  const [holeScores, setHoleScores] = useState<HoleScore[]>([]);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(null);
  const [selectedTee, setSelectedTee] = useState<TeeOption | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [expandedHole, setExpandedHole] = useState<number>(1);
  const [completedHoles, setCompletedHoles] = useState<Set<number>>(new Set());
  const holeCardRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Update segment options when a tee is selected
  const updateSegmentOptions = useCallback((teeObj: any, currentSegment?: TeeSegment) => {
    if (!teeObj) {
      setSegmentOptions([]);
      setRound(prev => ({ ...prev, tee_segment: 'full' }));
      return;
    }
    const resolver = apiTeeToResolver(teeObj);
    const segments = getValidTeeSegments(resolver);
    setSegmentOptions(segments);
    // Keep current segment if valid, otherwise default to 'full'
    if (currentSegment && segments.some(s => s.value === currentSegment)) {
      setRound(prev => ({ ...prev, tee_segment: currentSegment }));
    } else {
      setRound(prev => ({ ...prev, tee_segment: 'full' }));
    }
  }, []);

  const isHBH = round.hole_by_hole === 1;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Warn user before navigating away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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
      tee_segment: round.tee_segment,
    };
    if (isHBH) {
      payload.round_holes = filteredHoleScores.map((h) => ({
        hole_id: h.hole_id,
        pass: h.pass,
        score: h.score,
        fir_hit: h.fir_hit,
        gir_hit: h.gir_hit,
        putts: h.putts,
        penalties: h.penalties,
      }));
      payload.score = getTotalScore(filteredHoleScores);
      ['fir_hit', 'gir_hit', 'putts', 'penalties'].forEach(
        (f) =>
          (payload[f] = filteredHoleScores.reduce(
            (s, h) => s + ((h[f as keyof HoleScore] as number) ?? 0),
            0
          ))
      );
    } else {
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
        options: coursesArray.map((course: any) => {
          const courseName = course.club_name == course.course_name ? course.course_name : course.club_name + ' - ' + course.course_name;
          const location = course.location;
          const city = location?.city || '';
          const state = location?.state || '';
          const locationString = city && state ? ` (${city}, ${state})` : '';
          return {
            label: courseName + locationString,
            value: course.id,
          };
        }),
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
            teeObj: tee,
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

  const fetchCourse = useCallback(async (courseId: number) => {
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      const data = await res.json();
      return data.course || null;
    } catch (err) {
      console.error(err);
      showMessage('Error fetching course.', 'error');
      return null;
    }
  }, [showMessage]);

  const fetchTees = useCallback(async (courseId: number) => {
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
  }, [showMessage]);

  const fetchHoles = useCallback(async (teeId: number, existingRoundHoles: any[] = [], segment?: TeeSegment) => {
    if (!teeId) return [];
    try {
      const res = await fetch(`/api/tees/${teeId}/holes`);
      const data = await res.json();

      const holesArray = data.holes || [];
      setHoles(holesArray);

      let initScores: HoleScore[];

      if (segment === 'double9') {
        // Use only real holes 1-9 (filter out any legacy synthetic holes 10+)
        const realHoles = holesArray.filter((h: any) => h.hole_number <= 9);
        const pass1 = realHoles.map((hole: any) => {
          const existing = existingRoundHoles.find((h: any) => h.hole_id === hole.id && h.pass === 1);
          return {
            hole_id: hole.id,
            hole_number: hole.hole_number,
            pass: 1,
            par: hole.par,
            score: existing?.score ?? null,
            fir_hit: existing?.fir_hit ?? null,
            gir_hit: existing?.gir_hit ?? null,
            putts: existing?.putts ?? null,
            penalties: existing?.penalties ?? null,
          };
        });
        const pass2 = realHoles.map((hole: any) => {
          const existing = existingRoundHoles.find((h: any) => h.hole_id === hole.id && h.pass === 2);
          return {
            hole_id: hole.id,
            hole_number: hole.hole_number + 9,
            pass: 2,
            par: hole.par,
            score: existing?.score ?? null,
            fir_hit: existing?.fir_hit ?? null,
            gir_hit: existing?.gir_hit ?? null,
            putts: existing?.putts ?? null,
            penalties: existing?.penalties ?? null,
          };
        });
        initScores = [...pass1, ...pass2];
      } else {
        initScores = holesArray.map((hole: any) => {
          const existing = existingRoundHoles.find((h: any) => h.hole_id === hole.id);
          return {
            hole_id: hole.id,
            hole_number: hole.hole_number,
            pass: 1,
            par: hole.par,
            score: existing?.score ?? null,
            fir_hit: existing?.fir_hit ?? null,
            gir_hit: existing?.gir_hit ?? null,
            putts: existing?.putts ?? null,
            penalties: existing?.penalties ?? null,
          };
        });
      }

      setHoleScores(initScores);
      return holesArray;
    } catch (err) {
      console.error(err);
      showMessage('Error fetching holes.', 'error');
      return [];
    }
  }, [showMessage]);

  // Fetch existing round for edit mode
  useEffect(() => {
    if (status !== 'authenticated' || !id) return;

    const fetchRound = async () => {
      try {
        const res = await fetch(`/api/rounds/${id}`);
        const result = await res.json();
        const data = result.round;

        const roundData: Round = {
          date: data.date?.split('T')[0] ?? getLocalDateString(),
          course_id: data.course_id?.toString() ?? '',
          tee_id: data.tee_id?.toString() ?? '',
          tee_segment: data.tee_segment ?? 'full',
          hole_by_hole: data.hole_by_hole === 1 ? 1 : 0,
          score: data.score ?? null,
          notes: data.notes ?? '',
          fir_hit: data.fir_hit ?? null,
          gir_hit: data.gir_hit ?? null,
          putts: data.putts ?? null,
          penalties: data.penalties ?? null,
          round_holes: data.round_holes || [],
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
              updateSegmentOptions(foundTee, roundData.tee_segment);

              if (roundData.tee_id) {
                await fetchHoles(Number(roundData.tee_id), roundData.round_holes || [], roundData.tee_segment);
              }
            }
          }
        }

      } catch (err) {
        console.error(err);
        showMessage('Error fetching round.', 'error');
      } finally {
        setInitialized(true);
      }
    };

    fetchRound();
  }, [id, status, fetchCourse, fetchTees, fetchHoles, updateSegmentOptions, showMessage]);

  // Calculate max FIR (non-par-3 holes) and max GIR (total holes) — segment-aware
  const maxFir = useMemo(() => {
    if (selectedTee?.teeObj) {
      try {
        const resolver = apiTeeToResolver(selectedTee.teeObj);
        const ctx = resolveTeeContext(resolver, round.tee_segment);
        return ctx.nonPar3Holes;
      } catch { /* fall through */ }
    }
    if (holes.length === 0) return 14;
    return holes.filter((h: any) => h.par !== 3).length;
  }, [holes, selectedTee, round.tee_segment]);

  const maxGir = useMemo(() => {
    if (selectedTee?.teeObj) {
      try {
        const resolver = apiTeeToResolver(selectedTee.teeObj);
        const ctx = resolveTeeContext(resolver, round.tee_segment);
        return ctx.holes;
      } catch { /* fall through */ }
    }
    if (holes.length === 0) return 18;
    return holes.length;
  }, [holes, selectedTee, round.tee_segment]);

  // Filter holeScores based on current segment's holeRange
  const filteredHoleScores = useMemo(() => {
    if (!selectedTee?.teeObj || holeScores.length === 0) return holeScores;
    try {
      const resolver = apiTeeToResolver(selectedTee.teeObj);
      const ctx = resolveTeeContext(resolver, round.tee_segment);
      const holeRange = new Set(ctx.holeRange);
      return holeScores.filter(hs => holeRange.has(hs.hole_number));
    } catch {
      return holeScores;
    }
  }, [holeScores, selectedTee, round.tee_segment]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (['score', 'fir_hit', 'gir_hit', 'putts', 'penalties'].includes(name)) {
      const numericValue = sanitizeNumeric(value);

      const maxMap: Record<string, number> = {
        fir_hit: maxFir,
        gir_hit: maxGir,
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
        [field]: value,
      };

      return updated;
    });
  };

  const handleToggleExpand = (holeNumber: number) => {
    // Toggle: if clicking the currently expanded hole, close it
    setExpandedHole((prev) => (prev === holeNumber ? -1 : holeNumber));
  };

  const handleNext = (currentFilteredIndex: number) => {
    const currentHoleNumber = filteredHoleScores[currentFilteredIndex].hole_number;
    setCompletedHoles((prev) => new Set(prev).add(currentHoleNumber));

    if (currentFilteredIndex < filteredHoleScores.length - 1) {
      const nextHoleNumber = filteredHoleScores[currentFilteredIndex + 1].hole_number;
      setExpandedHole(nextHoleNumber);
    } else {
      setExpandedHole(-1);
    }
  };

  const toggleHoleByHole = () => {
    setRound((prev) => {
      const newHBH = prev.hole_by_hole === 1 ? 0 : 1;
      if (newHBH === 1) {
        let fresh: HoleScore[];
        if (prev.tee_segment === 'double9') {
          // Filter to real holes 1-9 only (exclude any synthetic holes 10+)
          const realHoles = holes.filter((h: any) => h.hole_number <= 9);
          const pass1 = realHoles.map((h: any) => {
            const existing = holeScores.find((hs) => hs.hole_id === h.id && hs.pass === 1);
            return {
              hole_id: h.id,
              hole_number: h.hole_number,
              pass: 1,
              par: h.par,
              score: existing?.score ?? null,
              fir_hit: existing?.fir_hit ?? null,
              gir_hit: existing?.gir_hit ?? null,
              putts: existing?.putts ?? null,
              penalties: existing?.penalties ?? null,
            };
          });
          const pass2 = realHoles.map((h: any) => {
            const existing = holeScores.find((hs) => hs.hole_id === h.id && hs.pass === 2);
            return {
              hole_id: h.id,
              hole_number: h.hole_number + 9,
              pass: 2,
              par: h.par,
              score: existing?.score ?? null,
              fir_hit: existing?.fir_hit ?? null,
              gir_hit: existing?.gir_hit ?? null,
              putts: existing?.putts ?? null,
              penalties: existing?.penalties ?? null,
            };
          });
          fresh = [...pass1, ...pass2];
        } else {
          fresh = holes.map((h: any) => {
            const existing = holeScores.find((hs) => hs.hole_id === h.id);
            return {
              hole_id: h.id,
              hole_number: h.hole_number,
              pass: 1,
              par: h.par,
              score: existing?.score ?? null,
              fir_hit: existing?.fir_hit ?? null,
              gir_hit: existing?.gir_hit ?? null,
              putts: existing?.putts ?? null,
              penalties: existing?.penalties ?? null,
            };
          });
        }
        setHoleScores(fresh);
        // Keep the current score when switching to HBH mode instead of nulling it
        return { ...prev, hole_by_hole: 1 };
      }
      const sumScore = getTotalScore(holeScores);
      // Only update score if hole scores were actually entered (sumScore > 0)
      // Otherwise keep the existing after-round score
      return { ...prev, hole_by_hole: 0, score: sumScore > 0 ? sumScore : prev.score };
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
      showMessage('Score is required in After Round mode.', 'error');
      return;
    }

    if (isHBH) {
      const incomplete = filteredHoleScores.find((h) => h.score === null);
      if (incomplete) {
        showMessage(`Please enter a score for hole ${incomplete.hole_number}.`, 'error');
        return;
      }
    }

    setSaving(true);
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

      markInsightsNudgePending();
      markRoundInsightsRefreshPending(String(id));

      // Keep loading state true during navigation to prevent flash
      // Replace history so back button doesn't return to edit page
      // Always go to stats page after save, with from=rounds so back button works correctly
      router.replace(`/rounds/${id}/stats?from=rounds`);
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error saving round', 'error');
      setSaving(false);
    }
  };

  const formatValue = (val: number | null | undefined) =>
    val === null || val === undefined ? '' : val;

  const calculateTotals = () => {
    const totals = { score: 0, par: 0, fir_hit: 0, gir_hit: 0, putts: 0, penalties: 0 };
    let hasScore = false;
    filteredHoleScores.forEach((h) => {
      if (h.score !== null) {
        totals.score += h.score;
        hasScore = true;
      }
      if (h.par !== null) totals.par += h.par;
      ['fir_hit', 'gir_hit', 'putts', 'penalties'].forEach((f) => {
        if (h[f as keyof HoleScore] !== null)
          totals[f as keyof typeof totals] += h[f as keyof HoleScore] as number;
      });
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
        {filteredHoleScores.map((h, filteredIdx) => {
          const actualIdx = holeScores.findIndex(hs => hs.hole_id === h.hole_id && hs.pass === h.pass);
          const isExpanded = expandedHole === h.hole_number;
          const isCompleted = completedHoles.has(h.hole_number);

          return (
            <div
              key={`${h.hole_id}-${h.pass}`}
              ref={(el) => {
                holeCardRefs.current[h.hole_number] = el;
              }}
            >
              <HoleCard
                hole={h.hole_number}
                par={h.par}
                score={h.score}
                fir_hit={h.fir_hit}
                gir_hit={h.gir_hit}
                putts={h.putts}
                penalties={h.penalties}
                isExpanded={isExpanded}
                isCompleted={isCompleted}
                onChange={(_, field, value) => handleHoleScoreChange(actualIdx, field, value)}
                onToggleExpand={handleToggleExpand}
                onNext={() => handleNext(filteredIdx)}
              />
            </div>
          );
        })}

        {filteredHoleScores.length > 0 && (
          <div className="card hole-card-total">
            <div className="hole-header">Totals</div>
            <div className="hole-card-grid">
              <div className="hole-field">
                <strong>Par</strong> {show(totals.par)}
              </div>
              <div className="hole-field">
                <strong>Score</strong> {show(totals.score)}
              </div>
              <div className="hole-field">
                <strong>Fairways In Regulation</strong> {show(totals.fir_hit)}
              </div>
              <div className="hole-field">
                <strong>Putts</strong> {show(totals.putts)}
              </div>
              <div className="hole-field">
                <strong>Greens In Regulation</strong> {show(totals.gir_hit)}
              </div>
              <div className="hole-field">
                <strong>Penalties</strong> {show(totals.penalties)}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const showDataSkeleton = status === 'loading' || !initialized;
  const disableFormControls = showDataSkeleton || saving;

  if (status === 'unauthenticated') return null;

  return (
    <div className="page-stack">
      <div className='card'>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-row">
            <label className="form-label">Date</label>
            {showDataSkeleton ? (
              <SkeletonBlock className="skeleton-input" style={{ height: 44 }} />
            ) : (
              <input
                type="date"
                name="date"
                value={round.date}
                onChange={handleChange}
                className="form-input"
                required
                disabled={disableFormControls}
              />
            )}
          </div>

          <div className="form-row">
            <label className="form-label">Course</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <div style={{ flex: 1 }}>
                {showDataSkeleton ? (
                  <SkeletonBlock className="skeleton-select" style={{ height: 42 }} />
                ) : (
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
                    isDisabled={disableFormControls}
                    noOptionsMessage={() => "Course not found. Use + button to add course."}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => router.push('/courses/search')}
                className="btn btn-accent btn-add-course"
                title="Search Global Database"
                disabled={disableFormControls}
              >
                <Plus/>
              </button>
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">Tee</label>
            {showDataSkeleton ? (
              <SkeletonBlock className="skeleton-select" style={{ height: 42 }} />
            ) : (
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
                  updateSegmentOptions(option?.teeObj);

                  if (teeId) {
                    const holesData = await fetchHoles(teeId, round.round_holes);
                    const totalPar = holesData.reduce((sum: number, h: any) => sum + (h.par ?? 0), 0);
                    setRound((prev) => ({ ...prev, par_total: totalPar }));
                  }
                }}
                isDisabled={disableFormControls || !selectedCourse}
                placeholder="Select Tee"
                isClearable
                additional={{ page: 1 }}
                styles={selectStyles}
              />
            )}
          </div>

          {(showDataSkeleton || segmentOptions.length > 1) && (
            <div className="form-row">
              <label className="form-label">Round Type</label>
              {showDataSkeleton ? (
                <SkeletonBlock className="skeleton-select" style={{ height: 42 }} />
              ) : (
                <Select
                  value={segmentOptions.find(o => o.value === round.tee_segment) || segmentOptions[0]}
                  options={segmentOptions}
                  onChange={async (option: any) => {
                    if (option) {
                      const newSegment = option.value as TeeSegment;
                      if (selectedTee?.teeObj) {
                        try {
                          const resolver = apiTeeToResolver(selectedTee.teeObj);
                          const ctx = resolveTeeContext(resolver, newSegment);
                          setRound(prev => ({ ...prev, tee_segment: newSegment, par_total: ctx.parTotal }));
                        } catch {
                          setRound(prev => ({ ...prev, tee_segment: newSegment }));
                        }
                      } else {
                        setRound(prev => ({ ...prev, tee_segment: newSegment }));
                      }
                      // Re-fetch holes (double9 duplicates client-side)
                      if (round.tee_id) {
                        await fetchHoles(Number(round.tee_id), [], newSegment);
                      }
                    }
                  }}
                  styles={selectStyles}
                  isSearchable={false}
                  isDisabled={disableFormControls}
                />
              )}
            </div>
          )}

          <label className="form-label">How are you logging this round?</label>
          <div className="stats-tabs">
            <button
              type="button"
              className={`stats-tab ${!isHBH ? 'active' : ''}`}
              onClick={() => {
                if (isHBH) toggleHoleByHole();
              }}
              disabled={disableFormControls}
            >
              After Round
            </button>
            <button
              type="button"
              className={`stats-tab ${isHBH ? 'active' : ''}`}
              onClick={() => {
                if (!isHBH) toggleHoleByHole();
              }}
              disabled={disableFormControls}
            >
              During Round
            </button>
          </div>
          <p className="combined-note">
            {isHBH ? 'Log each hole live during your round.' : 'Enter total score quickly after you finish.'}
          </p>

          {!isHBH && (
            <div className="form-row">
              <label className="form-label">Par</label>
              {showDataSkeleton ? (
                <SkeletonBlock className="skeleton-input" />
              ) : (
                <input type="text" value={round.par_total ?? ''} className="form-input" disabled />
              )}
            </div>
          )}

          {!isHBH && (
            <div className="form-row">
              <label className="form-label">Score</label>
              {showDataSkeleton ? (
                <SkeletonBlock className="skeleton-input" />
              ) : (
                <input
                  type="text"
                  pattern="[0-9]*"
                  name="score"
                  value={formatValue(round.score)}
                  onChange={handleChange}
                  onFocus={(e) => {
                    const len = e.target.value.length;
                    e.target.setSelectionRange(len, len);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  enterKeyHint="done"
                  className="form-input"
                  required
                  disabled={disableFormControls}
                />
              )}
            </div>
          )}

          {!isHBH && (
            <p className="combined-note">Track at least 2 stats for stronger insights.</p>
          )}

          {!isHBH &&
            ['fir_hit', 'gir_hit', 'putts', 'penalties'].map((field) => {
              const labelMap: Record<string, string> = {
                fir_hit: 'Fairways In Regulation',
                gir_hit: 'Greens In Regulation',
                putts: 'Putts',
                penalties: 'Penalties',
              };

              return (
                <div key={field} className="form-row">
                  <label className="form-label">{labelMap[field]}</label>
                  {showDataSkeleton ? (
                    <SkeletonBlock className="skeleton-input" />
                  ) : (
                    <input
                      type="text"
                      pattern="[0-9]*"
                      name={field}
                      value={formatValue(round[field as keyof Round] as number)}
                      onChange={handleChange}
                      onFocus={(e) => {
                        const len = e.target.value.length;
                        e.target.setSelectionRange(len, len);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      enterKeyHint="done"
                      className="form-input"
                      disabled={disableFormControls}
                    />
                  )}
                </div>
              );
            })}

          {renderHoleCards()}

          <div className="form-row">
            <label className="form-label">Notes</label>
            {showDataSkeleton ? (
              <SkeletonBlock className="skeleton-input" style={{ height: 84 }} />
            ) : (
              <textarea
                name="notes"
                value={round.notes}
                onChange={(e) => {
                  handleChange(e);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onFocus={(e) => {
                  const len = e.target.value.length;
                  e.target.setSelectionRange(len, len);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                rows={3}
                className="form-input"
                maxLength={500}
                placeholder="Add any notes about your round (max 500 chars)"
                wrap='soft'
                enterKeyHint="done"
                disabled={disableFormControls}
              />
            )}
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => {
                showConfirm({
                  message: 'Are you sure you want to cancel? Any unsaved changes will be lost.',
                  onConfirm: () => {
                    if (from === 'rounds') {
                      router.replace('/rounds');
                    } else {
                      router.replace(`/rounds/${id}/stats`);
                    }
                  }
                });
              }}
              className="btn btn-cancel"
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" disabled={disableFormControls} className="btn btn-save">
              {saving ? 'Updating...' : 'Update Round'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EditRoundPage() {
  return (
    <Suspense fallback={null}>
      <EditRoundContent />
    </Suspense>
  );
}
