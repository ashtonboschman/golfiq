'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMessage } from '../providers';
import { useSubscription } from '@/hooks/useSubscription';
import RoundCard from '@/components/RoundCard';
import UpgradeModal from '@/components/UpgradeModal';
import { Plus, TriangleAlert, ToggleLeft, ToggleRight } from 'lucide-react';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';
import TrendCard from '@/components/TrendCard';
import InfoTooltip from '@/components/InfoTooltip';
import { formatDate, formatHandicap, formatNumber, formatPercent, formatToPar } from '@/lib/formatters';
import { RoundListSkeleton } from '@/components/skeleton/PageSkeletons';


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
  isPremium?: boolean;
  limitedToLast20?: boolean;
  totalRoundsInDb?: number;
  user?: {
    first_name?: string | null;
    last_name?: string | null;
  };
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
        <RoundListSkeleton count={5} metricCount={4} showHolesTag={false} />
      </div>

      <button className="btn btn-toggle" disabled>
        Show Advanced Stats
      </button>
    </div>
  );
}

function DashboardContent({ userId: propUserId }: { userId?: number }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { showMessage, clearMessage } = useMessage();
  const searchParams = useSearchParams();

  const queryUserId = searchParams.get('user_id');
  const requestedUserId =
    propUserId || (queryUserId ? parseInt(queryUserId, 10) : null) || session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [statsMode, setStatsMode] = useState('combined');
  const [dateFilter, setDateFilter] = useState('all');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showToPar, setShowToPar] = useState(false);
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const [accentColor, setAccentColor] = useState('#2D6CFF');
  const [accentHighlight, setAccentHighlight] = useState('#36ad64');
  const [textColor, setTextColor] = useState('#EDEFF2');
  const [secondaryTextColor, setSecondaryTextColor] = useState('#9AA3B2');
  const [gridColor, setGridColor] = useState('#2A313D');
  const [surfaceColor, setSurfaceColor] = useState('#171C26');
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
  });

  // Load theme colors from CSS variables
  useEffect(() => {
    const updateThemeColors = () => {
      const rootStyles = getComputedStyle(document.documentElement);
      const accent = rootStyles.getPropertyValue('--color-accent').trim() || '#2D6CFF';
      const highlight = rootStyles.getPropertyValue('--color-accent-highlight').trim() || '#36ad64';
      const text = rootStyles.getPropertyValue('--color-primary-text').trim() || '#EDEFF2';
      const secondaryText = rootStyles.getPropertyValue('--color-secondary-text').trim() || '#9AA3B2';
      const grid = rootStyles.getPropertyValue('--color-border').trim() || '#2A313D';
      const surface = rootStyles.getPropertyValue('--color-primary-surface').trim() || '#171C26';

      setAccentColor(accent);
      setAccentHighlight(highlight);
      setTextColor(text);
      setSecondaryTextColor(secondaryText);
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

    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      clearMessage();

      try {
        const res = await fetch(
          `/api/dashboard?statsMode=${statsMode}&user_id=${requestedUserId}&dateFilter=${dateFilter}`
        );

        if (res.status === 403) {
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
          });
          return;
        }

        if (res.status === 401) {
          router.replace('/login');
          return;
        }

        const data = await res.json();

        if (data.type === 'error') {
          console.error('Dashboard API error:', data.message);
          showMessage(data.message || 'Error fetching dashboard stats', 'error');
          setError(data.message || 'Error fetching dashboard stats');
        } else {
          setStats(data);
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        showMessage('Failed to load dashboard. Check console.', 'error');
        setError('Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [status, statsMode, dateFilter, requestedUserId, router, showMessage, clearMessage]);

  const isOwnDashboard = parseInt(requestedUserId?.toString() || '0') === parseInt(session?.user?.id || '0');

  // Show upgrade modal at strategic milestones for free users (only for own dashboard)
  // First at 3 rounds, then at 10, then every 5 rounds (10, 15, 20, 25...)
  // Use totalRoundsInDb (unfiltered count) to ensure modal shows regardless of stats mode filter
  const totalRoundsForModal = stats.totalRoundsInDb ?? stats.total_rounds;
  useEffect(() => {
    // Wait for both dashboard data and subscription data to load before showing modal
    // Also ensure user is still authenticated (prevents flash on logout)
    if (!loading && !subscriptionLoading && status === 'authenticated' && isOwnDashboard && !isPremium && totalRoundsForModal >= 3) {
      const hasShownAtCurrentRound = sessionStorage.getItem(`upgrade-modal-shown-${totalRoundsForModal}`) === 'true';

      // Show at round 3, 10, 15, 20, 25, etc.
      // Calculate if we're at a milestone (3, 10, 15, 20, 25...)
      const milestones = [3];
      for (let i = 10; i <= totalRoundsForModal; i += 5) {
        milestones.push(i);
      }

      // Show if:
      // 1. We're at a milestone AND
      // 2. Haven't shown the modal during this session for this exact round count
      const shouldShow = milestones.includes(totalRoundsForModal) && !hasShownAtCurrentRound;

      if (shouldShow) {
        setShowUpgradeModal(true);
      }
    } else if (status !== 'authenticated') {
      // Immediately hide modal if user logs out
      setShowUpgradeModal(false);
    }
  }, [loading, subscriptionLoading, status, isOwnDashboard, isPremium, totalRoundsForModal]);

  const handleCloseUpgradeModal = () => {
    setShowUpgradeModal(false);
    // Mark that we've shown the modal for this round count in this session
    sessionStorage.setItem(`upgrade-modal-shown-${totalRoundsForModal}`, 'true');
  };

  if (error && !loading) return <p className="error-text">{error}</p>;

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

  const hbhCount = stats.hbh_stats?.hbh_rounds_count ?? 0;
  const sb = stats.hbh_stats?.scoring_breakdown;

  const scoringPerRound =
    sb && hbhCount
      ? ((sb.ace ?? 0) + (sb.albatross ?? 0) + (sb.eagle ?? 0) + (sb.birdie ?? 0)) / hbhCount
      : null;
  const parPerRound = sb && hbhCount ? (sb.par ?? 0) / hbhCount : null;
  const bogeyPerRound = sb && hbhCount ? (sb.bogey ?? 0) / hbhCount : null;
  const blowUpPerRound = sb && hbhCount ? (sb.double_plus ?? 0) / hbhCount : null;

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
          backgroundColor: `${accentColor}22`, // semi-transparent fill
          fill: true,
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
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: accentHighlight,
          pointHoverRadius: 7,
          spanGaps: true,
        },
      ],
    };

  const scoreValues = trendData
    .map(d => showToPar ? d.to_par : d.score)
    .filter((v): v is number => v != null);

  const yMin = scoreValues.length
    ? Math.floor(Math.min(...scoreValues) / 5) * 5
    : undefined;

  const yMax = scoreValues.length
    ? Math.ceil(Math.max(...scoreValues) / 5) * 5
    : undefined;

  // Dynamic modal messaging based on round count (use unfiltered count)
  const getModalMessage = () => {
    const rounds = totalRoundsForModal;
    if (rounds === 3) {
      return "You've logged 3 rounds! Upgrade to Premium to unlock Intelligent Insights and advanced trends.";
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
          onChange={(option) => option && setStatsMode(option.value)}
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
              onClick={() => router.push('/pricing')}
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
              <InfoTooltip text="GolfIQ Handicap Index (WHS-based)" />
              <h3>Handicap</h3>
              <div className="skeleton skeleton-dashboard-stat-value dashboard-live-label-skeleton-value" />
            </div>
            {[
              ['Average', showToPar ? 'Average score relative to par' : 'Average score', true],
              ['Best', showToPar ? 'Best score relative to par' : 'Best score', true],
              ['Worst', showToPar ? 'Worst score relative to par' : 'Worst score', true],
              ['Total', 'Total amount of rounds played', false],
              ['Par 3', 'Average score on par 3 holes', false],
              ['Par 4', 'Average score on par 4 holes', false],
              ['Par 5', 'Average score on par 5 holes', false],
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
              <InfoTooltip text="GolfIQ Handicap Index (WHS-based)" />
              <h3>Handicap</h3>
              <p>{formatHandicap(stats.handicap)}</p>
            </div>
            {[
              ['Average', showToPar ? stats.average_to_par : stats.average_score, showToPar ? 'Average score relative to par' : 'Average score', true],
              ['Best', showToPar ? stats.best_to_par : stats.best_score, showToPar ? 'Best score relative to par' : 'Best score', true],
              ['Worst', showToPar ? stats.worst_to_par : stats.worst_score, showToPar ? 'Worst score relative to par' : 'Worst score', true],
              ['Total', totalRounds, 'Total amount of rounds played', false],
              ['Par 3', par3_avg, 'Average score on par 3 holes', false],
              ['Par 4', par4_avg, 'Average score on par 4 holes', false],
              ['Par 5', par5_avg, 'Average score on par 5 holes', false],
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
          <RoundListSkeleton count={5} metricCount={4} showHolesTag={false} />
        ) : lastRounds.length === 0 ? (
          <p className='secondary-text'>No rounds recorded.</p>
        ) : (
          <div className="rounds-list">
            {lastRounds.map((round) => (
              <RoundCard
                key={round.id}
                round={round}
                disableClick={!isOwnDashboard}
                showAdvanced={showAdvanced}
              />
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-toggle" onClick={() => setShowAdvanced((p) => !p)} disabled={loading}>
        {showAdvanced ? 'Hide Advanced Stats' : 'Show Advanced Stats'}
      </button>

      {!loading && showAdvanced && (
        <div className="grid grid-2">
          {[
            ['FIR', stats.fir_avg, '%', 'Average fairways in regulation % per round'],
            ['GIR', stats.gir_avg, '%', 'Average greens in regulation % per round'],
            ['Putts', stats.avg_putts, null, 'Average putts per round'],
            ['Penalties', stats.avg_penalties, null, 'Average penalty strokes per round'],
            ['Scoring', scoringPerRound, null, 'Average birdies or better per round'],
            ['Par', parPerRound, null, 'Average pars per round'],
            ['Bogey', bogeyPerRound, null, 'Average bogeys per round'],
            ['Blow Up', blowUpPerRound, null, 'Average double bogeys or worse per round'],
          ].map(([label, val, isPercent, tooltip]) => (
            <div className="card dashboard-stat-card" key={label as string} style={{ position: 'relative' }}>
              {tooltip && <InfoTooltip text={tooltip as string} />}
              <h3>{label}</h3>
              <p>{isPercent ? formatWholePercent(val as number | null) : formatNumber(val as number)}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && showAdvanced && (
        <TrendCard
          trendData={firGirData}
          accentColor={accentColor}    
          surfaceColor={surfaceColor}  
          textColor={textColor}        
          gridColor={gridColor}        
          height={250}
          yMin={0}      // start at 0%
          yMax={100}    // end at 100%
          yStep={25}
          label='FIR & GIR Trend'
        />
      )}

      {/* Upgrade modal - shows at 3 rounds, then every 5 rounds */}
      <UpgradeModal
        isOpen={!loading && showUpgradeModal && status === 'authenticated'}
        onClose={handleCloseUpgradeModal}
        title="Unlock Premium Insights"
        message={getModalMessage()}
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


