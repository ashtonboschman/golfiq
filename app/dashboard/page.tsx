'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMessage } from '@/app/providers';
import { useSubscription } from '@/hooks/useSubscription';
import RoundCard from '@/components/RoundCard';
import UpgradeModal from '@/components/UpgradeModal';
import { Plus, TriangleAlert, ToggleLeft, ToggleRight } from 'lucide-react';
import Select from 'react-select';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from 'chart.js';
import { selectStyles } from '@/lib/selectStyles';
import TrendCard from '@/components/TrendCard';
import MissTendenciesChart from '@/components/MissTendenciesChart';
import InfoTooltip from '@/components/InfoTooltip';
import { formatDate, formatHandicap, formatNumber, formatToPar } from '@/lib/formatters';
import { RoundListSkeleton } from '@/components/skeleton/PageSkeletons';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import {
  buildRoundFocusState,
  focusComponentLabel,
  type DashboardOverallInsightsSummary,
} from '@/lib/insights/dashboardFocus';

type StatsMode = 'combined' | '9' | '18';
const dashboardFocusViewedKeys = new Set<string>();
const ROUND_FOCUS_UPDATING_WINDOW_MS = 90_000;

ChartJS.register(ArcElement, ChartTooltip, ChartLegend);

interface DashboardStats {
  handicap: number | null;
  handicap_message?: string | null;
  total_rounds: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  best_to_par: number | null;
  worst_to_par: number | null;
  average_to_par: number | null;
  all_rounds: any[];
  fir_avg: number | null;
  gir_avg: number | null;
  avg_putts: number | null;
  avg_penalties: number | null;
  hbh_stats: {
    par3_avg: number | null;
    par4_avg: number | null;
    par5_avg: number | null;
    hbh_rounds_count: number;
    scoring_breakdown?: {
      ace?: number;
      albatross?: number;
      eagle?: number;
      birdie?: number;
      par?: number;
      bogey?: number;
      double_plus?: number;
    };
  } | null;
  scoring_profile?: {
    normalized_counts: {
      birdie_plus: number;
      par: number;
      bogey: number;
      double_plus: number;
    };
    normalized_total_holes: number;
    percentages: {
      birdie_plus: number;
      par: number;
      bogey: number;
      double_plus: number;
    };
    averages_per_round?: {
      birdie_plus: number;
      par: number;
      bogey: number;
      double_plus: number;
    };
    source_round_count: number;
    normalization: 'combined_18_equivalent' | 'nine_hole' | 'eighteen_hole';
  } | null;
  miss_tendencies?: {
    labels: string[];
    keys: ('miss_left' | 'miss_right' | 'miss_short' | 'miss_long')[];
    fir: {
      percentages: (number | null)[];
      counts: number[];
      tracked_misses: number;
      total_misses: number;
      untracked_misses: number;
    };
    gir: {
      percentages: (number | null)[];
      counts: number[];
      tracked_misses: number;
      total_misses: number;
      untracked_misses: number;
    };
  } | null;
  isPremium?: boolean;
  limitedToLast20?: boolean;
  totalRoundsInDb?: number;
  user?: {
    first_name?: string | null;
    last_name?: string | null;
  };
  overallInsightsSummary?: DashboardOverallInsightsSummary | null;
  latestRoundUpdatedAt?: string | null;
}

function RoundFocusSkeletonBody() {
  return (
    <>
      <div className="dashboard-focus-skeleton-group">
        <div className="skeleton dashboard-focus-skeleton-line dashboard-focus-skeleton-line-title" />
        <div className="skeleton dashboard-focus-skeleton-line dashboard-focus-skeleton-line-body" />
      </div>
      <div className="dashboard-focus-skeleton-group">
        <div className="skeleton dashboard-focus-skeleton-line dashboard-focus-skeleton-line-next-round" />
      </div>
      <div className="dashboard-focus-actions dashboard-focus-actions-skeleton">
        <div className="skeleton dashboard-focus-skeleton-button" />
      </div>
    </>
  );
}

function DashboardFallback() {
  return (
    <div className="page-stack" aria-hidden="true">
      <button className="btn btn-add" disabled>
        <Plus /> Add Round
      </button>

      <div className="dashboard-filters">
        <div className="skeleton skeleton-select" style={{ height: 44 }} />
        <div className="skeleton skeleton-select" style={{ height: 44 }} />
      </div>

      <p className="combined-note">9 hole rounds are doubled to approximate 18 hole stats.</p>

      <div className="card dashboard-focus-card dashboard-focus-card-relative dashboard-focus-skeleton-card">
        <div className="dashboard-focus-header">
          <h3 className="dashboard-focus-title">Round Focus</h3>
          <span className="skeleton dashboard-focus-confidence-pill-skeleton" />
        </div>
        <RoundFocusSkeletonBody />
      </div>

      <div className="grid grid-2">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div
            className="card dashboard-stat-card skeleton-dashboard-stat-card dashboard-live-label-skeleton-card"
            key={`dashboard-fallback-stat-${idx}`}
          >
            <div className="skeleton skeleton-dashboard-stat-value dashboard-live-label-skeleton-value" />
          </div>
        ))}
      </div>

      <div className="trend-card" style={{ height: 300 }}>
        <h3 className="insights-centered-title">Score Trend</h3>
        <div className="skeleton skeleton-chart-area" />
      </div>

      <div className="section">
        <div className="card last-five-rounds-card">
          <h3>Last 5 Rounds</h3>
        </div>
        <RoundListSkeleton count={5} metricCount={8} showHolesTag={false} />
      </div>
    </div>
  );
}

function DashboardContent({ userId: propUserId }: { userId?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { showMessage, clearMessage } = useMessage();
  const searchParams = useSearchParams();

  const queryUserId = searchParams.get('user_id');
  const requestedUserId =
    propUserId || (queryUserId ? parseInt(queryUserId, 10) : null) || session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsMode, setStatsMode] = useState<StatsMode>('combined');
  const [dateFilter, setDateFilter] = useState('all');
  const [activeMilestoneModal, setActiveMilestoneModal] = useState<'welcome' | 'unlock' | 'upgrade' | null>(null);
  const [showToPar, setShowToPar] = useState(false);
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const [accentColor, setAccentColor] = useState('#2D6CFF');
  const [accentHighlight, setAccentHighlight] = useState('#36ad64');
  const [warningColor, setWarningColor] = useState('#f59e0b');
  const [dangerColor, setDangerColor] = useState('#e74c3c');
  const [textColor, setTextColor] = useState('#EDEFF2');
  const [gridColor, setGridColor] = useState('#2A313D');
  const [surfaceColor, setSurfaceColor] = useState('#171C26');
  const [showFocusConfidenceInfo, setShowFocusConfidenceInfo] = useState(false);
  const focusConfidenceTooltipRef = useRef<HTMLDivElement | null>(null);
  const scoringProfileCardRef = useRef<HTMLDivElement | null>(null);
  const [scoringProfileHoveredIndex, setScoringProfileHoveredIndex] = useState<number | null>(null);
  const [scoringProfileSelectedIndex, setScoringProfileSelectedIndex] = useState<number | null>(null);
  const statsRequestIdRef = useRef(0);
  const [stats, setStats] = useState<DashboardStats>({
    handicap: null,
    handicap_message: null,
    total_rounds: 0,
    best_score: null,
    worst_score: null,
    average_score: null,
    best_to_par: null,
    worst_to_par: null,
    average_to_par: null,
    all_rounds: [],
    fir_avg: null,
    gir_avg: null,
    avg_putts: null,
    avg_penalties: null,
    hbh_stats: null,
    scoring_profile: null,
    miss_tendencies: null,
    overallInsightsSummary: null,
    latestRoundUpdatedAt: null,
  });

  const trackUpgradeClick = useCallback((ctaLocation: string) => {
    captureClientEvent(
      ANALYTICS_EVENTS.upgradeCtaClicked,
      {
        cta_location: ctaLocation,
        source_page: pathname,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );
  }, [pathname, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, status]);

  const trackFocusCtaClick = useCallback((component: string | null, focusType: string, confidence: string | null, deltaScore: number | null) => {
    captureClientEvent(
      ANALYTICS_EVENTS.dashboardFocusCtaClicked,
      {
        cta: 'view_insights',
        plan: isPremium ? 'premium' : 'free',
        mode: statsMode,
        focus_type: focusType,
        component,
        deltaScore,
        confidence,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );
  }, [isPremium, pathname, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, statsMode, status]);

  // Load theme colors from CSS variables
  useEffect(() => {
    const updateThemeColors = () => {
      const rootStyles = getComputedStyle(document.documentElement);
      const accent = rootStyles.getPropertyValue('--color-accent').trim() || '#2D6CFF';
      const highlight = rootStyles.getPropertyValue('--color-accent-highlight').trim() || '#36ad64';
      const warning = rootStyles.getPropertyValue('--color-warning').trim() || '#f59e0b';
      const danger = rootStyles.getPropertyValue('--color-red').trim() || '#e74c3c';
      const text = rootStyles.getPropertyValue('--color-primary-text').trim() || '#EDEFF2';
      const grid = rootStyles.getPropertyValue('--color-border').trim() || '#2A313D';
      const surface = rootStyles.getPropertyValue('--color-primary-surface').trim() || '#171C26';

      setAccentColor(accent);
      setAccentHighlight(highlight);
      setWarningColor(warning);
      setDangerColor(danger);
      setTextColor(text);
      setGridColor(grid);
      setSurfaceColor(surface);
    };

    updateThemeColors();

    // Re-check when theme might change
    const observer = new MutationObserver(updateThemeColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  // Fetch dashboard stats
  useEffect(() => {
    if (status !== 'authenticated' || !requestedUserId) return;

    const MAX_ATTEMPTS = 2;
    const RETRY_DELAY_MS = 350;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const controller = new AbortController();
    const requestId = statsRequestIdRef.current + 1;
    statsRequestIdRef.current = requestId;
    const isStaleOrAborted = () => controller.signal.aborted || requestId !== statsRequestIdRef.current;

    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      clearMessage();

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const res = await fetch(
            `/api/dashboard?statsMode=${statsMode}&user_id=${requestedUserId}&dateFilter=${dateFilter}`,
            {
              cache: 'no-store',
              credentials: 'include',
              headers: { Accept: 'application/json' },
              signal: controller.signal,
            },
          );
          if (isStaleOrAborted()) return;

          if (res.status === 403) {
            if (isStaleOrAborted()) return;
            setError('This dashboard is private or visible to friends only.');
            setStats({
              handicap: null,
              total_rounds: 0,
              best_score: null,
              worst_score: null,
              average_score: null,
              best_to_par: null,
              worst_to_par: null,
              average_to_par: null,
              all_rounds: [],
              fir_avg: null,
              gir_avg: null,
              avg_putts: null,
              avg_penalties: null,
              hbh_stats: null,
              scoring_profile: null,
              miss_tendencies: null,
              overallInsightsSummary: null,
              latestRoundUpdatedAt: null,
            });
            return;
          }

          if (res.status === 401) {
            if (isStaleOrAborted()) return;
            router.replace('/login');
            return;
          }

          const contentType = res.headers.get('content-type') || '';
          let data: any = null;

          if (contentType.includes('application/json')) {
            data = await res.json();
            if (isStaleOrAborted()) return;
          } else if (!res.ok && attempt < MAX_ATTEMPTS && res.status >= 500) {
            if (isStaleOrAborted()) return;
            await delay(RETRY_DELAY_MS);
            continue;
          } else if (!contentType.includes('application/json')) {
            throw new Error(`Unexpected dashboard response format (status ${res.status})`);
          }

          if (!res.ok || data?.type === 'error') {
            const message = data?.message || `Error fetching dashboard stats (${res.status})`;
            const isNoRoundsMessage =
              typeof message === 'string' && /no rounds found/i.test(message);
            if (isNoRoundsMessage) {
              setStats({
                handicap: null,
                handicap_message: null,
                total_rounds: 0,
                best_score: null,
                worst_score: null,
                average_score: null,
                best_to_par: null,
                worst_to_par: null,
                average_to_par: null,
                all_rounds: [],
                fir_avg: null,
                gir_avg: null,
                avg_putts: null,
                avg_penalties: null,
                hbh_stats: null,
                scoring_profile: null,
                miss_tendencies: null,
                overallInsightsSummary: null,
                latestRoundUpdatedAt: null,
              });
              setError(null);
              return;
            }
            if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
              if (isStaleOrAborted()) return;
              await delay(RETRY_DELAY_MS);
              continue;
            }
            if (isStaleOrAborted()) return;
            console.error('Dashboard API error:', message);
            showMessage(message, 'error');
            setError(message);
            return;
          }

          if (isStaleOrAborted()) return;
          setStats(data);
          return;
        } catch (err) {
          const isAbortError =
            (err instanceof DOMException && err.name === 'AbortError') ||
            (typeof err === 'object' &&
              err !== null &&
              'name' in err &&
              (err as { name?: string }).name === 'AbortError');
          if (isAbortError || isStaleOrAborted()) {
            return;
          }
          if (attempt < MAX_ATTEMPTS) {
            await delay(RETRY_DELAY_MS);
            continue;
          }
          console.error('Dashboard fetch error:', err);
          showMessage('Failed to load dashboard. Check console.', 'error');
          setError('Failed to load dashboard.');
        }
      }

      setLoading(false);
    };

    fetchStats().finally(() => {
      if (!isStaleOrAborted()) {
        setLoading(false);
      }
    });

    return () => {
      controller.abort();
    };
  }, [status, statsMode, dateFilter, requestedUserId, router, showMessage, clearMessage]);

  const isOwnDashboard = parseInt(requestedUserId?.toString() || '0') === parseInt(session?.user?.id || '0');
  const lastKnownTotalRoundsInDbRef = useRef<number | null>(null);

  // Use totalRoundsInDb (unfiltered count) to ensure milestone modals
  // are evaluated against lifetime rounds regardless of mode/date filters.
  const totalRoundsForModal = stats.totalRoundsInDb ?? lastKnownTotalRoundsInDbRef.current ?? stats.total_rounds;

  useEffect(() => {
    if (typeof stats.totalRoundsInDb === 'number') {
      lastKnownTotalRoundsInDbRef.current = stats.totalRoundsInDb;
    }
  }, [stats.totalRoundsInDb]);

  const getMilestoneAckKey = useCallback((modalType: 'welcome' | 'unlock' | 'upgrade', rounds: number) => {
    return `milestone-modal-ack:${session?.user?.id ?? 'anon'}:${modalType}:${rounds}`;
  }, [session?.user?.id]);

  useEffect(() => {
    // If round count drops, clear acknowledged keys above current rounds so
    // re-hitting that milestone (e.g. 3 -> 2 -> 3) shows the modal again.
    if (loading || subscriptionLoading || status !== 'authenticated' || !isOwnDashboard) return;
    const reliableRounds =
      typeof stats.totalRoundsInDb === 'number'
        ? stats.totalRoundsInDb
        : lastKnownTotalRoundsInDbRef.current;
    if (typeof reliableRounds !== 'number') return;

    const userPrefix = `milestone-modal-ack:${session?.user?.id ?? 'anon'}:`;
    const currentRounds = reliableRounds;

    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(userPrefix)) continue;

      const roundToken = key.split(':').pop();
      const roundValue = Number(roundToken);
      if (Number.isFinite(roundValue) && roundValue > currentRounds) {
        localStorage.removeItem(key);
      }
    }
  }, [
    isOwnDashboard,
    loading,
    session?.user?.id,
    stats.totalRoundsInDb,
    status,
    subscriptionLoading,
  ]);

  useEffect(() => {
    // Wait for dashboard + subscription state, and only evaluate on own dashboard.
    if (loading || subscriptionLoading || status !== 'authenticated' || !isOwnDashboard || totalRoundsForModal < 0) {
      setActiveMilestoneModal(null);
      return;
    }

    // Round 0 is a beta welcome message for new users.
    if (totalRoundsForModal === 0) {
      const welcomeAcknowledged = localStorage.getItem(getMilestoneAckKey('welcome', totalRoundsForModal)) === 'true';
      setActiveMilestoneModal(welcomeAcknowledged ? null : 'welcome');
      return;
    }

    if (totalRoundsForModal < 3) {
      setActiveMilestoneModal(null);
      return;
    }

    // Round 3 is a capability unlock milestone (not a premium upsell).
    if (totalRoundsForModal === 3) {
      const unlockAcknowledged = localStorage.getItem(getMilestoneAckKey('unlock', totalRoundsForModal)) === 'true';
      setActiveMilestoneModal(unlockAcknowledged ? null : 'unlock');
      return;
    }

    // Premium upsell milestones: 5, 10, 15, 20, ...
    if (!isPremium && totalRoundsForModal >= 5 && totalRoundsForModal % 5 === 0) {
      const upgradeAcknowledged = localStorage.getItem(getMilestoneAckKey('upgrade', totalRoundsForModal)) === 'true';
      setActiveMilestoneModal(upgradeAcknowledged ? null : 'upgrade');
      return;
    }

    setActiveMilestoneModal(null);
  }, [
    getMilestoneAckKey,
    isOwnDashboard,
    isPremium,
    loading,
    status,
    subscriptionLoading,
    totalRoundsForModal,
  ]);

  const handleCloseMilestoneModal = () => {
    if (activeMilestoneModal) {
      localStorage.setItem(getMilestoneAckKey(activeMilestoneModal, totalRoundsForModal), 'true');
    }
    setActiveMilestoneModal(null);
  };

  const displayRounds = (stats.all_rounds ?? []).map((r: any) => ({
    ...r,
    course_name: r.course?.course_name ?? '-',
    club_name: r.course?.club_name ?? '-',
    city: r.course?.city ?? '-',
    state: r.course?.state ?? '-',
    tee_id: r.tee?.tee_id ?? null,
    tee_name: r.tee?.tee_name ?? '-',
  }));

  const sortedRounds = [...displayRounds].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const lastRounds = sortedRounds.slice(0, 5);
  // Use total_rounds which is already filtered by stats mode
  const totalRounds = stats.total_rounds;

  const par3_avg = stats.hbh_stats?.par3_avg ?? null;
  const par4_avg = stats.hbh_stats?.par4_avg ?? null;
  const par5_avg = stats.hbh_stats?.par5_avg ?? null;

  const scoringProfile = stats.scoring_profile ?? null;
  const scoringProfileTotalHoles = scoringProfile?.normalized_total_holes ?? 0;
  const scoringProfileSourceRounds = scoringProfile?.source_round_count ?? 0;
  const fallbackAveragePerRound = (count: number): number => {
    if (!Number.isFinite(scoringProfileSourceRounds) || scoringProfileSourceRounds <= 0) return 0;
    return Number((count / scoringProfileSourceRounds).toFixed(2));
  };
  const hasScoringProfileData = scoringProfileTotalHoles > 0;
  const scoringProfileItems = [
    {
      key: 'birdie_plus',
      label: 'Birdie+',
      count: scoringProfile?.normalized_counts.birdie_plus ?? 0,
      percentage: scoringProfile?.percentages.birdie_plus ?? 0,
      averagePerRound:
        scoringProfile?.averages_per_round?.birdie_plus ??
        fallbackAveragePerRound(scoringProfile?.normalized_counts.birdie_plus ?? 0),
      color: accentHighlight,
    },
    {
      key: 'par',
      label: 'Par',
      count: scoringProfile?.normalized_counts.par ?? 0,
      percentage: scoringProfile?.percentages.par ?? 0,
      averagePerRound:
        scoringProfile?.averages_per_round?.par ??
        fallbackAveragePerRound(scoringProfile?.normalized_counts.par ?? 0),
      color: accentColor,
    },
    {
      key: 'bogey',
      label: 'Bogey',
      count: scoringProfile?.normalized_counts.bogey ?? 0,
      percentage: scoringProfile?.percentages.bogey ?? 0,
      averagePerRound:
        scoringProfile?.averages_per_round?.bogey ??
        fallbackAveragePerRound(scoringProfile?.normalized_counts.bogey ?? 0),
      color: warningColor,
    },
    {
      key: 'double_plus',
      label: 'Double+',
      count: scoringProfile?.normalized_counts.double_plus ?? 0,
      percentage: scoringProfile?.percentages.double_plus ?? 0,
      averagePerRound:
        scoringProfile?.averages_per_round?.double_plus ??
        fallbackAveragePerRound(scoringProfile?.normalized_counts.double_plus ?? 0),
      color: dangerColor,
    },
  ] as const;
  const withAlpha = (color: string, alpha: number): string => {
    const clamped = Math.max(0, Math.min(1, alpha));
    const rgbMatch = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (rgbMatch) {
      return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${clamped})`;
    }
    const rgbaMatch = color.match(
      /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/i,
    );
    if (rgbaMatch) {
      return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${clamped})`;
    }
    const hex = color.replace('#', '').trim();
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return `rgba(${r}, ${g}, ${b}, ${clamped})`;
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${clamped})`;
    }
    return color;
  };
  const scoringProfileActiveIndex =
    scoringProfileHoveredIndex != null ? scoringProfileHoveredIndex : scoringProfileSelectedIndex;
  const scoringProfileActiveItem =
    scoringProfileActiveIndex != null ? scoringProfileItems[scoringProfileActiveIndex] : null;
  const scoringProfilePercentText = (value: number): string =>
    Number.isFinite(value) ? `${Math.round(value)}%` : '-';
  const scoringProfileAveragePerRoundText = (value: number): string => {
    if (!Number.isFinite(value)) return '0.0 / round';
    return `${value.toFixed(1)} / round`;
  };
  const scoringProfileAriaSummary = scoringProfileItems
    .map((item) => `${item.label} ${scoringProfilePercentText(item.percentage)}`)
    .join(', ');
  const scoringProfileChartData = {
    labels: scoringProfileItems.map((item) => item.label),
    datasets: [
      {
        data: scoringProfileItems.map((item) =>
          Number.isFinite(item.percentage) ? Math.max(0, item.percentage) : 0,
        ),
        backgroundColor: scoringProfileItems.map((item, index) =>
          scoringProfileActiveIndex == null || scoringProfileActiveIndex === index
            ? item.color
            : withAlpha(item.color, 0.72),
        ),
        borderColor: scoringProfileItems.map((_, index) =>
          scoringProfileActiveIndex === index
            ? withAlpha(textColor, 0.62)
            : withAlpha(textColor, 0.14),
        ),
        borderWidth: scoringProfileItems.map((_, index) =>
          scoringProfileActiveIndex === index ? 2 : 1,
        ),
        hoverOffset: 4,
        offset: scoringProfileItems.map((_, index) =>
          scoringProfileActiveIndex === index ? 2 : 0,
        ),
        hoverBorderColor: withAlpha(textColor, 0.62),
        hoverBorderWidth: 2,
      },
    ],
  };
  const scoringProfileChartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '62%',
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: false,
      },
    },
    onHover: (_event: unknown, elements: any[]) => {
      if (elements.length > 0) {
        setScoringProfileHoveredIndex(elements[0].index);
      } else {
        setScoringProfileHoveredIndex(null);
      }
    },
    onClick: (_event: unknown, elements: any[]) => {
      if (elements.length > 0) {
        setScoringProfileSelectedIndex(elements[0].index);
      }
    },
  };

  // Premium users get 20 rounds for trend charts, free users get 5
  const trendRoundsCount = isPremium ? 20 : 5;
  const trendRounds = sortedRounds.slice(0, trendRoundsCount);

  const trendData = [...trendRounds]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((r, index) => ({
      id: r.id, // Use the round ID as unique identifier
      date: r.date,
      dateLabel: formatDate(r.date),
      uniqueKey: `${r.date}-${index}`,
      score: r.score,
      to_par: r.to_par,
      fir_pct:
        r.fir_hit != null && r.fir_total != null ? (r.fir_hit / r.fir_total) * 100 : null,
      gir_pct:
        r.gir_hit != null && r.gir_total != null ? (r.gir_hit / r.gir_total) * 100 : null,
    }));

    const scoreChartData = {
      labels: trendData.map(d => d.dateLabel),
      datasets: [
        {
          label: showToPar ? 'Score to Par' : 'Total Score',
          data: trendData.map(d =>
            showToPar ? d.to_par : d.score
          ),
          borderColor: accentColor,
          backgroundColor: 'rgba(0,0,0,0)',
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: accentColor,
          pointHoverRadius: 7,
        },
      ],
    };


    const firGirData = {
      labels: trendData.map(d => d.dateLabel),
      datasets: [
        {
          label: 'FIR %',
          data: trendData.map(d => d.fir_pct ?? null),
          borderColor: accentColor,
          backgroundColor: `${accentColor}22`,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: accentColor,
          pointHoverRadius: 7,
          spanGaps: true,
        },
        {
          label: 'GIR %',
          data: trendData.map(d => d.gir_pct ?? null),
          borderColor: accentHighlight,
          backgroundColor: `${accentHighlight}22`,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: accentHighlight,
          pointHoverRadius: 7,
          spanGaps: true,
        },
      ],
    };

  // Dynamic premium upsell messaging based on round count (use unfiltered count)
  const getUpgradeModalMessage = () => {
    const rounds = totalRoundsForModal;
    if (rounds === 5) {
      return "5 rounds logged! Upgrade to Premium for deeper trends and full-scope performance insights.";
    } else if (rounds === 10) {
      return "10 rounds played! Premium gives you detailed trends and analytics to improve faster.";
    } else if (rounds === 15) {
      return "15 rounds logged! Upgrade to Premium to see full insights beyond your recent rounds.";
    } else if (rounds === 20) {
      return "20 rounds reached - the free stats limit! Upgrade to Premium for unlimited history and advanced insights.";
    } else if (rounds > 20 && rounds % 5 === 0) {
      return `${rounds} rounds logged! Unlock Premium to analyze all your rounds and track long-term performance.`;
    } else {
      return `You've logged ${rounds} rounds! Upgrade to Premium for unlimited analytics and Intelligent Insights.`;
    }
  };

  const formatWholePercent = (value: number | null): string => {
    if (value == null || !Number.isFinite(value)) return '-';
    return `${Math.round(value)}%`;
  };

  const formatFocusConfidenceLabel = (value: 'high' | 'medium' | 'low' | null | undefined): string => {
    if (value === 'high') return 'High';
    if (value === 'medium') return 'Medium';
    return 'Low';
  };

  const getFocusConfidenceTone = (value: 'high' | 'medium' | 'low' | null | undefined): 'high' | 'medium' | 'low' => {
    if (value === 'high') return 'high';
    if (value === 'medium') return 'medium';
    return 'low';
  };

  const focusSummary = stats.overallInsightsSummary ?? null;
  const roundFocusState = buildRoundFocusState(
    focusSummary,
    Boolean(isPremium),
    Boolean(stats.limitedToLast20),
  );
  const focusPayload = roundFocusState.focus;
  const focusComponent = focusComponentLabel(focusPayload?.component ?? null);
  const focusTypeForEvent = focusPayload?.focusType ?? 'score';
  const focusConfidenceLabel = formatFocusConfidenceLabel(focusPayload?.confidence);
  const focusConfidenceTone = getFocusConfidenceTone(focusPayload?.confidence);

  const parseTimestamp = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
  };

  const latestRoundUpdatedAtTs = parseTimestamp(stats.latestRoundUpdatedAt);
  const focusLastUpdatedTs = parseTimestamp(focusSummary?.lastUpdatedAt ?? null);
  const nowTs = Date.now();
  const showFocusUpdatingNote =
    latestRoundUpdatedAtTs != null &&
    focusLastUpdatedTs != null &&
    latestRoundUpdatedAtTs > focusLastUpdatedTs &&
    nowTs - latestRoundUpdatedAtTs <= ROUND_FOCUS_UPDATING_WINDOW_MS;

  const trackDashboardFocusModeChanged = useCallback((fromMode: StatsMode, toMode: StatsMode) => {
    captureClientEvent(
      ANALYTICS_EVENTS.dashboardFocusModeChanged,
      {
        fromMode,
        toMode,
        plan: isPremium ? 'premium' : 'free',
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );
  }, [isPremium, pathname, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, status]);

  const runFocusAction = useCallback(() => {
    trackFocusCtaClick(
      focusComponent,
      focusPayload.focusType,
      focusSummary?.confidence ?? null,
      focusSummary?.scoreTrendDelta ?? null,
    );
    router.push('/insights');
  }, [focusComponent, focusPayload, focusSummary?.confidence, focusSummary?.scoreTrendDelta, router, trackFocusCtaClick]);

  useEffect(() => {
    if (!showFocusConfidenceInfo) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!focusConfidenceTooltipRef.current) return;
      if (!focusConfidenceTooltipRef.current.contains(event.target as Node)) {
        setShowFocusConfidenceInfo(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showFocusConfidenceInfo]);

  useEffect(() => {
    if (!hasScoringProfileData) {
      setScoringProfileHoveredIndex(null);
      setScoringProfileSelectedIndex(null);
    }
  }, [hasScoringProfileData]);

  useEffect(() => {
    if (scoringProfileSelectedIndex == null) return;
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!scoringProfileCardRef.current) return;
      if (!scoringProfileCardRef.current.contains(event.target as Node)) {
        setScoringProfileSelectedIndex(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [scoringProfileSelectedIndex]);

  useEffect(() => {
    if (loading || status !== 'authenticated') return;

    const viewKey = [
      session?.user?.id ?? 'unknown',
      statsMode,
      isPremium ? 'premium' : 'free',
      focusTypeForEvent,
      focusPayload?.component ?? 'none',
      focusSummary?.scoreTrendDelta ?? 'na',
      focusSummary?.confidence ?? 'na',
    ].join('|');

    if (dashboardFocusViewedKeys.has(viewKey)) return;
    dashboardFocusViewedKeys.add(viewKey);

    captureClientEvent(
      ANALYTICS_EVENTS.dashboardFocusViewed,
      {
        plan: isPremium ? 'premium' : 'free',
        mode: statsMode,
        focus_type: focusTypeForEvent,
        component: focusComponent,
        deltaScore: focusSummary?.scoreTrendDelta ?? null,
        confidence: focusSummary?.confidence ?? null,
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: status === 'authenticated',
      },
    );
  }, [
    focusComponent,
    focusSummary?.confidence,
    focusSummary?.scoreTrendDelta,
    focusPayload?.component,
    focusTypeForEvent,
    isPremium,
    loading,
    pathname,
    session?.user?.auth_provider,
    session?.user?.id,
    session?.user?.subscription_tier,
    statsMode,
    status,
  ]);

  if (error && !loading) return <p className="error-text">{error}</p>;

  return (
    <div className="page-stack">
      {!isOwnDashboard && stats.user && (
        <h2 className="dashboard-user-header">
          {stats.user.first_name} {stats.user.last_name}'s Dashboard
        </h2>
      )}

      {isOwnDashboard && (
        <button
          className="btn btn-add"
          onClick={() => router.push('/rounds/add?from=dashboard')}
          disabled={loading}
        >
          <Plus/> Add Round
        </button>
      )}

      <div className="dashboard-filters">
        <Select
          instanceId="dashboard-stats-mode"
          inputId="dashboard-stats-mode-input"
          value={{ value: statsMode, label: statsMode === 'combined' ? 'Combined' : statsMode === '9' ? '9 Holes' : '18 Holes' }}
          onChange={(option) => {
            if (!option) return;
            const nextMode = option.value as StatsMode;
            if (nextMode === statsMode) return;
            trackDashboardFocusModeChanged(statsMode, nextMode);
            setStatsMode(nextMode);
          }}
          options={[
            { value: 'combined', label: 'Combined' },
            { value: '9', label: '9 Holes' },
            { value: '18', label: '18 Holes' },
          ]}
          isSearchable={false}
          isDisabled={loading}
          styles={selectStyles}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        />
        <Select
          instanceId="dashboard-date-filter"
          inputId="dashboard-date-filter-input"
          value={{
            value: dateFilter,
            label:
              dateFilter === 'all'
                ? `All Time ${!subscriptionLoading && !isPremium ? '(Premium)' : ''}`
                : dateFilter === '30'
                ? `Last 30 Days ${!subscriptionLoading && !isPremium ? '(Premium)' : ''}`
                : dateFilter === '90'
                ? `Last 90 Days ${!subscriptionLoading && !isPremium ? '(Premium)' : ''}`
                : `Last Year ${!subscriptionLoading && !isPremium ? '(Premium)' : ''}`,
          }}
          onChange={(option) => {
            if (!subscriptionLoading && !isPremium) {
              trackUpgradeClick('dashboard_date_filter_lock');
              router.push('/pricing'); // redirect free users
            } else if (option) {
              setDateFilter(option.value);
            }
          }}
          options={[
            { value: 'all', label: `All Time ${!subscriptionLoading && !isPremium ? '(Premium)' : ''}` },
            { value: '30', label: `Last 30 Days ${!subscriptionLoading && !isPremium ? '(Premium)' : ''}` },
            { value: '90', label: `Last 90 Days ${!subscriptionLoading && !isPremium ? '(Premium)' : ''}` },
            { value: '365', label: `Last Year ${!subscriptionLoading && !isPremium ? '(Premium)' : ''}` },
          ]}
          isSearchable={false}
          isDisabled={subscriptionLoading || loading} // disable while loading
          styles={selectStyles}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
          className={
            !subscriptionLoading && !isPremium
              ? 'dashboard-date-filter locked'
              : 'dashboard-date-filter'
          }
        />
      </div>
      {statsMode === 'combined' && (
        <p className="combined-note">9 hole rounds are doubled to approximate 18 hole stats.</p>
      )}

      <div className="card dashboard-focus-card dashboard-focus-card-relative" data-testid="dashboard-focus-card">
        <div className="dashboard-focus-header">
          <h3 className="dashboard-focus-title">Round Focus</h3>
          {loading ? (
            <span className="skeleton dashboard-focus-confidence-pill-skeleton" />
          ) : (
            <div ref={focusConfidenceTooltipRef} className="info-tooltip-container dashboard-focus-confidence-tooltip">
              <button
                type="button"
                className={`dashboard-focus-confidence-pill is-${focusConfidenceTone}`}
                aria-label={`Focus confidence: ${focusConfidenceLabel}`}
                onClick={() => setShowFocusConfidenceInfo((prev) => !prev)}
              >
                {focusConfidenceLabel}
              </button>
              {showFocusConfidenceInfo && (
                <div className="info-tooltip-content center below ready dashboard-focus-confidence-popover">
                  <h4>Focus Confidence</h4>
                  <p>
                    Shows how reliable your Round Focus is. Low means general guidance. Medium means some trends are available. High means stronger data and clearer patterns.
                  </p>
                  <div className="info-tooltip-arrow center below" />
                </div>
              )}
            </div>
          )}
        </div>
        {loading ? (
          <RoundFocusSkeletonBody />
        ) : (
          <>
            <p className="dashboard-focus-headline">{focusPayload.headline}</p>
            {focusPayload.body && (
              <p className="dashboard-focus-body">{focusPayload.body}</p>
            )}
            {focusPayload.nextRound && (
              <p className="dashboard-focus-body dashboard-focus-next-round">
                Next Round: {focusPayload.nextRound}
              </p>
            )}
            {showFocusUpdatingNote && (
              <p className="dashboard-focus-updating">Updating focus...</p>
            )}
            <div className="dashboard-focus-actions">
              <button
                type="button"
                className="btn btn-add"
                onClick={runFocusAction}
              >
                See Full Breakdown
              </button>
            </div>
          </>
        )}
      </div>

      {/* Premium upgrade CTA for limited users */}
      {!loading && stats.limitedToLast20 && stats.totalRoundsInDb && stats.totalRoundsInDb > 20 && (
        <div className="info-banner warning">
          <div className="info-banner-content">
            <div className="info-banner-icon"><TriangleAlert size={50}/></div>
            <div className="info-banner-text">
              <h4>Limited Stats View</h4>
              <p>
                Stats are based on your most recent 20 of {stats.totalRoundsInDb} rounds. Upgrade to Premium for full-history insights.
              </p>
            </div>
            
          </div>
          <button
              type="button"
              onClick={() => {
                trackUpgradeClick('dashboard_limited_stats_banner');
                router.push('/pricing');
              }}
              className="btn btn-upgrade"
            >
              Unlock Full Stats
            </button>
        </div>
      )}

      {loading ? (
        <>
          <div className="grid grid-2">
            <div className="card dashboard-stat-card skeleton-dashboard-stat-card dashboard-live-label-skeleton-card" style={{ position: 'relative' }}>
              <InfoTooltip text="Your estimated playing ability based on recent rounds. Lower is better." />
              <h3>Handicap</h3>
              <div className="skeleton skeleton-dashboard-stat-value dashboard-live-label-skeleton-value" />
            </div>
            {[
              ['Average', 'Your typical score per round. Lower is better.', true],
              ['Best', 'Your lowest recorded round.', true],
              ['Worst', 'Your highest recorded round.', true],
              ['Rounds', 'Total number of rounds tracked.', false],
              ['Par 3', 'Your average score on par 3 holes. Lower is better.', false],
              ['Par 4', 'Your average score on par 4 holes. Lower is better.', false],
              ['Par 5', 'Your average score on par 5 holes. Lower is better.', false],
            ].map(([label, tooltip, isToggleable]) => (
              <div
                className="card dashboard-stat-card skeleton-dashboard-stat-card dashboard-live-label-skeleton-card"
                key={`dash-stat-skeleton-${label as string}`}
                style={{
                  position: 'relative',
                  cursor: isToggleable ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                }}
              >
                {isToggleable && (
                  <span className="toggle-icon icon-edge">
                    {showToPar ? <ToggleRight /> : <ToggleLeft />}
                  </span>
                )}
                {tooltip && <InfoTooltip text={tooltip as string} />}
                <h3>{label}</h3>
                <div className="skeleton skeleton-dashboard-stat-value dashboard-live-label-skeleton-value" />
              </div>
            ))}
          </div>
          <div className="trend-card" style={{ height: 300 }}>
            <h3 className="insights-centered-title">Score Trend</h3>
            <div className="skeleton skeleton-chart-area" />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-2">
            <div className="card dashboard-stat-card" style={{ position: 'relative' }}>
              <InfoTooltip text="Your estimated playing ability based on recent rounds. Lower is better." />
              <h3>Handicap</h3>
              <p>{formatHandicap(stats.handicap)}</p>
            </div>
            {[
              ['Average', showToPar ? stats.average_to_par : stats.average_score, 'Your typical score per round. Lower is better.', true],
              ['Best', showToPar ? stats.best_to_par : stats.best_score, 'Your lowest recorded round.', true],
              ['Worst', showToPar ? stats.worst_to_par : stats.worst_score, 'Your highest recorded round.', true],
              ['Rounds', totalRounds, 'Total number of rounds tracked.', false],
              ['Par 3', par3_avg, 'Your average score on par 3 holes. Lower is better.', false],
              ['Par 4', par4_avg, 'Your average score on par 4 holes. Lower is better.', false],
              ['Par 5', par5_avg, 'Your average score on par 5 holes. Lower is better.', false],
            ].map(([label, val, tooltip, isToggleable]) => (
              <div
                className="card dashboard-stat-card"
                key={label as string}
                style={{
                  position: 'relative',
                  cursor: isToggleable ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => isToggleable && setShowToPar((p) => !p)}
              >
                {isToggleable && (
                <span className="toggle-icon icon-edge">
                  {showToPar ? <ToggleRight /> : <ToggleLeft />}
                </span>
                )}
                {tooltip && <InfoTooltip text={tooltip as string} />}
                <h3>{label}</h3>
                <p>{(isToggleable && showToPar) ? formatToPar(val as number) : formatNumber(val as number)}</p>
              </div>
            ))}
          </div>
          <TrendCard
              trendData={scoreChartData}
              accentColor={accentColor}
              surfaceColor={surfaceColor}
              textColor={textColor}
              gridColor={gridColor}
              height={300}
              label='Score Trend'
            />
        </>
      )}
      <div className="section">
        <div className="card last-five-rounds-card">
          <h3>Last 5 Rounds</h3>
        </div>
        {loading ? (
          <RoundListSkeleton count={5} metricCount={8} showHolesTag={false} />
        ) : lastRounds.length === 0 ? (
          <p className='secondary-text text-center'>No rounds logged.</p>
        ) : (
          <div className="rounds-list">
            {lastRounds.map((round) => (
              <RoundCard
                key={round.id}
                round={round}
                disableClick={!isOwnDashboard}
              />
            ))}
          </div>
        )}
      </div>

      {!loading && (
        <div className="section">
          <div className="card last-five-rounds-card">
            <h3>Performance Overview</h3>
          </div>

          <div className="card scoring-profile-card" ref={scoringProfileCardRef}>
            <h3>Scoring Profile</h3>
            {hasScoringProfileData ? (
              <div className="scoring-profile-body" aria-label="Scoring profile chart and legend">
                <div
                  className="scoring-profile-donut"
                  aria-label={`Scoring profile donut chart. ${scoringProfileAriaSummary}.`}
                  tabIndex={0}
                  onMouseLeave={() => setScoringProfileHoveredIndex(null)}
                >
                  <Doughnut data={scoringProfileChartData as any} options={scoringProfileChartOptions as any} />
                  {scoringProfileActiveItem && (
                    <div className="scoring-profile-center-details" aria-live="polite">
                      <span className="scoring-profile-center-label">{scoringProfileActiveItem.label}</span>
                      <span className="scoring-profile-center-percent">
                        {scoringProfilePercentText(scoringProfileActiveItem.percentage)}
                      </span>
                      <span className="scoring-profile-center-average">
                        {scoringProfileAveragePerRoundText(scoringProfileActiveItem.averagePerRound)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="scoring-profile-legend" role="list" aria-label="Scoring profile categories">
                  {scoringProfileItems.map((item, index) => (
                    <button
                      type="button"
                      key={item.key}
                      className={`scoring-profile-legend-row ${
                        scoringProfileActiveIndex === index ? 'is-active' : ''
                      }`}
                      onClick={() => setScoringProfileSelectedIndex(index)}
                      onMouseEnter={() => setScoringProfileHoveredIndex(index)}
                      onMouseLeave={() => setScoringProfileHoveredIndex(null)}
                      onFocus={() => setScoringProfileSelectedIndex(index)}
                      role="listitem"
                      aria-label={`${item.label}: ${formatWholePercent(item.percentage)}`}
                    >
                      <div className="scoring-profile-legend-label-wrap">
                        <span
                          className="scoring-profile-legend-dot"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <span>{item.label}</span>
                      </div>
                      <span className="scoring-profile-legend-value">{formatWholePercent(item.percentage)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="secondary-text text-center">No hole-by-hole scoring data yet.</p>
            )}
          </div>

          <div className="grid grid-2">
            {[
              ['FIR', stats.fir_avg, '%', 'How often you hit the fairway off the tee. Higher is better.'],
              ['GIR', stats.gir_avg, '%', 'How often you reach the green in regulation. Higher is better.'],
              ['Putts', stats.avg_putts, null, 'Average number of putts per round. Lower is better.'],
              ['Penalties', stats.avg_penalties, null, 'Average penalty strokes per round. Lower is better.'],
            ].map(([label, val, isPercent, tooltip]) => (
              <div className="card dashboard-stat-card" key={label as string} style={{ position: 'relative' }}>
                {tooltip && <InfoTooltip text={tooltip as string} />}
                <h3>{label}</h3>
                <p>{isPercent ? formatWholePercent(val as number | null) : formatNumber(val as number)}</p>
              </div>
            ))}
          </div>

          <TrendCard
            trendData={firGirData}
            accentColor={accentColor}
            surfaceColor={surfaceColor}
            textColor={textColor}
            gridColor={gridColor}
            height={300}
            yMin={0}      // start at 0%
            yMax={100}    // end at 100%
            yStep={25}
            label='FIR & GIR Trend'
          />
          <MissTendenciesChart
            data={stats.miss_tendencies ?? null}
            accentColor={accentColor}
            accentHighlight={accentHighlight}
            surfaceColor={surfaceColor}
            textColor={textColor}
            gridColor={gridColor}
          />
        </div>
      )}

      {/* Round 3 unlock modal */}
      <UpgradeModal
        isOpen={!loading && activeMilestoneModal === 'welcome' && status === 'authenticated'}
        onClose={handleCloseMilestoneModal}
        title="Welcome to GolfIQ"
        titleBadge="Beta"
        message="GolfIQ is currently in beta and focused on helping golfers understand where they are losing strokes."
        ctaLocation="dashboard_zero_rounds_beta_modal"
        milestoneRound={0}
        analyticsMode="none"
        primaryButtonLabel="Got It"
        showCloseButton={false}
        features={[
          'Insights and features are actively being refined based on real rounds.',
          'If anything feels off or confusing, submit feedback or report a bug from the Settings page.',
        ]}
      />

      <UpgradeModal
        isOpen={!loading && activeMilestoneModal === 'unlock' && status === 'authenticated'}
        onClose={handleCloseMilestoneModal}
        title="Handicap & SG Unlocked"
        message="You have logged 3 rounds. Handicap and Strokes Gained are now available as you keep tracking."
        ctaLocation="dashboard_round_three_unlock_modal"
        milestoneRound={totalRoundsForModal}
        analyticsMode="none"
        primaryButtonLabel="View Insights"
        secondaryButtonLabel="Got It"
        onPrimaryAction={() => router.push('/insights')}
        features={[
          'Handicap now updates as new rounds are logged',
          'Strokes Gained unlocks when round stats are tracked',
        ]}
      />

      {/* Premium upsell milestone modal - 5 rounds, then every 5 after */}
      <UpgradeModal
        isOpen={!loading && activeMilestoneModal === 'upgrade' && status === 'authenticated'}
        onClose={handleCloseMilestoneModal}
        title="Unlock Premium Insights"
        message={getUpgradeModalMessage()}
        ctaLocation="dashboard_round_milestone_modal"
        paywallContext="round_milestone_modal"
        milestoneRound={totalRoundsForModal}
        features={[
          'All-time stat access beyond your last 20 rounds',
          'Estimated strokes gained & core performance KPIs',
          'Trend charts across your last 20 rounds (vs 5 on Free)',
          'Intelligent Insights and personalized recommendations',
          'Flexible date-based comparisons',
          'Premium themes'
        ]}
      />
    </div>
  );
}

export default function DashboardPage({ userId }: { userId?: number }) {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent userId={userId} />
    </Suspense>
  );
}
