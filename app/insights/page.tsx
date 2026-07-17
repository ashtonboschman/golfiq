'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Select from 'react-select';
import { Lock } from 'lucide-react';
import { selectStyles } from '@/lib/selectStyles';
import { useSubscription } from '@/hooks/useSubscription';
import TrendCard from '@/components/TrendCard';
import InfoTooltip from '@/components/InfoTooltip';
import GameTrendsCard from '@/components/insights/GameTrendsCard';
import { formatHandicap, formatNumber } from '@/lib/formatters';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';
import type { GameTrendsV2Dto } from '@/lib/insights/gameTrends/types';
import { composeScoringOutlookPresentation } from '@/lib/insights/gameTrends/presentation';

const insightsViewedKeys = new Set<string>();
const gameTrendViewedKeys = new Set<string>();
const paywallViewedKeys = new Set<string>();

type StatsMode = 'combined' | '9' | '18';

type TrendSeries = {
  labels: string[];
  score: (number | null)[];
  firPct: (number | null)[];
  girPct: (number | null)[];
  sgTotal?: (number | null)[];
  handicap?: (number | null)[];
};

type ModePayload = {
  kpis: {
    roundsRecent: number;
    avgScoreRecent: number | null;
    avgScoreBaseline: number | null;
    avgToParRecent: number | null;
    avgSgTotalRecent: number | null;
    bestScoreRecent: number | null;
    deltaVsBaseline: number | null;
  };
  consistency?: {
    label: 'stable' | 'variable' | 'moderate' | 'volatile' | 'insufficient';
    stdDev: number | null;
    scoreRange?: number | null;
  };
  efficiency?: {
    fir: EfficiencyMetric;
    gir: EfficiencyMetric;
    shortGameShots?: EfficiencyMetric;
    puttsTotal?: EfficiencyMetric;
    penaltiesPerRound?: EfficiencyMetric;
    puttsPerHole?: EfficiencyMetric;
    penaltiesPerHole?: EfficiencyMetric;
  };
  sgComponents?: {
    recentAvg: {
      total: number | null;
      offTee: number | null;
      approach: number | null;
      shortGame?: number | null;
      putting: number | null;
      penalties: number | null;
      residual: number | null;
    };
    baselineAvg: {
      total: number | null;
      offTee: number | null;
      approach: number | null;
      shortGame?: number | null;
      putting: number | null;
      penalties: number | null;
      residual: number | null;
    };
    recentTrackedCount?: {
      total: number;
      offTee: number;
      approach: number;
      shortGame: number;
      putting: number;
      penalties: number;
      residual: number;
    };
    hasData: boolean;
  };
  trend: TrendSeries;
};

type EfficiencyMetric = {
  recent: number | null;
  baseline: number | null;
  coverageRecent: string;
};

type SGComponentKey = 'offTee' | 'approach' | 'shortGame' | 'putting' | 'penalties';
type DeltaTone = 'up' | 'down' | 'flat' | 'none';
type OverallConfidence = 'low' | 'medium' | 'high';

type OverallInsightsPayload = {
  generated_at: string;
  confidence?: 'high' | 'medium' | 'low' | null;
  cards: string[];
  game_trends: GameTrendsV2Dto;
  cards_locked_count: number;
  projection: {
    trajectory: 'improving' | 'flat' | 'worsening' | 'unknown';
    projectedScoreIn10: number | null;
    handicapCurrent: number | null;
    projectedHandicapIn10: number | null;
  };
  projection_ranges?: {
    scoreLow: number | null;
    scoreHigh: number | null;
    handicapLow: number | null;
    handicapHigh: number | null;
  };
  projection_by_mode?: Record<StatsMode, {
    trajectory: 'improving' | 'flat' | 'worsening' | 'unknown';
    projectedScoreIn10: number | null;
    scoreLow: number | null;
    scoreHigh: number | null;
    handicapCurrent?: number | null;
    projectedHandicapIn10?: number | null;
    handicapLow?: number | null;
    handicapHigh?: number | null;
    roundsUsed: number;
  }>;
  tier_context: {
    isPremium: boolean;
    baseline: 'last20' | 'alltime';
    maxRoundsUsed: number;
    recentWindow: number;
  };
  consistency: {
    label: 'stable' | 'variable' | 'moderate' | 'volatile' | 'insufficient';
    stdDev: number | null;
    scoreRange?: number | null;
  };
  efficiency: {
    fir: EfficiencyMetric;
    gir: EfficiencyMetric;
    shortGameShots?: EfficiencyMetric;
    puttsTotal?: EfficiencyMetric;
    penaltiesPerRound?: EfficiencyMetric;
    // legacy keys for older cached payloads
    puttsPerHole?: EfficiencyMetric;
    penaltiesPerHole?: EfficiencyMetric;
  };
  sg_locked: boolean;
  sg?: {
    trend: {
      labels: string[];
      sgTotal: (number | null)[];
    };
    components: {
      latest: {
        total: number | null;
        offTee: number | null;
        approach: number | null;
        shortGame?: number | null;
        putting: number | null;
        penalties: number | null;
        residual: number | null;
        partialAnalysis: boolean | null;
      };
      recentAvg: {
        total: number | null;
        offTee: number | null;
        approach: number | null;
        shortGame?: number | null;
        putting: number | null;
        penalties: number | null;
        residual: number | null;
      };
      baselineAvg: {
        total: number | null;
        offTee: number | null;
        approach: number | null;
        shortGame?: number | null;
        putting: number | null;
        penalties: number | null;
        residual: number | null;
      };
      recentTrackedCount?: {
        total: number;
        offTee: number;
        approach: number;
        shortGame: number;
        putting: number;
        penalties: number;
        residual: number;
      };
      mostCostlyComponent: 'offTee' | 'approach' | 'shortGame' | 'putting' | 'penalties' | 'residual' | null;
      worstComponentFrequencyRecent: {
        component: 'offTee' | 'approach' | 'shortGame' | 'putting' | 'penalties' | 'residual' | null;
        count: number;
        window: number;
      };
      hasData: boolean;
    };
  };
  mode_payload: Record<StatsMode, ModePayload>;
  handicap_trend: {
    labels: string[];
    handicap: (number | null)[];
  };
};

const DEFAULT_EFFICIENCY_METRIC: EfficiencyMetric = {
  recent: null,
  baseline: null,
  coverageRecent: '0/5',
};

const INSIGHTS_POSITIVE_COLOR = '#16a34a';
const INSIGHTS_NEGATIVE_COLOR = '#ef4444';

function formatSigned(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  const rounded = Math.round(v * 10) / 10;
  if (rounded === 0 || Object.is(rounded, -0)) return '0';
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}

function formatConsistencyLabel(label: OverallInsightsPayload['consistency']['label'] | 'building' | 'unavailable'): string {
  if (label === 'stable') return 'Stable';
  if (label === 'variable') return 'Variable';
  if (label === 'moderate') return 'Moderate';
  if (label === 'volatile') return 'Volatile';
  if (label === 'building') return 'Building';
  return 'Needs more rounds';
}

function formatEffValue(v: number | null, type: 'percent' | 'rate'): string {
  if (v == null || !Number.isFinite(v)) return 'Not shown';
  if (type === 'percent') return `${Math.round(v * 100)}%`;
  return (Math.round(v * 10) / 10).toFixed(1);
}

function formatCardValueOneDecimal(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return (Math.round(v * 10) / 10).toFixed(1);
}

function roundToOneDecimal(v: number): number {
  return Math.round(v * 10) / 10;
}

function getRoundedOneDecimalDelta(recent: number, typical: number): number {
  const delta = roundToOneDecimal(roundToOneDecimal(recent) - roundToOneDecimal(typical));
  return delta === 0 || Object.is(delta, -0) ? 0 : delta;
}

function sgComponentLabel(component: SGComponentKey): string {
  if (component === 'offTee') return 'Off the Tee';
  if (component === 'approach') return 'Approach';
  if (component === 'shortGame') return 'Short Game';
  if (component === 'putting') return 'Putting';
  if (component === 'penalties') return 'Penalties';
  return 'Untracked';
}

function normalizeDelta(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const rounded = Math.round(v * 10) / 10;
  return rounded === 0 || Object.is(rounded, -0) ? 0 : rounded;
}

function clampNumber(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function formatCoverageText(coverageRecent: string): string {
  const match = coverageRecent.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!match) return `Tracked in ${coverageRecent}`;
  return `Tracked in ${match[1]} of last ${match[2]} rounds`;
}

function parseCoverageCounts(coverageRecent: string | null | undefined): { tracked: number; total: number } | null {
  if (!coverageRecent || typeof coverageRecent !== 'string') return null;
  const match = coverageRecent.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!match) return null;
  const tracked = Number.parseInt(match[1] ?? '0', 10);
  const total = Number.parseInt(match[2] ?? '0', 10);
  if (!Number.isFinite(tracked) || !Number.isFinite(total) || total <= 0) return null;
  return { tracked, total };
}

function formatRoundCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'round' : 'rounds'}`;
}

function getMagnitudeWidths(
  recent: number | null,
  typical: number | null,
  contrastPower = 1,
): { recent: number; typical: number; hasData: boolean } {
  if (recent == null || typical == null || !Number.isFinite(recent) || !Number.isFinite(typical)) {
    return { recent: 0, typical: 0, hasData: false };
  }

  const maxV = Math.max(recent, typical);
  if (maxV <= 0) return { recent: 0, typical: 0, hasData: true };

  const minVisible = 8;
  const safePower = Number.isFinite(contrastPower) && contrastPower > 0 ? contrastPower : 1;
  const recentWidth = Math.pow(recent / maxV, safePower) * 100;
  const typicalWidth = Math.pow(typical / maxV, safePower) * 100;

  return {
    recent: recent > 0 ? clampNumber(recentWidth, minVisible, 100) : 0,
    typical: typical > 0 ? clampNumber(typicalWidth, minVisible, 100) : 0,
    hasData: true,
  };
}

function getPercentFixedWidths(
  recent: number | null,
  typical: number | null,
): { recent: number; typical: number; hasData: boolean } {
  if (recent == null || typical == null || !Number.isFinite(recent) || !Number.isFinite(typical)) {
    return { recent: 0, typical: 0, hasData: false };
  }

  return {
    recent: clampNumber(recent * 100, 0, 100),
    typical: clampNumber(typical * 100, 0, 100),
    hasData: true,
  };
}

function getScoringDeltaSummary(recent: number | null, typical: number | null): { text: string; tone: DeltaTone } {
  if (recent == null || typical == null || !Number.isFinite(recent) || !Number.isFinite(typical)) {
    return { text: 'Needs more rounds', tone: 'none' };
  }

  // Keep delta consistent with card values (both shown to 1 decimal place).
  const delta = getRoundedOneDecimalDelta(recent, typical);
  if (delta === 0) return { text: '\u2013 0.0 Strokes', tone: 'flat' };
  if (delta < 0) return { text: `\u25BC ${delta.toFixed(1)} Strokes`, tone: 'up' };
  return { text: `\u25B2 +${delta.toFixed(1)} Strokes`, tone: 'down' };
}
function getPercentDeltaSummary(
  recent: number | null,
  typical: number | null,
  metricLabel: 'FIR' | 'GIR',
): { text: string; tone: DeltaTone } {
  if (recent == null || typical == null || !Number.isFinite(recent) || !Number.isFinite(typical)) {
    return { text: 'Needs more rounds', tone: 'none' };
  }

  // Align delta math with displayed whole-percent values in the cards.
  const recentPct = Math.round(recent * 100);
  const typicalPct = Math.round(typical * 100);
  const deltaPts = recentPct - typicalPct;
  if (deltaPts === 0) return { text: `\u2192 0% ${metricLabel}`, tone: 'flat' };
  if (deltaPts > 0) return { text: `\u25B2 +${deltaPts}% ${metricLabel}`, tone: 'up' };
  return { text: `\u25BC ${deltaPts}% ${metricLabel}`, tone: 'down' };
}
function getLowerBetterRateDeltaSummary(recent: number | null, typical: number | null): { text: string; tone: DeltaTone } {
  if (recent == null || typical == null || !Number.isFinite(recent) || !Number.isFinite(typical)) {
    return { text: 'Needs more rounds', tone: 'none' };
  }

  // Keep delta consistent with card values (both shown to 1 decimal place).
  const delta = getRoundedOneDecimalDelta(recent, typical);
  if (delta === 0) return { text: '\u2192 0.0 Putts', tone: 'flat' };
  if (delta < 0) return { text: `\u25BC ${delta.toFixed(1)} Putts`, tone: 'up' };
  return { text: `\u25B2 +${delta.toFixed(1)} Putts`, tone: 'down' };
}
function getShortGameDeltaSummary(recent: number | null, typical: number | null): { text: string; tone: DeltaTone } {
  if (recent == null || typical == null || !Number.isFinite(recent) || !Number.isFinite(typical)) {
    return { text: 'Needs more rounds', tone: 'none' };
  }

  const delta = getRoundedOneDecimalDelta(recent, typical);
  if (delta === 0) return { text: '\u2192 0.0 Short Game Shots', tone: 'flat' };
  if (delta < 0) return { text: `\u25BC ${delta.toFixed(1)} Short Game Shots`, tone: 'up' };
  return { text: `\u25B2 +${delta.toFixed(1)} Short Game Shots`, tone: 'down' };
}
function getPenaltyRateDeltaSummary(recent: number | null, typical: number | null): { text: string; tone: DeltaTone } {
  if (recent == null || typical == null || !Number.isFinite(recent) || !Number.isFinite(typical)) {
    return { text: 'Needs more rounds', tone: 'none' };
  }

  // Keep delta consistent with card values (both shown to 1 decimal place).
  const delta = getRoundedOneDecimalDelta(recent, typical);
  if (delta === 0) return { text: '\u2192 0.0 Penalties', tone: 'flat' };
  if (delta < 0) return { text: `\u25BC ${delta.toFixed(1)} Penalties`, tone: 'up' };
  return { text: `\u25B2 +${delta.toFixed(1)} Penalties`, tone: 'down' };
}
function getDeltaToneClass(tone: DeltaTone): string {
  if (tone === 'up') return 'is-up';
  if (tone === 'down') return 'is-down';
  return 'is-flat';
}

function deriveOverallConfidence(args: {
  hasInsights: boolean;
  modePayload: ModePayload | undefined;
  roundsRecent: number;
  consistencyLabel: OverallInsightsPayload['consistency']['label'] | 'building' | 'unavailable' | undefined;
}): OverallConfidence {
  if (!args.hasInsights || !args.modePayload) return 'low';
  if (args.roundsRecent <= 1) return 'low';
  if (args.consistencyLabel === 'insufficient' || args.consistencyLabel === 'building' || args.consistencyLabel === 'unavailable') return 'low';
  if (args.roundsRecent >= 5) return 'high';
  return 'medium';
}

function normalizeOverallConfidence(
  raw: OverallInsightsPayload['confidence'] | undefined,
): OverallConfidence | null {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return null;
}

type ComparisonBarCardProps = {
  title: string;
  tooltipText: string;
  recentLabel: string;
  typicalLabel: string;
  recentRawValue: number | null;
  typicalRawValue: number | null;
  betterWhenHigher: boolean;
  recentValueText: string;
  typicalValueText: string;
  recentBarWidth: number;
  typicalBarWidth: number;
  hasData: boolean;
  deltaText: string;
  deltaTone: DeltaTone;
  coverageText?: string;
  accentColor: string;
  accentHighlight: string;
  dangerColor: string;
  showTypical?: boolean;
  showDelta?: boolean;
};

type LockedSectionProps = {
  locked: boolean;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  showCta?: boolean;
  ctaLabel?: string;
  onCtaClick?: () => void;
  className?: string;
};

function ComparisonBarCard({
  title,
  tooltipText,
  recentLabel,
  typicalLabel,
  recentRawValue,
  typicalRawValue,
  betterWhenHigher,
  recentValueText,
  typicalValueText,
  recentBarWidth,
  typicalBarWidth,
  hasData,
  deltaText,
  deltaTone,
  coverageText,
  accentColor,
  accentHighlight,
  dangerColor,
  showTypical = true,
  showDelta = true,
}: ComparisonBarCardProps) {
  const tooltipWithCoverage = coverageText
    ? `${tooltipText}${tooltipText.trim().endsWith('.') ? '' : '.'} ${coverageText}.`
    : tooltipText;
  const hasComparableValues =
    recentRawValue != null &&
    typicalRawValue != null &&
    Number.isFinite(recentRawValue) &&
    Number.isFinite(typicalRawValue);
  const epsilon = 0.0001;
  const recentBetter = hasComparableValues
    ? betterWhenHigher
      ? (recentRawValue as number) > (typicalRawValue as number) + epsilon
      : (recentRawValue as number) < (typicalRawValue as number) - epsilon
    : false;
  const typicalBetter = hasComparableValues
    ? betterWhenHigher
      ? (typicalRawValue as number) > (recentRawValue as number) + epsilon
      : (typicalRawValue as number) < (recentRawValue as number) - epsilon
    : false;
  const recentFillToneClass = recentBetter ? 'is-positive' : typicalBetter ? 'is-negative' : 'is-neutral';
  const typicalFillToneClass = typicalBetter ? 'is-positive' : recentBetter ? 'is-negative' : 'is-neutral';

  return (
    <div className="card dashboard-stat-card comparison-bar-card">
      <div className="comparison-bar-header">
        <h3>{title}</h3>
        <InfoTooltip text={tooltipWithCoverage} />
      </div>

      {!hasData ? (
        <div className="comparison-bar-row">
          <span className="comparison-bar-label">Average</span>
          <div className="comparison-bar-track" />
          <span className="comparison-bar-value">-</span>
        </div>
      ) : (
        <>
          <div className="comparison-bar-row">
            <span className="comparison-bar-label">{recentLabel}</span>
            <div className="comparison-bar-track">
              {recentBarWidth > 0 && (
                <span
                  className={`comparison-bar-fill ${recentFillToneClass} u-w-pct-${Math.max(0, Math.min(100, Math.round(recentBarWidth)))}`}
                />
              )}
            </div>
            <span className="comparison-bar-value">{recentValueText}</span>
          </div>

          {showTypical && (
            <div className="comparison-bar-row">
              <span className="comparison-bar-label">{typicalLabel}</span>
              <div className="comparison-bar-track">
                {typicalBarWidth > 0 && (
                  <span
                    className={`comparison-bar-fill ${typicalFillToneClass} u-w-pct-${Math.max(0, Math.min(100, Math.round(typicalBarWidth)))}`}
                  />
                )}
              </div>
              <span className="comparison-bar-value">{typicalValueText}</span>
            </div>
          )}

          {showDelta && (
            <span
              className={`comparison-bar-delta ${getDeltaToneClass(deltaTone)}`}
            >
              {deltaText}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function LockedSection({
  locked,
  title,
  subtitle,
  children,
  showCta = false,
  ctaLabel = 'Unlock',
  onCtaClick,
  className,
}: LockedSectionProps) {
  if (!locked) return <>{children}</>;

  return (
    <div className={`locked-section${className ? ` ${className}` : ''}`}>
      <div className="locked-blur-content">{children}</div>
      <div className={`locked-overlay${showCta ? ' has-cta' : ''}`}>
        <div className="locked-overlay-card">
          <Lock size={50} className="locked-overlay-icon" />
          {title && <h4>{title}</h4>}
          {subtitle && <p>{subtitle}</p>}
          {showCta && onCtaClick && (
            <button className="btn btn-upgrade" onClick={onCtaClick}>
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InsightsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { isPremium } = useSubscription();

  const [statsMode, setStatsMode] = useState<StatsMode>('combined');
  const insightsRequestIdRef = useRef(0);
  const insightsAbortControllerRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<OverallInsightsPayload | null>(null);

  const [accentColor, setAccentColor] = useState('#2D6CFF');
  const [accentHighlight, setAccentHighlight] = useState('#36ad64');
  const [textColor, setTextColor] = useState('#EDEFF2');
  const [gridColor, setGridColor] = useState('#2A313D');
  const [surfaceColor, setSurfaceColor] = useState('#171C26');

  const trackSgTrendUpgradeCtaClick = useCallback(() => {
    const modePayloadForEvent = insights?.mode_payload?.[statsMode];
    const modeEfficiency = modePayloadForEvent?.efficiency;
    const coverageMetrics = [
      modeEfficiency?.fir,
      modeEfficiency?.gir,
      modeEfficiency?.puttsTotal ?? modeEfficiency?.puttsPerHole,
      modeEfficiency?.penaltiesPerRound ?? modeEfficiency?.penaltiesPerHole,
    ];
    const recentSg = modePayloadForEvent?.sgComponents?.recentAvg;
    const availableComponents = [
      recentSg?.offTee != null ? 'off_tee' : null,
      recentSg?.approach != null ? 'approach' : null,
      recentSg?.shortGame != null ? 'short_game' : null,
      recentSg?.putting != null ? 'putting' : null,
      recentSg?.penalties != null ? 'penalties' : null,
      recentSg?.residual != null ? 'residual' : null,
    ].filter((item): item is string => item != null);
    let trackedSum = 0;
    let totalSum = 0;
    let hasOptionalStats = false;
    for (const metric of coverageMetrics) {
      const parsed = parseCoverageCounts(metric?.coverageRecent);
      if (!parsed) continue;
      trackedSum += parsed.tracked;
      totalSum += parsed.total;
      if (parsed.tracked > 0) hasOptionalStats = true;
    }
    const statCompletenessScore = totalSum > 0 ? Math.round((trackedSum / totalSum) * 100) / 100 : null;
    captureClientEvent(
      ANALYTICS_EVENTS.upgradeCtaClicked,
      {
        cta_location: 'insights_sg_trend_lock',
        source_page: 'insights',
        surface: 'overall_insights',
        mode: statsMode,
        sample_size: modePayloadForEvent?.kpis?.roundsRecent ?? null,
        rounds_lifetime: insights?.tier_context?.maxRoundsUsed ?? null,
        is_premium: insights?.tier_context?.isPremium ?? isPremium,
        confidence: normalizeOverallConfidence(insights?.confidence),
        selected_window: insights?.tier_context?.recentWindow ?? null,
        stat_completeness_score: statCompletenessScore,
        available_components: availableComponents,
        locked_cards_count: insights?.cards_locked_count ?? null,
        visible_cards_count: Array.isArray(insights?.cards) ? insights.cards.length : 0,
        has_hbh: null,
        has_optional_stats: hasOptionalStats,
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
  }, [insights, isPremium, pathname, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, statsMode, status]);

  useEffect(() => {
    const updateThemeColors = () => {
      const rootStyles = getComputedStyle(document.documentElement);
      const accent = rootStyles.getPropertyValue('--color-accent').trim() || '#2D6CFF';
      const highlight = rootStyles.getPropertyValue('--color-accent-highlight').trim() || '#36ad64';
      const text = rootStyles.getPropertyValue('--color-primary-text').trim() || '#EDEFF2';
      const grid = rootStyles.getPropertyValue('--color-border').trim() || '#2A313D';
      const surface = rootStyles.getPropertyValue('--color-primary-surface').trim() || '#171C26';

      setAccentColor(accent);
      setAccentHighlight(highlight);
      setTextColor(text);
      setGridColor(grid);
      setSurfaceColor(surface);
    };

    updateThemeColors();

    const observer = new MutationObserver(updateThemeColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/insights');
    }
  }, [status, router]);

  const fetchInsights = useCallback(async (mode: StatsMode) => {
    insightsAbortControllerRef.current?.abort();
    const controller = new AbortController();
    insightsAbortControllerRef.current = controller;
    const requestId = insightsRequestIdRef.current + 1;
    insightsRequestIdRef.current = requestId;
    const isStaleOrAborted = () =>
      controller.signal.aborted || requestId !== insightsRequestIdRef.current;

    setLoading(true);
    setInsights(null);
    let capturedFailure = false;
    try {
      const res = await fetch(`/api/insights/overall?statsMode=${mode}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (isStaleOrAborted()) return;
      const data = await res.json();
      if (isStaleOrAborted()) return;
      if (!res.ok) {
        if (isStaleOrAborted()) return;
        captureClientEvent(
          ANALYTICS_EVENTS.apiRequestFailed,
          {
            endpoint: '/api/insights/overall',
            method: 'GET',
            status_code: res.status,
            feature_area: 'insights',
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
        capturedFailure = true;
        throw new Error(data?.message || 'Failed to load insights');
      }
      if (isStaleOrAborted()) return;
      setInsights(data.insights as OverallInsightsPayload);
      setError(null);
    } catch (e: any) {
      const isAbortError =
        (e instanceof DOMException && e.name === 'AbortError') ||
        (typeof e === 'object' &&
          e !== null &&
          'name' in e &&
          (e as { name?: string }).name === 'AbortError');
      if (isAbortError || isStaleOrAborted()) {
        return;
      }
      if (!capturedFailure) {
        captureClientEvent(
          ANALYTICS_EVENTS.apiRequestFailed,
          {
            endpoint: '/api/insights/overall',
            method: 'GET',
            status_code: 0,
            feature_area: 'insights',
            error_code: 'network_exception',
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
      }
      setError(e?.message || 'Failed to load insights');
    } finally {
      if (!isStaleOrAborted()) {
        setLoading(false);
      }
    }
  }, [pathname, session?.user?.auth_provider, session?.user?.id, session?.user?.subscription_tier, status]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchInsights(statsMode);
    }
  }, [fetchInsights, status, statsMode]);

  useEffect(() => {
    return () => {
      insightsAbortControllerRef.current?.abort();
    };
  }, []);

  const modePayload = insights?.mode_payload?.[statsMode];
  const isPremiumContext = insights ? insights.tier_context.isPremium : isPremium;
  const recentForm = insights?.game_trends?.recentForm ?? null;
  const scoringOutlook = insights?.game_trends
    ? composeScoringOutlookPresentation(insights.game_trends)
    : null;
  const canonicalStability = insights?.game_trends?.stability ?? null;
  const consistency = canonicalStability
    ? {
        label: canonicalStability.state,
        stdDev: canonicalStability.evidence.standardDeviation,
        scoreRange: canonicalStability.evidence.scoreRange,
      }
    : modePayload?.consistency ?? insights?.consistency ?? { label: 'insufficient' as const, stdDev: null, scoreRange: null };
  const consistencyLabel = consistency.label;
  const roundsRecent = modePayload?.kpis.roundsRecent ?? 0;
  const performanceRoundCount =
    (recentForm?.evidence.recentCount ?? 0) +
    (recentForm?.evidence.baselineCount ?? 0);
  const performanceHasComparison = performanceRoundCount > 5;
  const performanceRecentLabel = performanceHasComparison ? 'Recent' : 'Current';
  const fallbackConfidence = deriveOverallConfidence({
    hasInsights: Boolean(insights),
    modePayload,
    roundsRecent,
    consistencyLabel,
  });
  const overallConfidence = normalizeOverallConfidence(insights?.confidence) ?? fallbackConfidence;
  const efficiency = modePayload?.efficiency ?? insights?.efficiency ?? {
    fir: DEFAULT_EFFICIENCY_METRIC,
    gir: DEFAULT_EFFICIENCY_METRIC,
    shortGameShots: DEFAULT_EFFICIENCY_METRIC,
    puttsTotal: DEFAULT_EFFICIENCY_METRIC,
    penaltiesPerRound: DEFAULT_EFFICIENCY_METRIC,
  };
  const shortGameMetric = efficiency.shortGameShots ?? DEFAULT_EFFICIENCY_METRIC;
  const puttsMetric = efficiency.puttsTotal ?? efficiency.puttsPerHole ?? DEFAULT_EFFICIENCY_METRIC;
  const penaltiesMetric = efficiency.penaltiesPerRound ?? efficiency.penaltiesPerHole ?? DEFAULT_EFFICIENCY_METRIC;
  const projectionRanges = insights?.projection_ranges;
  const selectedModeProjection = insights?.projection_by_mode?.[statsMode] ?? null;
  const sgComponents = modePayload?.sgComponents ?? insights?.sg?.components;
  const sgHasComponentData = Boolean(sgComponents?.hasData);
  const handicapProjectionPointCount = modePayload?.trend?.handicap
    ?.filter((v): v is number => v != null && Number.isFinite(v))
    .length ?? 0;
  const handicapRoundsRemaining = Math.max(0, 3 - performanceRoundCount);
  const handicapHistoryPointsRemaining = Math.max(0, 3 - handicapProjectionPointCount);
  const hasEnoughHandicapHistory = handicapProjectionPointCount >= 5;
  const premiumScoreProjectionUnlocked = Boolean(
    isPremiumContext &&
      selectedModeProjection?.projectedScoreIn10 != null,
  );
  const premiumHandicapProjectionUnlocked = Boolean(
      isPremiumContext &&
      hasEnoughHandicapHistory &&
      selectedModeProjection?.projectedHandicapIn10 != null,
  );
  const hasModeStdDevForRanges = consistency.stdDev != null && Number.isFinite(consistency.stdDev);
  const combinedStdDev = insights?.consistency?.stdDev ?? null;
  const hasCombinedStdDevForRanges = combinedStdDev != null && Number.isFinite(combinedStdDev);
  const effectiveScoreRange = useMemo(() => {
    if (!premiumScoreProjectionUnlocked) return null;
    if (
      selectedModeProjection?.scoreLow != null &&
      selectedModeProjection?.scoreHigh != null
    ) {
      return {
        low: selectedModeProjection.scoreLow,
        high: selectedModeProjection.scoreHigh,
      };
    }
    const modeProjectedScore = selectedModeProjection?.projectedScoreIn10 ?? null;
    if (!hasModeStdDevForRanges || modeProjectedScore == null) return null;
    return {
      low: modeProjectedScore - consistency.stdDev!,
      high: modeProjectedScore + consistency.stdDev!,
    };
  }, [premiumScoreProjectionUnlocked, selectedModeProjection, hasModeStdDevForRanges, consistency.stdDev]);
  const effectiveHandicapRange = useMemo(() => {
    if (!premiumHandicapProjectionUnlocked) return null;
    let rawLow: number | null = null;
    let rawHigh: number | null = null;
    if (selectedModeProjection?.handicapLow != null && selectedModeProjection?.handicapHigh != null) {
      rawLow = selectedModeProjection.handicapLow;
      rawHigh = selectedModeProjection.handicapHigh;
    } else if (statsMode === 'combined' && projectionRanges?.handicapLow != null && projectionRanges?.handicapHigh != null) {
      rawLow = projectionRanges.handicapLow;
      rawHigh = projectionRanges.handicapHigh;
    } else if (statsMode === 'combined' && hasCombinedStdDevForRanges && selectedModeProjection?.projectedHandicapIn10 != null) {
      rawLow = selectedModeProjection.projectedHandicapIn10 - (combinedStdDev! / 2);
      rawHigh = selectedModeProjection.projectedHandicapIn10 + (combinedStdDev! / 2);
    }
    if (rawLow == null || rawHigh == null) return null;
    const minRealisticLow =
      selectedModeProjection?.handicapCurrent != null ? selectedModeProjection.handicapCurrent - 1.0 : rawLow;
    const boundedLow = Math.max(rawLow, minRealisticLow);
    const boundedHigh = Math.max(rawHigh, boundedLow);
    return {
      low: boundedLow,
      high: boundedHigh,
    };
  }, [premiumHandicapProjectionUnlocked, selectedModeProjection, statsMode, projectionRanges, hasCombinedStdDevForRanges, combinedStdDev]);

  const scoringRecent = recentForm?.evidence.averageScore ?? null;
  const scoringBaseline = recentForm?.evidence.baselineAverageScore ?? null;
  const scoringHasComparison = scoringBaseline != null;
  const scoringRecentLabel = recentForm?.maturity === 'snapshot' || recentForm?.maturity === 'early_level' || recentForm?.maturity === 'current_form'
    ? 'Current'
    : 'Recent';
  const scoringBaselineLabel = recentForm?.maturity === 'early_comparison' ? 'Previous' : 'Usual';
  const scoringWidths = useMemo(
    () => getMagnitudeWidths(scoringRecent, scoringBaseline ?? scoringRecent, 10),
    [scoringBaseline, scoringRecent],
  );
  const scoringDelta = useMemo(
    () => getScoringDeltaSummary(scoringRecent, scoringBaseline),
    [scoringBaseline, scoringRecent],
  );

  const firWidths = useMemo(
    () => getPercentFixedWidths(efficiency.fir.recent, efficiency.fir.baseline),
    [efficiency.fir.recent, efficiency.fir.baseline],
  );
  const girWidths = useMemo(
    () => getPercentFixedWidths(efficiency.gir.recent, efficiency.gir.baseline),
    [efficiency.gir.recent, efficiency.gir.baseline],
  );
  const puttsWidths = useMemo(
    () => getMagnitudeWidths(puttsMetric.recent, puttsMetric.baseline, 5),
    [puttsMetric.recent, puttsMetric.baseline],
  );
  const shortGameWidths = useMemo(
    () => getMagnitudeWidths(shortGameMetric.recent, shortGameMetric.baseline, 5),
    [shortGameMetric.recent, shortGameMetric.baseline],
  );
  const penaltiesWidths = useMemo(
    () => getMagnitudeWidths(penaltiesMetric.recent, penaltiesMetric.baseline),
    [penaltiesMetric.recent, penaltiesMetric.baseline],
  );

  const firDelta = useMemo(
    () => getPercentDeltaSummary(efficiency.fir.recent, efficiency.fir.baseline, 'FIR'),
    [efficiency.fir.recent, efficiency.fir.baseline],
  );
  const girDelta = useMemo(
    () => getPercentDeltaSummary(efficiency.gir.recent, efficiency.gir.baseline, 'GIR'),
    [efficiency.gir.recent, efficiency.gir.baseline],
  );
  const puttsDelta = useMemo(
    () => getLowerBetterRateDeltaSummary(puttsMetric.recent, puttsMetric.baseline),
    [puttsMetric.recent, puttsMetric.baseline],
  );
  const shortGameDelta = useMemo(
    () => getShortGameDeltaSummary(shortGameMetric.recent, shortGameMetric.baseline),
    [shortGameMetric.recent, shortGameMetric.baseline],
  );
  const penaltiesDelta = useMemo(
    () => getPenaltyRateDeltaSummary(penaltiesMetric.recent, penaltiesMetric.baseline),
    [penaltiesMetric.recent, penaltiesMetric.baseline],
  );

  const sgAreaRows = useMemo(() => {
    if (!sgHasComponentData || !sgComponents) return [];
    const recent = sgComponents.recentAvg;
    const keys: SGComponentKey[] = ['offTee', 'approach', 'shortGame', 'putting', 'penalties'];
    return keys.map((key) => {
      const recentVal = recent[key];
      return {
        key,
        label: sgComponentLabel(key),
        delta: normalizeDelta(recentVal),
      };
    });
  }, [sgHasComponentData, sgComponents]);

  const sgMaxAbsAreaValue = useMemo(() => {
    const vals = sgAreaRows
      .map((row) => row.delta)
      .filter((v): v is number => v != null && Number.isFinite(v))
      .map((v) => Math.abs(v));
    return vals.length ? Math.max(...vals) : 0;
  }, [sgAreaRows]);

  const sgHasAnyAreaValue = useMemo(
    () => sgAreaRows.some((row) => row.delta != null && Number.isFinite(row.delta)),
    [sgAreaRows],
  );
  const sgDisplayRows = useMemo(() => {
    if (sgHasAnyAreaValue) return sgAreaRows;
    const keys: SGComponentKey[] = ['offTee', 'approach', 'shortGame', 'putting', 'penalties'];
    return keys.map((key) => ({
      key,
      label: sgComponentLabel(key),
      delta: null as number | null,
    }));
  }, [sgHasAnyAreaValue, sgAreaRows]);
  const sgAreaTooltip = 'Shows your average strokes gained or lost in each area over your latest five rounds, using rounds with usable tracking. Positive values gained strokes; negative values lost strokes.';
  const sgTrendData = useMemo(() => {
    if (!insights) return null;
    const modeTrend = modePayload?.trend;
    const labels = modeTrend?.labels ?? insights.sg?.trend?.labels ?? insights.handicap_trend.labels ?? [];
    const sgTotalRaw = modeTrend?.sgTotal ?? insights.sg?.trend?.sgTotal ?? [];
    const sgTotal = labels.map((_, idx) => {
      const value = sgTotalRaw[idx];
      return value != null && Number.isFinite(value) ? value : null;
    });
    return {
      labels,
      datasets: [
        {
          label: 'SG Total',
          data: sgTotal,
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
  }, [insights, modePayload, accentHighlight]);
  const sgTrendPointCount = sgTrendData?.datasets[0]?.data
    .filter((value): value is number => value != null && Number.isFinite(value))
    .length ?? 0;
  const sgTrendPointsRemaining = Math.max(0, 3 - sgTrendPointCount);
  const hasEstablishedHandicap = handicapProjectionPointCount > 0 || sgTrendPointCount > 0;
  const sgHistoryRoundsRemaining = sgTrendPointsRemaining + (hasEstablishedHandicap ? 0 : handicapRoundsRemaining);

  const handicapData = useMemo(() => {
    if (!insights) return null;
    const modeTrend = modePayload?.trend;
    const labels = modeTrend?.labels ?? insights.handicap_trend.labels;
    const handicap = modeTrend?.handicap ?? insights.handicap_trend.handicap;
    return {
      labels,
      datasets: [
        {
          label: 'Handicap',
          data: handicap,
          borderColor: accentColor,
          backgroundColor: `${accentColor}22`,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: accentColor,
          pointHoverRadius: 7,
          spanGaps: true,
        },
      ],
    };
  }, [insights, modePayload, accentColor]);

  const analyticsContext = useMemo(() => {
    const coverageMetrics = [
      efficiency.fir,
      efficiency.gir,
      puttsMetric,
      penaltiesMetric,
    ];
    let trackedSum = 0;
    let totalSum = 0;
    let hasOptionalStats = false;
    for (const metric of coverageMetrics) {
      const parsed = parseCoverageCounts(metric?.coverageRecent);
      if (!parsed) continue;
      trackedSum += parsed.tracked;
      totalSum += parsed.total;
      if (parsed.tracked > 0) hasOptionalStats = true;
    }
    const statCompletenessScore = totalSum > 0 ? Math.round((trackedSum / totalSum) * 100) / 100 : null;
    const recentSg = sgComponents?.recentAvg;
    const availableComponents = [
      recentSg?.offTee != null ? 'off_tee' : null,
      recentSg?.approach != null ? 'approach' : null,
      recentSg?.shortGame != null ? 'short_game' : null,
      recentSg?.putting != null ? 'putting' : null,
      recentSg?.penalties != null ? 'penalties' : null,
      recentSg?.residual != null ? 'residual' : null,
    ].filter((item): item is string => item != null);

    return {
      selected_window: insights?.tier_context?.recentWindow ?? null,
      stat_completeness_score: statCompletenessScore,
      available_components: availableComponents,
      locked_cards_count: insights?.cards_locked_count ?? 0,
      visible_cards_count: Array.isArray(insights?.cards) ? insights.cards.length : 0,
      has_hbh: null as boolean | null,
      has_optional_stats: hasOptionalStats,
    };
  }, [
    efficiency.fir,
    efficiency.gir,
    insights?.cards,
    insights?.cards_locked_count,
    insights?.tier_context?.recentWindow,
    penaltiesMetric,
    puttsMetric,
    sgComponents?.recentAvg,
  ]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (loading || !insights?.game_trends) return;

    const dedupeKey = `${session?.user?.id ?? 'anon'}:${pathname}:${insights.generated_at}:insights_viewed`;
    if (insightsViewedKeys.has(dedupeKey)) return;
    insightsViewedKeys.add(dedupeKey);

    captureClientEvent(
      ANALYTICS_EVENTS.insightsViewed,
      {
        surface: 'overall_insights',
        insight_mode: statsMode,
        mode: statsMode,
        sample_size: modePayload?.kpis?.roundsRecent ?? null,
        rounds_recent: modePayload?.kpis?.roundsRecent ?? null,
        rounds_lifetime: insights?.tier_context?.maxRoundsUsed ?? null,
        is_premium: isPremiumContext,
        is_premium_view: isPremiumContext,
        confidence: overallConfidence,
        ...analyticsContext,
        tone: null,
        evidenceLevel: null,
        primaryKey: null,
        latest_identity_primary: null,
        timeframe_basis: 'recent_window',
      },
      {
        pathname,
        user: {
          id: session?.user?.id,
          subscription_tier: session?.user?.subscription_tier,
          auth_provider: session?.user?.auth_provider,
        },
        isLoggedIn: true,
      },
    );
  }, [
    insights,
    isPremiumContext,
    loading,
    modePayload?.kpis?.roundsRecent,
    overallConfidence,
    analyticsContext,
    pathname,
    session?.user?.auth_provider,
    session?.user?.id,
    session?.user?.subscription_tier,
    statsMode,
    status,
  ]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (loading || !insights) return;
    if (isPremiumContext) return;

    const lockSurfaces: Array<'trajectory' | 'sg_trend' | 'sg_component_delta'> = [
      'trajectory',
      'sg_trend',
      'sg_component_delta',
    ];

    for (const lockSurface of lockSurfaces) {
      const dedupeKey = `${session?.user?.id ?? 'anon'}:${pathname}:${insights.generated_at}:${statsMode}:paywall:${lockSurface}`;
      if (paywallViewedKeys.has(dedupeKey)) continue;
      paywallViewedKeys.add(dedupeKey);
      captureClientEvent(
        ANALYTICS_EVENTS.paywallViewed,
        {
          surface: 'overall_insights',
          source_page: 'insights',
          lock_surface: lockSurface,
          mode: statsMode,
          sample_size: modePayload?.kpis?.roundsRecent ?? null,
          rounds_lifetime: insights?.tier_context?.maxRoundsUsed ?? null,
          is_premium: isPremiumContext,
          confidence: overallConfidence,
          ...analyticsContext,
        },
        {
          pathname,
          user: {
            id: session?.user?.id,
            subscription_tier: session?.user?.subscription_tier,
            auth_provider: session?.user?.auth_provider,
          },
          isLoggedIn: true,
        },
      );
    }
  }, [
    insights,
    isPremiumContext,
    loading,
    modePayload?.kpis?.roundsRecent,
    overallConfidence,
    analyticsContext,
    pathname,
    session?.user?.auth_provider,
    session?.user?.id,
    session?.user?.subscription_tier,
    statsMode,
    status,
  ]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (loading || !insights) return;
    const trends = insights.game_trends;
    const conclusions = [
      {
        conclusionType: 'recent_form',
        state: trends.recentForm.state,
        component: null,
        confidence: trends.recentForm.confidence,
        maturity: trends.recentForm.maturity,
        recentCount: trends.recentForm.evidence.recentCount,
        baselineCount: trends.recentForm.evidence.baselineCount,
      },
      ...(trends.gameProfile.strength ? [{
        conclusionType: 'strength',
        state: trends.gameProfile.state,
        component: trends.gameProfile.strength.component,
        confidence: trends.gameProfile.strength.confidence,
        maturity: trends.gameProfile.strength.maturity,
        recentCount: trends.gameProfile.strength.evidence.recentWindowCount,
        baselineCount: null,
      }] : []),
      ...(trends.gameProfile.opportunity ? [{
        conclusionType: 'opportunity',
        state: trends.gameProfile.state,
        component: trends.gameProfile.opportunity.component,
        confidence: trends.gameProfile.opportunity.confidence,
        maturity: trends.gameProfile.opportunity.maturity,
        recentCount: trends.gameProfile.opportunity.evidence.recentWindowCount,
        baselineCount: null,
      }] : []),
      ...(!trends.gameProfile.strength && !trends.gameProfile.opportunity ? [{
        conclusionType: 'game_profile',
        state: trends.gameProfile.state,
        component: null,
        confidence: trends.gameProfile.confidence,
        maturity: trends.gameProfile.state === 'building' ? 'none' : 'established',
        recentCount: modePayload?.kpis?.roundsRecent ?? 0,
        baselineCount: null,
      }] : []),
      {
        conclusionType: 'stability',
        state: trends.stability.state,
        component: null,
        confidence: trends.stability.confidence,
        maturity: trends.stability.state === 'building' ? 'none' : 'current_form',
        recentCount: trends.stability.evidence.recentCount,
        baselineCount: null,
      },
    ];
    conclusions.forEach((conclusion) => {
      const momentumState = conclusion.conclusionType === 'recent_form'
        ? trends.recentForm.evidence.momentum.state
        : null;
      const outlookStatus = conclusion.conclusionType === 'recent_form'
        ? composeScoringOutlookPresentation(trends).status
        : null;
      const dedupeKey = `${session?.user?.id ?? 'anon'}:${pathname}:${insights.generated_at}:${statsMode}:${conclusion.conclusionType}:${conclusion.state}:${momentumState ?? 'none'}:${outlookStatus ?? 'none'}:${conclusion.component ?? 'none'}`;
      if (gameTrendViewedKeys.has(dedupeKey)) return;
      gameTrendViewedKeys.add(dedupeKey);
      captureClientEvent(
        ANALYTICS_EVENTS.gameTrendConclusionViewed,
        {
          surface: 'overall_insights',
          version: 2,
          mode: statsMode,
          conclusion_type: conclusion.conclusionType,
          state: conclusion.state,
          momentum_state: momentumState,
          outlook_status: outlookStatus,
          component: conclusion.component,
          confidence: conclusion.confidence,
          overall_confidence: trends.confidence,
          recent_count: conclusion.recentCount,
          baseline_count: conclusion.baselineCount,
          entitlement: trends.tier,
          evidence_maturity: conclusion.maturity,
          profile_state: trends.gameProfile.state,
        },
        {
          pathname,
          user: {
            id: session?.user?.id,
            subscription_tier: session?.user?.subscription_tier,
            auth_provider: session?.user?.auth_provider,
          },
          isLoggedIn: true,
        },
      );
    });
  }, [
    insights,
    loading,
    modePayload?.kpis?.roundsRecent,
    pathname,
    session?.user?.auth_provider,
    session?.user?.id,
    session?.user?.subscription_tier,
    statsMode,
    status,
  ]);

  if (status === 'unauthenticated') return null;
  const showSkeletonContent = status === 'loading' || loading;
  const trajectorySection = showSkeletonContent ? (
    <div className="card dashboard-stat-card trajectory-card">
      <div className="trajectory-header">
        <h3>Scoring Direction</h3>
      </div>
      <div className="trajectory-status-row">
        <span className="skeleton u-inline-block u-w-140 u-h-32 u-rounded-pill" />
      </div>
      <div className="trajectory-pill-grid">
        <div className="trajectory-pill">
          <span className="trajectory-pill-label">Score Range</span>
          <span className="skeleton u-inline-block u-w-pct-58 u-h-20" />
        </div>
        <div className="trajectory-pill">
          <span className="trajectory-pill-label">Handicap Range</span>
          <span className="skeleton u-inline-block u-w-pct-58 u-h-20" />
        </div>
      </div>
    </div>
  ) : insights ? (
    <div className="card dashboard-stat-card trajectory-card">
      <div className="trajectory-header">
        <h3>Scoring Direction</h3>
        <InfoTooltip text="Combines how your recent scoring compares with your usual level and how your latest five rounds compare with the five before them. Score Range balances recent and usual scoring, and widens when recent rounds are less consistent. Handicap Range uses your recent handicap history." />
      </div>
      {scoringOutlook && (
        <>
          <div className="trajectory-status-row">
            <span
              className={`trajectory-label trajectory-chip is-${scoringOutlook.tone}`}
              data-outlook-status={scoringOutlook.status}
            >
              {scoringOutlook.label}
            </span>
          </div>
        </>
      )}

      {isPremiumContext ? (
        premiumScoreProjectionUnlocked ? (
          <>
            <div className="trajectory-pill-grid">
              <div className="trajectory-pill">
                <span className="trajectory-pill-label">{effectiveScoreRange ? 'Score Range' : 'Estimated Score'}</span>
                <span className="trajectory-pill-value">
                  {effectiveScoreRange
                    ? `${Math.floor(Math.min(effectiveScoreRange.low, effectiveScoreRange.high))}-${Math.ceil(Math.max(effectiveScoreRange.low, effectiveScoreRange.high))}`
                    : `~${formatNumber(selectedModeProjection?.projectedScoreIn10 ?? null)}`}
                </span>
              </div>
              <div className="trajectory-pill">
                <span className="trajectory-pill-label">
                  {premiumHandicapProjectionUnlocked
                    ? (effectiveHandicapRange ? 'Handicap Range' : 'Estimated Handicap')
                    : 'Handicap Range'}
                </span>
                <span className="trajectory-pill-value">
                  {premiumHandicapProjectionUnlocked
                    ? (effectiveHandicapRange
                      ? `${formatHandicap(Math.min(effectiveHandicapRange.low, effectiveHandicapRange.high))}-${formatHandicap(Math.max(effectiveHandicapRange.low, effectiveHandicapRange.high))}`
                      : `~${formatHandicap(selectedModeProjection?.projectedHandicapIn10 ?? null)}`)
                    : '--'}
                </span>
              </div>
            </div>
            {!premiumHandicapProjectionUnlocked && (
              <span className="secondary-text insights-subtle-note insights-centered-title">
                GolfIQ needs a little more handicap history before showing a handicap outlook.
              </span>
            )}
          </>
        ) : (
          <span className="secondary-text insights-subtle-note insights-centered-title">
            GolfIQ starts showing where your scores and handicap are heading after 10 rounds.
          </span>
        )
      ) : (
        <>
          <div className="trajectory-pill-grid">
            <div className="trajectory-pill">
              <span className="trajectory-pill-label">Score Range</span>
              <span className="trajectory-pill-value">
                <Lock size={15} className="trajectory-pill-lock-icon" aria-hidden="true" />
              </span>
            </div>
            <div className="trajectory-pill">
              <span className="trajectory-pill-label">Handicap Range</span>
              <span className="trajectory-pill-value">
                <Lock size={15} className="trajectory-pill-lock-icon" aria-hidden="true" />
              </span>
            </div>
          </div>
          <span className="secondary-text insights-subtle-note insights-centered-title trajectory-free-note">
            {performanceRoundCount >= 10
              ? 'Upgrade to see projected score and handicap ranges.'
              : 'GolfIQ starts showing where your scores and handicap are heading after 10 rounds.'}
          </span>
        </>
      )}
    </div>
  ) : null;
  return (
    <div className="page-stack">
      <div className="dashboard-filters">
        <Select
          instanceId="insights-stats-mode"
          inputId="insights-stats-mode-input"
          value={{ value: statsMode, label: statsMode === 'combined' ? 'Combined' : statsMode === '9' ? '9 Holes' : '18 Holes' }}
          onChange={(option) => {
            if (!option) return;
            const nextMode = option.value as StatsMode;
            if (nextMode !== statsMode) {
              captureClientEvent(
                ANALYTICS_EVENTS.insightModeChanged,
                {
                  surface: 'overall_insights',
                  from_mode: statsMode,
                  to_mode: nextMode,
                  mode: nextMode,
                  sample_size: insights?.mode_payload?.[nextMode]?.kpis?.roundsRecent ?? null,
                  rounds_lifetime: insights?.tier_context?.maxRoundsUsed ?? null,
                  is_premium: isPremiumContext,
                  confidence: overallConfidence,
                  ...analyticsContext,
                  tone: null,
                  evidenceLevel: null,
                  primaryKey: null,
                  latest_identity_primary: null,
                  timeframe_basis: 'recent_window',
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
            }
            setStatsMode(nextMode);
          }}
          options={[
            { value: 'combined', label: 'Combined' },
            { value: '9', label: '9 Holes' },
            { value: '18', label: '18 Holes' },
          ]}
          isSearchable={false}
          isDisabled={showSkeletonContent}
          styles={selectStyles}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        />
      </div>

      {statsMode === 'combined' && (
        <p className="combined-note">9 hole rounds are doubled to approximate 18 hole stats.</p>
      )}
      <GameTrendsCard
        trends={insights?.game_trends ?? null}
        mode={statsMode}
        loading={showSkeletonContent}
        error={error}
        onRetry={() => fetchInsights(statsMode)}
      />
      {trajectorySection}

      {showSkeletonContent ? (
        <>
          <div className="insights-top-grid">
            <div className="card dashboard-stat-card comparison-bar-card">
              <div className="comparison-bar-header">
                <h3>Scoring</h3>
              </div>
              <div className="comparison-bar-row">
                <span className="comparison-bar-label">Recent</span>
                <div className="comparison-bar-track">
                  <span className="comparison-bar-fill skeleton u-w-pct-62" />
                </div>
                <span className="comparison-bar-value">
                  <span className="skeleton u-inline-block u-w-34 u-h-14" />
                </span>
              </div>
              <div className="comparison-bar-row">
                <span className="comparison-bar-label">Usual</span>
                <div className="comparison-bar-track">
                  <span className="comparison-bar-fill skeleton u-w-pct-55" />
                </div>
                <span className="comparison-bar-value">
                  <span className="skeleton u-inline-block u-w-34 u-h-14" />
                </span>
              </div>
              <span className="comparison-bar-delta">
                <span className="skeleton u-inline-block u-w-110 u-h-14" />
              </span>
            </div>
            <div className="card dashboard-stat-card comparison-bar-card consistency-card">
              <div className="comparison-bar-header">
                <h3>Scoring Consistency</h3>
              </div>
              <span className="skeleton u-block u-w-pct-40 u-h-28 u-rounded-pill u-mx-auto" />
              <span className="skeleton u-block u-w-pct-50 u-h-14 u-mx-auto" />
            </div>
          </div>

          <div className="trend-card trend-card-h-300">
            <h3 className="insights-centered-title">Handicap History</h3>
            <div className="skeleton skeleton-chart-area" />
          </div>

          <section className="insights-sg-section">
            <div className="trend-card trend-card-h-300">
              <h3 className="insights-centered-title">Strokes Gained History</h3>
              <div className="skeleton skeleton-chart-area" />
            </div>
            <div className="card dashboard-stat-card sg-delta-card">
              <div className="comparison-bar-header">
                <h3 className="insights-centered-title">Strokes Gained by Area</h3>
              </div>
              <div className="sg-delta-list">
                {Array.from({ length: 6 }).map((_, idx) => {
                  const isNeutral = idx === 2;
                  const isNegative = idx % 2 === 1;
                  const barWidth = isNeutral ? '2px' : idx === 4 ? '20%' : '28%';
                  const barLeft = isNeutral
                    ? 'calc(50% - 1px)'
                    : isNegative
                      ? `calc(50% - ${barWidth})`
                      : '50%';

                  return (
                    <div key={`sg-skeleton-${idx}`} className="sg-delta-row">
                      <span className="sg-delta-label">
                        <span className="skeleton u-inline-block u-w-88 u-h-14" />
                      </span>
                      <div className="sg-delta-track">
                        <span className="sg-delta-midline" />
                        <span
                          className={`skeleton sg-skeleton-bar ${isNeutral ? 'is-neutral' : isNegative ? (idx === 4 ? 'is-negative-sm' : 'is-negative') : (idx === 4 ? 'is-positive-sm' : 'is-positive')}`}
                        />
                      </div>
                      <span className="sg-delta-value">
                        <span className="skeleton u-inline-block u-w-52 u-h-14" />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="grid grid-2 insights-performance-grid">
            {['Driving Accuracy', 'Approach Accuracy', 'Short Game', 'Putting', 'Penalties'].map((title) => (
              <div key={`performance-skeleton-${title}`} className="card dashboard-stat-card comparison-bar-card">
                <div className="comparison-bar-header">
                  <h3>{title}</h3>
                </div>
                <div className="comparison-bar-row">
                  <span className="comparison-bar-label">Recent</span>
                  <div className="comparison-bar-track">
                    <span className="comparison-bar-fill skeleton u-w-pct-58" />
                  </div>
                  <span className="comparison-bar-value">
                    <span className="skeleton u-inline-block u-w-34 u-h-14" />
                  </span>
                </div>
                <div className="comparison-bar-row">
                  <span className="comparison-bar-label">Average</span>
                  <div className="comparison-bar-track">
                    <span className="comparison-bar-fill skeleton u-w-pct-52" />
                  </div>
                  <span className="comparison-bar-value">
                    <span className="skeleton u-inline-block u-w-34 u-h-14" />
                  </span>
                </div>
                <span className="comparison-bar-delta">
                  <span className="skeleton u-inline-block u-w-pct-100 u-h-14" />
                </span>
              </div>
            ))}
          </div>

        </>
      ) : (
        <>
      {modePayload && insights && (
        <div className="insights-top-grid">
          <ComparisonBarCard
            title="Scoring"
            tooltipText="Shows how your recent scores compare with your usual scoring across the non-overlapping rounds before your recent window. Lower is better."
            recentLabel={scoringRecentLabel}
            typicalLabel={scoringBaselineLabel}
            recentRawValue={scoringRecent}
            typicalRawValue={scoringBaseline}
            betterWhenHigher={false}
            recentValueText={formatCardValueOneDecimal(scoringRecent)}
            typicalValueText={formatCardValueOneDecimal(scoringBaseline)}
            recentBarWidth={scoringWidths.recent}
            typicalBarWidth={scoringWidths.typical}
            hasData={scoringWidths.hasData}
            deltaText={scoringDelta.text}
            deltaTone={scoringDelta.tone}
            accentColor={accentColor}
            accentHighlight={INSIGHTS_POSITIVE_COLOR}
            dangerColor={INSIGHTS_NEGATIVE_COLOR}
            showTypical={scoringHasComparison}
            showDelta={scoringHasComparison}
          />
          <div className="card dashboard-stat-card comparison-bar-card consistency-card">
            <div className="comparison-bar-header">
              <h3>Scoring Consistency</h3>
              <InfoTooltip text="Shows how much your score relative to par changes from round to round across your last five rounds. Less variation means more consistent scoring." />
            </div>
            <p className="consistency-badge">{formatConsistencyLabel(consistencyLabel)}</p>
            {consistency.stdDev != null && consistency.stdDev >= 0.2 && (
              <span className="secondary-text consistency-stdev">+/- {consistency.stdDev.toFixed(1)} Strokes</span>
            )}
          </div>
        </div>
      )}

      {handicapData && handicapProjectionPointCount >= 3 ? (
        <TrendCard
          trendData={handicapData}
          accentColor={accentHighlight}
          surfaceColor={surfaceColor}
          textColor={textColor}
          gridColor={gridColor}
          height={300}
          yStep={1}
          label="Handicap History"
        />
      ) : insights ? (
        <div className="trend-card trend-card-empty trend-card-empty-score">
          <h3 className="insights-centered-title">Handicap History</h3>
          <div className="trend-card-empty-body">
            <p className="secondary-text text-center">
              {handicapRoundsRemaining > 0
                ? `Complete ${handicapRoundsRemaining} more ${handicapRoundsRemaining === 1 ? 'round' : 'rounds'} to establish your first handicap.`
                : `Complete ${handicapHistoryPointsRemaining} more ${handicapHistoryPointsRemaining === 1 ? 'round' : 'rounds'} to start seeing your handicap history.`}
            </p>
          </div>
        </div>
      ) : null}

      <section className="insights-sg-section">
        <LockedSection
          locked={!isPremiumContext}
          title="See what is really costing you strokes"
          subtitle="Get a clearer breakdown of what helped, what hurt, and where to focus next."
          showCta={!isPremiumContext}
          ctaLabel="See Premium Plans"
          onCtaClick={() => {
            trackSgTrendUpgradeCtaClick();
            router.push('/pricing');
          }}
        >
          {sgTrendData && (!isPremiumContext || sgTrendPointCount >= 3) ? (
            <TrendCard
              trendData={sgTrendData}
              accentColor={accentColor}
              surfaceColor={surfaceColor}
              textColor={textColor}
              gridColor={gridColor}
              height={300}
              yStep={2}
              label="Strokes Gained History"
            />
          ) : (
            <div className="trend-card trend-card-empty trend-card-empty-score">
              <h3 className="insights-centered-title">Strokes Gained History</h3>
              <div className="trend-card-empty-body">
                <p className="secondary-text text-center">
                  Complete {sgHistoryRoundsRemaining} more {sgHistoryRoundsRemaining === 1 ? 'round' : 'rounds'} to start seeing your strokes gained history.
                </p>
              </div>
            </div>
          )}
        </LockedSection>

        <LockedSection
          locked={!isPremiumContext}
          title="Strokes Gained by Area"
          subtitle="See which part of the game is helping and which part is costing you the most."
        >
          <div
            className="card dashboard-stat-card sg-delta-card"
          >
            <div className="comparison-bar-header">
              <h3 className="insights-centered-title">Strokes Gained by Area</h3>
              <InfoTooltip text={sgAreaTooltip} />
            </div>
            {!sgHasComponentData && (
              <p className="secondary-text insights-subtle-note insights-centered-title">
                {hasEstablishedHandicap
                  ? 'Complete a fully tracked round to start seeing your strokes gained by area.'
                  : 'Your area breakdown will begin once GolfIQ has established your handicap and you complete a fully tracked round.'}
              </p>
            )}
            <div className="sg-delta-list">
              {sgDisplayRows.map((row) => {
                const rowDelta = row.delta;
                const hasDelta = rowDelta != null && Number.isFinite(rowDelta);
                const absDelta = hasDelta ? Math.abs(rowDelta as number) : 0;
                const barHalfWidthPct =
                  hasDelta && sgMaxAbsAreaValue > 0
                    ? (absDelta / sgMaxAbsAreaValue) * 50
                    : 0;

                let barStyle: Record<string, string> = {};
                if (hasDelta) {
                  if (sgMaxAbsAreaValue === 0 || absDelta === 0) {
                    barStyle = { left: 'calc(50% - 1px)', width: '2px' };
                  } else if ((rowDelta as number) > 0) {
                    barStyle = { left: '50%', width: `${barHalfWidthPct}%` };
                  } else {
                    barStyle = { left: `calc(50% - ${barHalfWidthPct}%)`, width: `${barHalfWidthPct}%` };
                  }
                }

                const barClass = !hasDelta
                  ? ''
                  : (rowDelta as number) > 0
                    ? 'positive'
                    : (rowDelta as number) < 0
                      ? 'negative'
                      : 'neutral';

                return (
                  <div key={row.key} className="sg-delta-row">
                    <span className="sg-delta-label">{row.label}</span>
                    <div className="sg-delta-track">
                      <span className="sg-delta-midline" />
                      {hasDelta && (
                        <span
                          className={`sg-delta-bar ${barClass}`}
                          style={barStyle}
                        />
                      )}
                    </div>
                    <span className="sg-delta-value">{row.delta == null ? '-' : formatSigned(row.delta)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </LockedSection>
      </section>

      {insights && (
        <div className="grid grid-2 insights-performance-grid">
          <ComparisonBarCard
            title="Driving Accuracy"
            tooltipText={`Shows the percentage of fairways you hit. ${performanceHasComparison ? 'Recent uses your last five rounds; Average uses all rounds in this view.' : 'Current uses all rounds in this view.'} Higher is better.`}
            recentLabel={performanceRecentLabel}
            typicalLabel="Average"
            recentRawValue={efficiency.fir.recent}
            typicalRawValue={efficiency.fir.baseline}
            betterWhenHigher={true}
            recentValueText={formatEffValue(efficiency.fir.recent, 'percent')}
            typicalValueText={formatEffValue(efficiency.fir.baseline, 'percent')}
            recentBarWidth={firWidths.recent}
            typicalBarWidth={firWidths.typical}
            hasData={firWidths.hasData}
            deltaText={firDelta.text}
            deltaTone={firDelta.tone}
            coverageText={formatCoverageText(efficiency.fir.coverageRecent)}
            accentColor={accentColor}
            accentHighlight={INSIGHTS_POSITIVE_COLOR}
            dangerColor={INSIGHTS_NEGATIVE_COLOR}
            showTypical={performanceHasComparison}
            showDelta={performanceHasComparison}
          />
          <ComparisonBarCard
            title="Approach Accuracy"
            tooltipText={`Shows the percentage of greens you hit in regulation. ${performanceHasComparison ? 'Recent uses your last five rounds; Average uses all rounds in this view.' : 'Current uses all rounds in this view.'} Higher is better.`}
            recentLabel={performanceRecentLabel}
            typicalLabel="Average"
            recentRawValue={efficiency.gir.recent}
            typicalRawValue={efficiency.gir.baseline}
            betterWhenHigher={true}
            recentValueText={formatEffValue(efficiency.gir.recent, 'percent')}
            typicalValueText={formatEffValue(efficiency.gir.baseline, 'percent')}
            recentBarWidth={girWidths.recent}
            typicalBarWidth={girWidths.typical}
            hasData={girWidths.hasData}
            deltaText={girDelta.text}
            deltaTone={girDelta.tone}
            coverageText={formatCoverageText(efficiency.gir.coverageRecent)}
            accentColor={accentColor}
            accentHighlight={INSIGHTS_POSITIVE_COLOR}
            dangerColor={INSIGHTS_NEGATIVE_COLOR}
            showTypical={performanceHasComparison}
            showDelta={performanceHasComparison}
          />
          <ComparisonBarCard
            title="Short Game"
            tooltipText={`Shows your average chips and greenside bunker shots per round. ${performanceHasComparison ? 'Recent uses your last five rounds; Average uses all rounds in this view.' : 'Current uses all rounds in this view.'} Lower is better.`}
            recentLabel={performanceRecentLabel}
            typicalLabel="Average"
            recentRawValue={shortGameMetric.recent}
            typicalRawValue={shortGameMetric.baseline}
            betterWhenHigher={false}
            recentValueText={formatEffValue(shortGameMetric.recent, 'rate')}
            typicalValueText={formatEffValue(shortGameMetric.baseline, 'rate')}
            recentBarWidth={shortGameWidths.recent}
            typicalBarWidth={shortGameWidths.typical}
            hasData={shortGameWidths.hasData}
            deltaText={shortGameDelta.text}
            deltaTone={shortGameDelta.tone}
            coverageText={formatCoverageText(shortGameMetric.coverageRecent)}
            accentColor={accentColor}
            accentHighlight={INSIGHTS_POSITIVE_COLOR}
            dangerColor={INSIGHTS_NEGATIVE_COLOR}
            showTypical={performanceHasComparison}
            showDelta={performanceHasComparison}
          />
          <ComparisonBarCard
            title="Putting"
            tooltipText={`Shows your average putts per round. ${performanceHasComparison ? 'Recent uses your last five rounds; Average uses all rounds in this view.' : 'Current uses all rounds in this view.'} Lower is better.`}
            recentLabel={performanceRecentLabel}
            typicalLabel="Average"
            recentRawValue={puttsMetric.recent}
            typicalRawValue={puttsMetric.baseline}
            betterWhenHigher={false}
            recentValueText={formatEffValue(puttsMetric.recent, 'rate')}
            typicalValueText={formatEffValue(puttsMetric.baseline, 'rate')}
            recentBarWidth={puttsWidths.recent}
            typicalBarWidth={puttsWidths.typical}
            hasData={puttsWidths.hasData}
            deltaText={puttsDelta.text}
            deltaTone={puttsDelta.tone}
            coverageText={formatCoverageText(puttsMetric.coverageRecent)}
            accentColor={accentColor}
            accentHighlight={INSIGHTS_POSITIVE_COLOR}
            dangerColor={INSIGHTS_NEGATIVE_COLOR}
            showTypical={performanceHasComparison}
            showDelta={performanceHasComparison}
          />
          <ComparisonBarCard
            title="Penalties"
            tooltipText={`Shows your average penalties per round. ${performanceHasComparison ? 'Recent uses your last five rounds; Average uses all rounds in this view.' : 'Current uses all rounds in this view.'} Lower is better.`}
            recentLabel={performanceRecentLabel}
            typicalLabel="Average"
            recentRawValue={penaltiesMetric.recent}
            typicalRawValue={penaltiesMetric.baseline}
            betterWhenHigher={false}
            recentValueText={formatEffValue(penaltiesMetric.recent, 'rate')}
            typicalValueText={formatEffValue(penaltiesMetric.baseline, 'rate')}
            recentBarWidth={penaltiesWidths.recent}
            typicalBarWidth={penaltiesWidths.typical}
            hasData={penaltiesWidths.hasData}
            deltaText={penaltiesDelta.text}
            deltaTone={penaltiesDelta.tone}
            coverageText={formatCoverageText(penaltiesMetric.coverageRecent)}
            accentColor={accentColor}
            accentHighlight={INSIGHTS_POSITIVE_COLOR}
            dangerColor={INSIGHTS_NEGATIVE_COLOR}
            showTypical={performanceHasComparison}
            showDelta={performanceHasComparison}
          />
        </div>
      )}
        </>
      )}

    </div>
  );
}


