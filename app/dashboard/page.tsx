'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMessage } from '../providers';
import { useSubscription } from '@/hooks/useSubscription';
import RoundCard from '@/components/RoundCard';
import InlineAdBanner from '@/components/InlineAdBanner';
import UpgradeModal from '@/components/UpgradeModal';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Info, Plus, TriangleAlert } from 'lucide-react';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';

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
}

// Info tooltip component
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'center' | 'left' | 'right'>('center');

  useEffect(() => {
    if (show && tooltipRef.current) {
      // Small delay to ensure DOM is updated
      const timer = setTimeout(() => {
        if (tooltipRef.current) {
          const rect = tooltipRef.current.getBoundingClientRect();
          const viewportWidth = window.innerWidth;

          // Check if tooltip goes off right side
          if (rect.right > viewportWidth - 10) {
            setPosition('right');
          }
          // Check if tooltip goes off left side
          else if (rect.left < 10) {
            setPosition('left');
          }
          else {
            setPosition('center');
          }
        }
      }, 10);

      return () => clearTimeout(timer);
    } else {
      // Reset position when tooltip is hidden
      setPosition('center');
    }
  }, [show]);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    };

    if (show) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [show]);

  return (
    <div ref={containerRef} className="info-tooltip-container">
      <span
        onClick={(e) => {
          e.stopPropagation();
          setShow(!show);
        }}
        className="info-tooltip-icon"
      >
        <Info/>
      </span>
      {show && (
        <div
          ref={tooltipRef}
          className={`info-tooltip-content ${position}`}
        >
          {text}
          <div className={`info-tooltip-arrow ${position}`} />
        </div>
      )}
    </div>
  );
}

export default function DashboardPage({ userId: propUserId }: { userId?: number }) {
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
  // First at 3 rounds, then every 5 rounds (8, 13, 18, 23...)
  useEffect(() => {
    // Wait for both dashboard data and subscription data to load before showing modal
    if (!loading && !subscriptionLoading && isOwnDashboard && !isPremium && stats.total_rounds >= 3) {
      const lastShownRound = parseInt(localStorage.getItem('upgrade-modal-last-shown-round') || '0');

      // Show at round 3 (first time)
      const isFirstShow = stats.total_rounds === 3 && lastShownRound === 0;

      // Show every 5 rounds after first show (8, 13, 18, 23...)
      const isSubsequentShow = lastShownRound > 0 &&
                                stats.total_rounds >= lastShownRound + 5 &&
                                (stats.total_rounds - 3) % 5 === 0;

      if (isFirstShow || isSubsequentShow) {
        setShowUpgradeModal(true);
      }
    }
  }, [loading, subscriptionLoading, isOwnDashboard, isPremium, stats.total_rounds]);

  const handleCloseUpgradeModal = () => {
    setShowUpgradeModal(false);
    // Track which round we showed the modal at
    localStorage.setItem('upgrade-modal-last-shown-round', stats.total_rounds.toString());
  };

  if (loading) return <p className="loading-text">Loading dashboard...</p>;
  if (error) return <p className="error-text">{error}</p>;

  // Formatters
  const formatNumber = (num: number | null | undefined) =>
    num == null || isNaN(num) ? '-' : num % 1 === 0 ? num : num.toFixed(1);
  const formatToPar = (num: number | null | undefined) => {
    if (num == null || isNaN(num)) return '-';
    const formatted = num % 1 === 0 ? num.toString() : num.toFixed(1);
    return num > 0 ? `+${formatted}` : formatted;
  };
  const formatPercent = (num: number | null | undefined) =>
    num == null || isNaN(num) ? '-' : `${num.toFixed(1)}%`;
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';

    // Parse date string to avoid timezone conversion issues
    const datePart = dateStr.split('T')[0]; // "YYYY-MM-DD"
    const [year, month, day] = datePart.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };
  const formatHandicap = (num: number | null) => {
    if (num == null || isNaN(num)) return '-';
    if (num < 0) return `+${Math.abs(num)}`;
    return num % 1 === 0 ? num : num.toFixed(1);
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

  const hbhCount = stats.hbh_stats?.hbh_rounds_count ?? 0;
  const sb = stats.hbh_stats?.scoring_breakdown;

  const birdiesOrBetterPerRound =
    sb && hbhCount
      ? ((sb.ace ?? 0) + (sb.albatross ?? 0) + (sb.eagle ?? 0) + (sb.birdie ?? 0)) / hbhCount
      : null;
  const parPerRound = sb && hbhCount ? (sb.par ?? 0) / hbhCount : null;
  const bogeysPerRound = sb && hbhCount ? (sb.bogey ?? 0) / hbhCount : null;
  const doublesOrWorsePerRound = sb && hbhCount ? (sb.double_plus ?? 0) / hbhCount : null;

  // Premium users get 20 rounds for trend charts, free users get 5
  const trendRoundsCount = isPremium ? 20 : 5;
  const trendRounds = sortedRounds.slice(0, trendRoundsCount);

  const trendData = [...trendRounds]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((r, index) => ({
      id: r.id, // Use the round ID as unique identifier
      date: r.date,
      dateLabel: formatDate(r.date), // Pre-format the date for display
      uniqueKey: `${r.date}-${index}`, // Unique key for React/Recharts using datetime + index
      score: r.score,
      fir_pct:
        r.fir_hit != null && r.fir_total != null ? (r.fir_hit / r.fir_total) * 100 : null,
      gir_pct:
        r.gir_hit != null && r.gir_total != null ? (r.gir_hit / r.gir_total) * 100 : null,
    }));

  const scores = trendData.map((d) => d.score).filter((v): v is number => v != null);
  const yMin = scores.length ? Math.floor(Math.min(...scores) / 10) * 10 : 0;
  const yMax = scores.length ? Math.ceil(Math.max(...scores) / 10) * 10 : 100;

  // Dynamic modal messaging based on round count
  const getModalMessage = () => {
    const rounds = stats.total_rounds;
    if (rounds === 3) {
      return "You've logged 3 rounds! Upgrade to Premium to unlock Insights, unlimited analytics, and an ad-free experience.";
    } else if (rounds >= 13) {
      return `You've logged ${rounds} rounds! You're experiencing the 20-round analytics limit. Upgrade to Premium for unlimited history and Insights.`;
    } else {
      return `You've logged ${rounds} rounds and you're building great habits! Upgrade to Premium for unlimited analytics, Insights, and ad-free tracking.`;
    }
  };

  return (
    <div className="page-stack">
      {isOwnDashboard && (
        <button
          className="btn btn-add"
          onClick={() => router.push('/rounds/add')}
        >
          <Plus/> Add Round
        </button>
      )}

      <div className="dashboard-filters">
        <Select
          value={{ value: statsMode, label: statsMode === 'combined' ? 'Combined (9 & 18)' : statsMode === '9' ? '9-Hole Only' : '18-Hole Only' }}
          onChange={(option) => option && setStatsMode(option.value)}
          options={[
            { value: 'combined', label: 'Combined (9 & 18)' },
            { value: '9', label: '9-Hole Only' },
            { value: '18', label: '18-Hole Only' },
          ]}
          isSearchable={false}
          styles={selectStyles}
        />
        <Select
          value={{
            value: dateFilter,
            label:
              dateFilter === 'all'
                ? `All Time ${!subscriptionLoading && !isPremium ? '🔒' : ''}`
                : dateFilter === '30'
                ? `Last 30 Days ${!subscriptionLoading && !isPremium ? '🔒' : ''}`
                : dateFilter === '90'
                ? `Last 90 Days ${!subscriptionLoading && !isPremium ? '🔒' : ''}`
                : `Last Year ${!subscriptionLoading && !isPremium ? '🔒' : ''}`,
          }}
          onChange={(option) => {
            if (!subscriptionLoading && !isPremium) {
              router.push('/pricing'); // redirect free users
            } else if (option) {
              setDateFilter(option.value);
            }
          }}
          options={[
            { value: 'all', label: `All Time ${!subscriptionLoading && !isPremium ? '🔒' : ''}` },
            { value: '30', label: `Last 30 Days ${!subscriptionLoading && !isPremium ? '🔒' : ''}` },
            { value: '90', label: `Last 90 Days ${!subscriptionLoading && !isPremium ? '🔒' : ''}` },
            { value: '365', label: `Last Year ${!subscriptionLoading && !isPremium ? '🔒' : ''}` },
          ]}
          isSearchable={false}
          isDisabled={subscriptionLoading} // only disable while loading
          styles={selectStyles}
          className={
            !subscriptionLoading && !isPremium
              ? 'dashboard-date-filter locked'
              : 'dashboard-date-filter'
          }
        />
      </div>
      {statsMode === 'combined' && (
        <p className="combined-note">9-hole rounds are doubled to approximate 18-hole stats.</p>
      )}

      {/* Premium upgrade CTA for limited users */}
      {stats.limitedToLast20 && stats.totalRoundsInDb && stats.totalRoundsInDb > 20 && (
        <div className="info-banner warning">
          <div className="info-banner-content">
            <div className="info-banner-icon"><TriangleAlert size='45'/></div>
            <div className="info-banner-text">
              <h4>Viewing Limited Stats</h4>
              <p>
                You have {stats.totalRoundsInDb} rounds, but stats are calculated from your most recent 20 rounds only. Upgrade to Premium to unlock unlimited analytics history.
              </p>
            </div>
            
          </div>
          <button
              type="button"
              onClick={() => router.push('/pricing')}
              className="btn"
            >
              Upgrade
            </button>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card dashboard-stat-card" style={{ position: 'relative' }}>
          <InfoTooltip text="Official USGA handicap index based on your best 8 of last 20 rounds" />
          <h3>Handicap</h3>
          <p>{formatHandicap(stats.handicap)}</p>
        </div>
        {[
          ['Average', showToPar ? stats.average_to_par : stats.average_score, showToPar ? 'Average score relative to par (negative is better)' : null, true],
          ['Best', showToPar ? stats.best_to_par : stats.best_score, showToPar ? 'Best score relative to par (negative is better)' : null, true],
          ['Worst', showToPar ? stats.worst_to_par : stats.worst_score, showToPar ? 'Worst score relative to par (positive is worse)' : null, true],
          ['Total Rounds', totalRounds, null, false],
          ['Par 3 Average', par3_avg, 'Average score on par 3 holes', false],
          ['Par 4 Average', par4_avg, 'Average score on par 4 holes', false],
          ['Par 5 Average', par5_avg, 'Average score on par 5 holes', false],
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
            onMouseEnter={(e) => {
              if (isToggleable) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (isToggleable) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '';
              }
            }}
          >
            {tooltip && <InfoTooltip text={tooltip as string} />}
            <h3>{label}</h3>
            <p>{(isToggleable && showToPar) ? formatToPar(val as number) : formatNumber(val as number)}</p>
          </div>
        ))}
      </div>

      {/* Ad after main stats grid */}
      <InlineAdBanner adSlot="DASHBOARD_SLOT_ID" />

      <div className="card trend-card">
        <h3>Score Trend</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="dateLabel"
              interval={0}
              angle={-45}
              textAnchor="end"
              height={60}
              tick={{ fontSize: 11, fill: secondaryTextColor }}
              stroke={gridColor}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: secondaryTextColor }}
              stroke={gridColor}
            />
            <Tooltip
              formatter={(v) => formatNumber(v as number)}
              cursor={{ strokeDasharray: '3 3', stroke: accentColor }}
              contentStyle={{
                backgroundColor: surfaceColor,
                border: `1px solid ${gridColor}`,
                borderRadius: '4px',
                color: textColor,
              }}
              labelStyle={{ color: textColor }}
            />
            <Legend
              wrapperStyle={{ color: textColor }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="score"
              name="Score"
              stroke={accentColor}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2, fill: accentColor, stroke: accentColor }}
              activeDot={{ r: 5, strokeWidth: 2, fill: accentColor, stroke: accentColor }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="section">
        <div className="card last-five-rounds-card">
          <h3>Last 5 Rounds</h3>
        </div>
        {lastRounds.length === 0 ? (
          <p className='secondary-text'>No rounds recorded.</p>
        ) : (
          <div className="rounds-list">
            {lastRounds.map((round) => (
              <RoundCard
                key={round.id}
                round={round}
                showAdvanced={showAdvanced}
                showActions={false}
              />
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-toggle" onClick={() => setShowAdvanced((p) => !p)}>
        {showAdvanced ? 'Hide Advanced Stats' : 'Show Advanced Stats'}
      </button>

      {showAdvanced && (
        <div className="grid grid-2">
          {[
            ['FIR', stats.fir_avg, '%', 'Fairways In Regulation - % of fairways hit off the tee'],
            ['GIR', stats.gir_avg, '%', 'Greens In Regulation - % of greens reached in regulation'],
            ['Putts', stats.avg_putts, null, 'Average putts per round'],
            ['Penalties', stats.avg_penalties, null, 'Average penalty strokes per round'],
            ['Birdies <', birdiesOrBetterPerRound, null, 'Average birdies or better per round'],
            ['Pars', parPerRound, null, 'Average pars per round'],
            ['Bogeys', bogeysPerRound, null, 'Average bogeys per round'],
            ['Doubles +', doublesOrWorsePerRound, null, 'Average double bogeys or worse per round'],
          ].map(([label, val, isPercent, tooltip]) => (
            <div className="card dashboard-stat-card" key={label as string} style={{ position: 'relative' }}>
              {tooltip && <InfoTooltip text={tooltip as string} />}
              <h3>{label}</h3>
              <p>{isPercent ? formatPercent(val as number) : formatNumber(val as number)}</p>
            </div>
          ))}
        </div>
      )}

      {showAdvanced && (
        <div className="card trend-card">
          <h3>FIR / GIR % Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="dateLabel"
                interval={0}
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 11, fill: secondaryTextColor }}
                stroke={gridColor}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: secondaryTextColor }}
                stroke={gridColor}
              />
              <Tooltip
                formatter={(v) => (v != null ? formatPercent(v as number) : '-')}
                cursor={{ strokeDasharray: '3 3', stroke: accentColor }}
                contentStyle={{
                  backgroundColor: surfaceColor,
                  border: `1px solid ${gridColor}`,
                  borderRadius: '4px',
                  color: textColor,
                }}
                labelStyle={{ color: textColor }}
              />
              <Legend
                wrapperStyle={{ color: textColor }}
                iconType="line"
              />
              <Line
                type="monotone"
                dataKey="fir_pct"
                name="FIR %"
                stroke={accentColor}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 2, fill: accentColor, stroke: accentColor }}
                activeDot={{ r: 5, strokeWidth: 2, fill: accentColor, stroke: accentColor }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="gir_pct"
                name="GIR %"
                stroke={accentHighlight}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 2, fill: accentHighlight, stroke: accentHighlight }}
                activeDot={{ r: 5, strokeWidth: 2, fill: accentHighlight, stroke: accentHighlight }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Upgrade modal - shows at 3 rounds, then every 5 rounds */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={handleCloseUpgradeModal}
        title="Unlock Premium Insights"
        message={getModalMessage()}
        features={[
          'Insights with personalized recommendations',
          'Unlimited analytics history',
          '20-round trend analysis (vs 5 for free)',
          'Advanced charts and predictions',
          'Completely ad-free experience',
          'Full global leaderboard access'
        ]}
      />
    </div>
  );
}
