'use client';

import { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { GroupBase } from 'react-select';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMessage } from '@/app/providers';
import { AsyncPaginate } from 'react-select-async-paginate';
import { selectStyles } from '@/lib/selectStyles';
import HoleCard from '@/components/HoleCard';
import { getLocalDateString } from '@/lib/dateUtils';
import { Plus } from 'lucide-react';
import Select from 'react-select';
import { resolveTeeContext, getValidTeeSegments, type TeeForResolver, type TeeSegment } from '@/lib/tee/resolveTeeContext';
import { markInsightsNudgePending } from '@/lib/insights/insightsNudge';

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
  advanced_stats: number;
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

function AddRoundContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || 'rounds'; // Default to rounds if not specified
  const { data: session, status } = useSession();
  const { showMessage, clearMessage, showConfirm } = useMessage();

  // Helper to get the back URL based on 'from' parameter
  const getBackUrl = () => {
    if (from.startsWith('/')) {
      // Full URL path (e.g., /courses/123)
      return from;
    }
    switch (from) {
      case 'dashboard':
        return '/dashboard';
      case 'rounds':
      default:
        return '/rounds';
    }
  };

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
    advanced_stats: 1,
  });

  const [segmentOptions, setSegmentOptions] = useState<{ value: TeeSegment; label: string }[]>([]);

  const [holes, setHoles] = useState<any[]>([]);
  const [holeScores, setHoleScores] = useState<HoleScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(null);
  const [selectedTee, setSelectedTee] = useState<TeeOption | null>(null);
  const userProfileRef = useRef<{ default_tee?: string; gender?: string } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [expandedHole, setExpandedHole] = useState<number>(1); // Track which hole is currently expanded
  const [completedHoles, setCompletedHoles] = useState<Set<number>>(new Set()); // Track holes where Next was clicked
  const holeCardRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Update segment options when a tee is selected
  const updateSegmentOptions = (teeObj: any) => {
    if (!teeObj) {
      setSegmentOptions([]);
      setRound(prev => ({ ...prev, tee_segment: 'full' }));
      return;
    }
    const resolver = apiTeeToResolver(teeObj);
    const segments = getValidTeeSegments(resolver);
    setSegmentOptions(segments);
    // Default to 'full'
    setRound(prev => ({ ...prev, tee_segment: 'full' }));
  };

  const isHBH = round.hole_by_hole === 1;
  const hasAdvanced = round.advanced_stats === 1;

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

  // Fetch user profile for default tee preference
  useEffect(() => {
    if (status === 'authenticated') {
      const fetchUserProfile = async () => {
        try {
          const res = await fetch('/api/users/profile');
          const data = await res.json();
          if (data.type === 'success' && data.profile) {
            userProfileRef.current = {
              default_tee: data.profile.default_tee,
              gender: data.profile.gender,
            };
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      };
      fetchUserProfile();
    }
  }, [status]);

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
        fir_hit: hasAdvanced ? h.fir_hit : null,
        gir_hit: hasAdvanced ? h.gir_hit : null,
        putts: hasAdvanced ? h.putts : null,
        penalties: hasAdvanced ? h.penalties : null,
      }));
      payload.score = getTotalScore(filteredHoleScores);

      if (hasAdvanced) {
        ['fir_hit', 'gir_hit', 'putts', 'penalties'].forEach(
          (f) => (payload[f] = filteredHoleScores.reduce((s, h) => s + (h[f as keyof HoleScore] as number ?? 0), 0))
        );
      }
    } else if (hasAdvanced) {
      ['fir_hit', 'gir_hit', 'putts', 'penalties'].forEach((f) => (payload[f] = round[f as keyof Round]));
    }
    return payload;
  };

  const loadCourseOptions = async (
    search: string,
    loadedOptions: any,
    { page }: { page: number } = { page: 1 } // default if undefined
  ) => {
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
      return { options: [], hasMore: false, additional: { page: page + 1 } };
    }
  };

  const loadTeeOptions = async (
    search: string,
    loadedOptions: any,
    { page }: { page: number } = { page: 1 },
    courseId?: number
  ) => {
    if (!courseId)
      return { options: [], hasMore: false, additional: { page: 1 } };

    try {
      const res = await fetch(
        `/api/tees?course_id=${courseId}&search=${encodeURIComponent(
          search
        )}&limit=20&page=${page}`
      );
      const data = await res.json();
      const teesArray: any[] = data.tees || [];

      // Group tees by gender
      const grouped: GroupBase<TeeOption>[] = Object.entries(
        teesArray.reduce((acc: Record<string, TeeOption[]>, tee: any) => {
          const genderKey =
            tee.gender.charAt(0).toUpperCase() + tee.gender.slice(1).toLowerCase();
          if (!acc[genderKey]) acc[genderKey] = [];
          acc[genderKey].push({
            label: `${tee.tee_name} ${tee.total_yards ?? 0} yds (${
              tee.course_rating ?? 0
            }/${tee.slope_rating ?? 0}) ${tee.number_of_holes ?? 0} holes`,
            value: tee.id,
            teeObj: tee, // optional, keep full tee object
          });
          return acc;
        }, {})
      ).map(([label, options]) => ({
        label,
        options, // <-- now typed as TeeOption[]
      }));

      return { options: grouped, hasMore: false, additional: { page: page + 1 } };
    } catch (err) {
      console.error(err);
      return { options: [], hasMore: false, additional: { page: page + 1 } };
    }
  };

  const fetchTees = async (courseId: number) => {
    if (!courseId) return [];
    try {
      const res = await fetch(`/api/tees?course_id=${courseId}`);
      const data = await res.json();
      return data.tees || [];
    } catch (err) {
      console.error(err);
      showMessage('Error fetching tees.', 'error');
      return [];
    }
  };

  const autoSelectTee = (teesArray: any[]) => {
    const profile = userProfileRef.current;
    if (!profile || teesArray.length === 0) {
      return;
    }

    const { default_tee, gender } = profile;

    // If no gender is set, default to 'male' for tee selection
    const effectiveGender = gender || 'male';

    // Define tee order (longest to shortest)
    const teeOrder = ['black', 'gold', 'blue', 'white', 'red'];
    const defaultIndex = default_tee ? teeOrder.indexOf(default_tee.toLowerCase()) : -1;

    let matchedTee = null;

    // 1. Try exact match (name + gender)
    if (default_tee) {
      matchedTee = teesArray.find((t: any) =>
        t.tee_name?.toLowerCase() === default_tee.toLowerCase() &&
        t.gender?.toLowerCase() === effectiveGender.toLowerCase()
      );
    }

    // 2. Try matching just the tee name (any gender)
    if (!matchedTee && default_tee) {
      matchedTee = teesArray.find((t: any) =>
        t.tee_name?.toLowerCase() === default_tee.toLowerCase()
      );
    }

    // 3. If default tee not available, find next longer tee (lower index) for gender
    if (!matchedTee && defaultIndex !== -1) {
      // Try longer tees first (lower index = longer course)
      for (let i = defaultIndex - 1; i >= 0; i--) {
        matchedTee = teesArray.find((t: any) =>
          t.tee_name?.toLowerCase() === teeOrder[i] &&
          t.gender?.toLowerCase() === effectiveGender.toLowerCase()
        );
        if (matchedTee) break;
      }

      // If no longer tee found, try shorter tees
      if (!matchedTee) {
        for (let i = defaultIndex + 1; i < teeOrder.length; i++) {
          matchedTee = teesArray.find((t: any) =>
            t.tee_name?.toLowerCase() === teeOrder[i] &&
            t.gender?.toLowerCase() === effectiveGender.toLowerCase()
          );
          if (matchedTee) break;
        }
      }

      // If still no match with effectiveGender, try without gender filter
      if (!matchedTee) {
        for (let i = defaultIndex - 1; i >= 0; i--) {
          matchedTee = teesArray.find((t: any) =>
            t.tee_name?.toLowerCase() === teeOrder[i]
          );
          if (matchedTee) break;
        }
      }

      if (!matchedTee) {
        for (let i = defaultIndex + 1; i < teeOrder.length; i++) {
          matchedTee = teesArray.find((t: any) =>
            t.tee_name?.toLowerCase() === teeOrder[i]
          );
          if (matchedTee) break;
        }
      }
    }

    // 4. Ultimate fallback - just pick first available tee
    if (!matchedTee && teesArray.length > 0) {
      matchedTee = teesArray[0];
    }

    // Auto-select the matched tee
    if (matchedTee) {
      setRound((prev) => ({ ...prev, tee_id: String(matchedTee.id) }));
      setSelectedTee({
        value: matchedTee.id,
        label: `${matchedTee.tee_name} ${matchedTee.total_yards ?? 0} yds (${matchedTee.course_rating ?? 0}/${matchedTee.slope_rating ?? 0}) ${matchedTee.number_of_holes ?? 0} holes`,
        teeObj: matchedTee,
      });
      updateSegmentOptions(matchedTee);

      // Set par_total from the matched tee
      if (matchedTee.par_total) {
        setRound((prev) => ({ ...prev, par_total: matchedTee.par_total }));
      }
    }
  };

  const fetchHoles = async (teeId: number, existingRoundHoles: any[] = [], segment?: TeeSegment) => {
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
        // Create 18 entries: pass=1 for holes 1-9, pass=2 for holes 10-18 (same hole IDs)
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
  };

  // Initialize from URL params
  useEffect(() => {
    if (status !== 'authenticated' || initialized) return;

    const initAddRound = async () => {
      const courseId = searchParams?.get('courseId');
      const teeId = searchParams?.get('teeId');
      const courseName = searchParams?.get('courseName');

      if (courseId) {
        setRound((prev) => ({ ...prev, course_id: String(courseId) }));
        setSelectedCourse({ label: courseName || '', value: Number(courseId) });

        const fetchedTees = await fetchTees(Number(courseId));

        if (teeId) {
          // Use tee from URL (coming from course details page)
          const foundTee = fetchedTees.find((t: any) => t.id === Number(teeId));
          if (foundTee) {
            setRound((prev) => ({ ...prev, tee_id: String(teeId) }));
            setSelectedTee({
              value: foundTee.id,
              label: `${foundTee.tee_name} ${foundTee.total_yards ?? 0} yds (${foundTee.course_rating ?? 0}/${foundTee.slope_rating ?? 0}) ${foundTee.number_of_holes ?? 0} holes`,
              teeObj: foundTee,
            });
            updateSegmentOptions(foundTee);

            const holesData = await fetchHoles(Number(teeId), []);
            const totalPar = holesData.reduce((sum: number, h: any) => sum + (h.par ?? 0), 0);
            setRound((prev) => ({ ...prev, par_total: totalPar }));
          }
        } else if (fetchedTees.length > 0) {
          // Auto-select tee based on user profile
          autoSelectTee(fetchedTees);
        }
      }
      setInitialized(true);
    };

    initAddRound();
  }, [status, initialized, searchParams]);

  // Fetch holes when tee changes
  useEffect(() => {
    if (!round.tee_id || !initialized) return;

    const initHoles = async () => {
      await fetchHoles(Number(round.tee_id), [], round.tee_segment);
    };

    initHoles();
  }, [round.tee_id]);

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

  const toggleHoleByHole = async () => {
    const newHBH = round.hole_by_hole === 1 ? 0 : 1;

    if (newHBH === 1) {
      // Switching TO hole-by-hole mode
      // Validate that a tee is selected
      if (!round.tee_id) {
        showMessage('Please select a tee before enabling hole-by-hole mode.', 'error');
        return;
      }

      // Ensure holes are fetched if we have a tee selected
      let currentHoles = holes;
      if (holes.length === 0) {
        currentHoles = await fetchHoles(Number(round.tee_id), [], round.tee_segment);
      }

      // Check if we actually got holes
      if (currentHoles.length === 0) {
        showMessage('No holes found for this tee. Please try selecting a different tee.', 'error');
        return;
      }

      // Only re-initialize holeScores if fetchHoles wasn't just called
      // (fetchHoles already sets holeScores internally)
      if (holes.length > 0) {
        let fresh: HoleScore[];
        if (round.tee_segment === 'double9') {
          // Filter to real holes 1-9 only (exclude any synthetic holes 10+)
          const realHoles = currentHoles.filter((h: any) => h.hole_number <= 9);
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
          fresh = currentHoles.map((h: any) => {
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
      }
      // Keep the current score when switching to HBH mode instead of nulling it
      setRound((prev) => ({ ...prev, hole_by_hole: 1 }));
    } else {
      // Switching FROM hole-by-hole mode
      setRound((prev) => ({
        ...prev,
        hole_by_hole: 0,
      }));
    }
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
      const incomplete = filteredHoleScores.find((h) => h.score === null);
      if (incomplete) {
        showMessage(`Please enter a score for hole ${incomplete.hole_number}.`, 'error');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/rounds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload()),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error saving round');

      markInsightsNudgePending();

      // Keep loading state true during navigation to prevent flash
      // Replace history so back button goes to rounds page, not add page
      router.replace(`/rounds/${data.roundId}/stats?from=rounds`);
    } catch (err: any) {
      console.error(err);
      showMessage(err.message || 'Error saving round', 'error');
      setLoading(false);
    }
  };

  const formatValue = (val: number | null | undefined) => (val === null || val === undefined ? '' : val);

  const calculateTotals = () => {
    const totals = { score: 0, par: 0, fir_hit: 0, gir_hit: 0, putts: 0, penalties: 0 };
    let hasScore = false;
    let hasFir = false, hasGir = false, hasPutts = false, hasPenalties = false;

    filteredHoleScores.forEach((h) => {
      if (h.score !== null) {
        totals.score += h.score;
        hasScore = true;
      }
      if (h.par !== null) totals.par += h.par;
      if (hasAdvanced) {
        if (h.fir_hit !== null) {
          totals.fir_hit += h.fir_hit;
          hasFir = true;
        }
        if (h.gir_hit !== null) {
          totals.gir_hit += h.gir_hit;
          hasGir = true;
        }
        if (h.putts !== null) {
          totals.putts += h.putts;
          hasPutts = true;
        }
        if (h.penalties !== null) {
          totals.penalties += h.penalties;
          hasPenalties = true;
        }
      }
    });

    return {
      score: hasScore ? totals.score : null,
      par: totals.par || null,
      fir_hit: hasFir ? totals.fir_hit : null,
      gir_hit: hasGir ? totals.gir_hit : null,
      putts: hasPutts ? totals.putts : null,
      penalties: hasPenalties ? totals.penalties : null,
    };
  };

  const renderHoleCards = () => {
    if (!isHBH || !initialized) return null;

    if (filteredHoleScores.length === 0) {
      return <div className="card">Please wait while holes are loading...</div>;
    }

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
                hasAdvanced={hasAdvanced}
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
              {hasAdvanced && (
                <>
                  <div className="hole-field">
                    <strong>FIR</strong> {show(totals.fir_hit)}
                  </div>
                  <div className="hole-field">
                    <strong>Putts</strong> {show(totals.putts)}
                  </div>
                  <div className="hole-field">
                    <strong>GIR</strong> {show(totals.gir_hit)}
                  </div>
                  <div className="hole-field">
                    <strong>Penalties</strong> {show(totals.penalties)}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (status === 'loading') return <p className="loading-text">Loading...</p>;

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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <div style={{ flex: 1 }}>
                <AsyncPaginate
                  value={selectedCourse}
                  loadOptions={loadCourseOptions}
                  onChange={async (option) => {
                    setSelectedCourse(option);
                    setSelectedTee(null);
                    setRound((prev) => ({ ...prev, course_id: option?.value.toString() ?? '', tee_id: '' }));
                    setHoles([]);
                    setHoleScores([]);

                    // Fetch tees and auto-select based on user profile
                    if (option?.value) {
                      const fetchedTees = await fetchTees(option.value);
                      if (fetchedTees.length > 0) {
                        autoSelectTee(fetchedTees);
                      }
                    }
                  }}
                  additional={{ page: 1 }}
                  placeholder="Select Course"
                  isClearable
                  styles={selectStyles}
                  noOptionsMessage={() => "Course not found. Use + button to add course."}
                />
              </div>
              <button
                type="button"
                onClick={() => router.push('/courses/search')}
                className="btn btn-accent btn-add-course"
                title="Search Global Database"
              >
                <Plus/>
              </button>
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">Tee</label>
            <AsyncPaginate
              key={selectedCourse?.value || 'no-course'}
              value={selectedTee}
              loadOptions={(search, loadedOptions, additional) =>
                loadTeeOptions(search, loadedOptions, additional as { page: number }, selectedCourse?.value)
              }
              onChange={async (option) => {
                setSelectedTee(option);
                const teeId = option?.value ?? '';
                setRound((prev) => ({ ...prev, tee_id: teeId.toString() }));
                updateSegmentOptions(option?.teeObj);

                if (teeId) {
                  const holesData = await fetchHoles(teeId);
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

          {segmentOptions.length > 1 && (
            <div className="form-row">
              <label className="form-label">Round Type</label>
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
              />
            </div>
          )}

          {initialized && (
            <>
              <div className="stats-tabs">
                <button
                  type="button"
                  className={`stats-tab ${!isHBH ? 'active' : ''}`}
                  onClick={() => {
                    if (isHBH) toggleHoleByHole();
                  }}
                >
                  Quick
                </button>
                <button
                  type="button"
                  className={`stats-tab ${isHBH ? 'active' : ''}`}
                  onClick={() => {
                    if (!isHBH) toggleHoleByHole();
                  }}
                >
                  Hole-by-Hole
                </button>
              </div>

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
              />
            </div>
          )}

          {!isHBH &&
            hasAdvanced &&
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
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => {
                showConfirm({
                  message: 'Are you sure you want to cancel? Any unsaved changes will be lost.',
                  onConfirm: () => {
                    router.replace(getBackUrl());
                  }
                });
              }}
              className="btn btn-cancel"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-save">
              {loading ? 'Adding...' : 'Add Round'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AddRoundPage() {
  return (
    <Suspense fallback={<p className="loading-text">Loading...</p>}>
      <AddRoundContent />
    </Suspense>
  );
}
