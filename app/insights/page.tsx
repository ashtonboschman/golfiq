'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Select from 'react-select';
import { Sparkles, Lock, RefreshCw, BarChart3, CircleCheck, CircleAlert, Dumbbell, Map, TrendingUp } from 'lucide-react';
import { selectStyles } from '@/lib/selectStyles';
import { useSubscription } from '@/hooks/useSubscription';
import TrendCard from '@/components/TrendCard';
import InfoTooltip from '@/components/InfoTooltip';
import { formatHandicap, formatNumber } from '@/lib/formatters';

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
    label: 'stable' | 'moderate' | 'volatile' | 'insufficient';
    stdDev: number | null;
  };
  efficiency?: {
    fir: EfficiencyMetric;
    gir: EfficiencyMetric;
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
      putting: number | null;
      penalties: number | null;
      residual: number | null;
    };
    baselineAvg: {
      total: number | null;
      offTee: number | null;
      approach: number | null;
      putting: number | null;
      penalties: number | null;
      residual: number | null;
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

type SGComponentKey = 'offTee' | 'approach' | 'putting' | 'penalties' | 'residual';
type DeltaTone = 'up' | 'down' | 'flat' | 'none';

type OverallInsightsPayload = {
  generated_at: string;
  cards: string[];
  cards_locked_count: number;
  projection: {
    trajectory: 'improving' | 'flat' | 'worsening' | 'volatile' | 'unknown';
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
    trajectory: 'improving' | 'flat' | 'worsening' | 'volatile' | 'unknown';
    projectedScoreIn10: number | null;
    scoreLow: number | null;
    scoreHigh: number | null;
    roundsUsed: number;
  }>;
  tier_context: {
    isPremium: boolean;
    baseline: 'last20' | 'alltime';
    maxRoundsUsed: number;
    recentWindow: number;
  };
  consistency: {
    label: 'stable' | 'moderate' | 'volatile' | 'insufficient';
    stdDev: number | null;
  };
  efficiency: {
    fir: EfficiencyMetric;
    gir: EfficiencyMetric;
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
        putting: number | null;
        penalties: number | null;
        residual: number | null;
        confidence: 'high' | 'medium' | 'low' | null;
        partialAnalysis: boolean | null;
      };
      recentAvg: {
        total: number | null;
        offTee: number | null;
        approach: number | null;
        putting: number | null;
        penalties: number | null;
        residual: number | null;
      };
      baselineAvg: {
        total: number | null;
        offTee: number | null;
        approach: number | null;
        putting: number | null;
        penalties: number | null;
        residual: number | null;
      };
      mostCostlyComponent: 'offTee' | 'approach' | 'putting' | 'penalties' | 'residual' | null;
      worstComponentFrequencyRecent: {
        component: 'offTee' | 'approach' | 'putting' | 'penalties' | 'residual' | null;
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

function formatConsistencyLabel(label: OverallInsightsPayload['consistency']['label']): string {
  if (label === 'stable') return 'Stable';
  if (label === 'moderate') return 'Moderate';
  if (label === 'volatile') return 'Volatile';
  return 'Not enough data';
}

function formatEffValue(v: number | null, type: 'percent' | 'rate'): string {
  if (v == null || !Number.isFinite(v)) return 'Not tracked';
  if (type === 'percent') return `${Math.round(v * 100)}%`;
  return (Math.round(v * 10) / 10).toFixed(1);
}

function formatCardValueOneDecimal(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return (Math.round(v * 10) / 10).toFixed(1);
}

function sgComponentLabel(component: SGComponentKey): string {
  if (component === 'offTee') return 'Off The Tee';
  if (component === 'approach') return 'Approach';
  if (component === 'putting') return 'Putting';
  if (component === 'penalties') return 'Penalties';
  return 'Residual';
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
    return { text: 'Not enough data', tone: 'none' };
  }

  const delta = recent - typical;
  if (Math.abs(delta) < 0.1) return { text: '\u2192 0.0 Strokes', tone: 'flat' };
  if (delta < 0) return { text: `\u25BC ${delta.toFixed(1)} Strokes`, tone: 'up' };
  return { text: `\u25B2 +${delta.toFixed(1)} Strokes`, tone: 'down' };
}
function getPercentDeltaSummary(
  recent: number | null,
  typical: number | null,
  metricLabel: 'FIR' | 'GIR',
): { text: string; tone: DeltaTone } {
  if (recent == null || typical == null || !Number.isFinite(recent) || !Number.isFinite(typical)) {
    return { text: 'Not enough data', tone: 'none' };
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
    return { text: 'Not enough data', tone: 'none' };
  }

  const delta = recent - typical;
  if (Math.abs(delta) < 0.1) return { text: '\u2192 0.0 Putts', tone: 'flat' };
  if (delta < 0) return { text: `\u25BC ${delta.toFixed(1)} Putts`, tone: 'up' };
  return { text: `\u25B2 +${delta.toFixed(1)} Putts`, tone: 'down' };
}
function getPenaltyRateDeltaSummary(recent: number | null, typical: number | null): { text: string; tone: DeltaTone } {
  if (recent == null || typical == null || !Number.isFinite(recent) || !Number.isFinite(typical)) {
    return { text: 'Not enough data', tone: 'none' };
  }

  const delta = recent - typical;
  if (Math.abs(delta) < 0.1) return { text: '\u2192 0.0 Penalties', tone: 'flat' };
  if (delta < 0) return { text: `\u25BC ${delta.toFixed(1)} Penalties`, tone: 'up' };
  return { text: `\u25B2 +${delta.toFixed(1)} Penalties`, tone: 'down' };
}
function getDeltaToneClass(tone: DeltaTone): string {
  if (tone === 'up') return 'is-up';
  if (tone === 'down') return 'is-down';
  return 'is-flat';
}

function formatTrajectoryLabel(
  trajectory: OverallInsightsPayload['projection']['trajectory'] | null | undefined,
): string {
  if (trajectory === 'improving') return 'Improving';
  if (trajectory === 'flat') return 'Flat';
  if (trajectory === 'worsening') return 'Worsening';
  if (trajectory === 'volatile') return 'Volatile';
  return 'Not enough data';
}

function getTrajectoryDeltaSummary(delta: number | null | undefined): { text: string; tone: DeltaTone } {
  if (delta == null || !Number.isFinite(delta)) {
    return { text: 'Log 5 rounds to unlock trajectory.', tone: 'none' };
  }
  if (delta < -0.1) {
    return { text: `\u25BC  ${delta.toFixed(1)} strokes compared to average`, tone: 'up' };
  }
  if (delta > 0.1) {
    return { text: `\u25B2 ${delta.toFixed(1)} strokes compared to average`, tone: 'down' };
  }
  return { text: '\u2192 Playing at your normal scoring level', tone: 'flat' };
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

function stripOverallCardPrefix(message: string): string {
  return String(message ?? '')
    .replace(/^(?:\u2705|\u26A0\uFE0F|\u2139\uFE0F|\u{1F525})\s*/u, '')
    .trim();
}

function getOverallCardMeta(index: number): { icon: ReactNode } {
  if (index === 0) return { icon: <BarChart3 size={18} className="insight-message-icon insight-level-info" /> };
  if (index === 1) return { icon: <CircleCheck size={18} className="insight-message-icon insight-level-success" /> };
  if (index === 2) return { icon: <CircleAlert size={18} className="insight-message-icon insight-level-warning" /> };
  if (index === 3) return { icon: <Dumbbell size={18} className="insight-message-icon insight-level-info" /> };
  if (index === 4) return { icon: <Map size={18} className="insight-message-icon insight-level-info" /> };
  return { icon: <TrendingUp size={18} className="insight-message-icon insight-level-great" /> };
}

function OverallInsightMessage({ card, index }: { card: string; index: number }) {
  const meta = getOverallCardMeta(index);
  return (
    <div className="insight-message">
      <div className="insight-message-content">
        {meta.icon}
        <span className="insight-message-text">{stripOverallCardPrefix(card)}</span>
      </div>
    </div>
  );
}

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
}: ComparisonBarCardProps) {
  const deltaColor =
    deltaTone === 'up' ? accentHighlight : deltaTone === 'down' ? dangerColor : 'var(--color-secondary-text)';
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
  const recentFillColor = recentBetter ? accentHighlight : typicalBetter ? dangerColor : accentColor;
  const typicalFillColor = typicalBetter ? accentHighlight : recentBetter ? dangerColor : accentColor;

  return (
    <div className="card dashboard-stat-card comparison-bar-card">
      <div className="comparison-bar-header">
        <h3>{title}</h3>
        <InfoTooltip text={tooltipWithCoverage} />
      </div>

      <div className="comparison-bar-row">
        <span className="comparison-bar-label">{recentLabel}</span>
        <div className="comparison-bar-track">
          {hasData && recentBarWidth > 0 && (
            <span
              className="comparison-bar-fill"
              style={{ width: `${recentBarWidth}%`, backgroundColor: recentFillColor }}
            />
          )}
        </div>
        <span className="comparison-bar-value">{recentValueText}</span>
      </div>

      <div className="comparison-bar-row">
        <span className="comparison-bar-label">{typicalLabel}</span>
        <div className="comparison-bar-track">
          {hasData && typicalBarWidth > 0 && (
            <span
              className="comparison-bar-fill"
              style={{ width: `${typicalBarWidth}%`, backgroundColor: typicalFillColor }}
            />
          )}
        </div>
        <span className="comparison-bar-value">{typicalValueText}</span>
      </div>

      <span
        className={`comparison-bar-delta ${getDeltaToneClass(deltaTone)}`}
        style={{ color: deltaColor }}
      >
        {deltaText}
      </span>
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
  const { status } = useSession();
  const router = useRouter();
  const { isPremium } = useSubscription();

  const [statsMode, setStatsMode] = useState<StatsMode>('combined');
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<OverallInsightsPayload | null>(null);

  const [accentColor, setAccentColor] = useState('#2D6CFF');
  const [accentHighlight, setAccentHighlight] = useState('#36ad64');
  const [warningColor, setWarningColor] = useState('#f59e0b');
  const [textColor, setTextColor] = useState('#EDEFF2');
  const [gridColor, setGridColor] = useState('#2A313D');
  const [surfaceColor, setSurfaceColor] = useState('#171C26');

  useEffect(() => {
    const updateThemeColors = () => {
      const rootStyles = getComputedStyle(document.documentElement);
      const accent = rootStyles.getPropertyValue('--color-accent').trim() || '#2D6CFF';
      const highlight = rootStyles.getPropertyValue('--color-accent-highlight').trim() || '#36ad64';
      const warning =
        rootStyles.getPropertyValue('--color-warning').trim() ||
        rootStyles.getPropertyValue('--color-accent-warm').trim() ||
        '#f59e0b';
      const text = rootStyles.getPropertyValue('--color-primary-text').trim() || '#EDEFF2';
      const grid = rootStyles.getPropertyValue('--color-border').trim() || '#2A313D';
      const surface = rootStyles.getPropertyValue('--color-primary-surface').trim() || '#171C26';

      setAccentColor(accent);
      setAccentHighlight(highlight);
      setWarningColor(warning);
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

  const fetchInsights = async (mode: StatsMode) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/insights/overall?statsMode=${mode}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load insights');
      setInsights(data.insights as OverallInsightsPayload);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchInsights(statsMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, statsMode]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch('/api/insights/overall/regenerate', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to regenerate');
      setInsights(data.insights as OverallInsightsPayload);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to regenerate insights');
    } finally {
      setRegenerating(false);
    }
  };

  const modePayload = insights?.mode_payload?.[statsMode];
  const isPremiumContext = insights ? insights.tier_context.isPremium : isPremium;
  const consistency = modePayload?.consistency ?? insights?.consistency ?? { label: 'insufficient' as const, stdDev: null };
  const consistencyLabel = consistency.label;
  const efficiency = modePayload?.efficiency ?? insights?.efficiency ?? {
    fir: DEFAULT_EFFICIENCY_METRIC,
    gir: DEFAULT_EFFICIENCY_METRIC,
    puttsTotal: DEFAULT_EFFICIENCY_METRIC,
    penaltiesPerRound: DEFAULT_EFFICIENCY_METRIC,
  };
  const puttsMetric = efficiency.puttsTotal ?? efficiency.puttsPerHole ?? DEFAULT_EFFICIENCY_METRIC;
  const penaltiesMetric = efficiency.penaltiesPerRound ?? efficiency.penaltiesPerHole ?? DEFAULT_EFFICIENCY_METRIC;
  const projection = insights?.projection;
  const projectionRanges = insights?.projection_ranges;
  const selectedModeProjection = insights?.projection_by_mode?.[statsMode] ?? null;
  const sgComponents = modePayload?.sgComponents ?? insights?.sg?.components;
  const sgHasComponentData = Boolean(sgComponents?.hasData);
  const trajectoryLabel = formatTrajectoryLabel(selectedModeProjection?.trajectory ?? projection?.trajectory);
  const trajectoryDelta = getTrajectoryDeltaSummary(modePayload?.kpis.deltaVsBaseline ?? null);
  const trajectoryDeltaColor =
    trajectoryDelta.tone === 'up'
      ? INSIGHTS_POSITIVE_COLOR
      : trajectoryDelta.tone === 'down'
        ? INSIGHTS_NEGATIVE_COLOR
        : 'var(--color-secondary-text)';
  const trajectoryChipTone =
    selectedModeProjection?.trajectory === 'improving'
      ? 'up'
      : selectedModeProjection?.trajectory === 'worsening'
        ? 'down'
        : selectedModeProjection?.trajectory === 'volatile'
          ? 'warn'
          : selectedModeProjection?.trajectory === 'flat'
            ? 'flat'
            : 'none';
  const trajectoryChipColor =
    trajectoryChipTone === 'up'
      ? INSIGHTS_POSITIVE_COLOR
      : trajectoryChipTone === 'down'
        ? INSIGHTS_NEGATIVE_COLOR
        : trajectoryChipTone === 'warn'
          ? warningColor
          : 'var(--color-secondary-text)';
  const handicapProjectionPointCount = insights?.handicap_trend?.handicap
    ?.filter((v): v is number => v != null && Number.isFinite(v))
    .length ?? 0;
  const hasEnoughHandicapHistory = handicapProjectionPointCount >= 5;
  const premiumScoreProjectionUnlocked = Boolean(
    isPremiumContext &&
      projection?.projectedScoreIn10 != null &&
      (selectedModeProjection?.projectedScoreIn10 != null || projection?.projectedScoreIn10 != null),
  );
  const premiumHandicapProjectionUnlocked = Boolean(
    isPremiumContext &&
      hasEnoughHandicapHistory &&
      projection?.projectedHandicapIn10 != null,
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
    if (projectionRanges?.scoreLow != null && projectionRanges?.scoreHigh != null) {
      return {
        low: projectionRanges.scoreLow,
        high: projectionRanges.scoreHigh,
      };
    }
    const fallbackProjectedScore = selectedModeProjection?.projectedScoreIn10 ?? projection?.projectedScoreIn10 ?? null;
    if (!hasModeStdDevForRanges || fallbackProjectedScore == null) return null;
    return {
      low: fallbackProjectedScore - consistency.stdDev!,
      high: fallbackProjectedScore + consistency.stdDev!,
    };
  }, [premiumScoreProjectionUnlocked, selectedModeProjection, projectionRanges, projection?.projectedScoreIn10, hasModeStdDevForRanges, consistency.stdDev]);
  const effectiveHandicapRange = useMemo(() => {
    if (!premiumHandicapProjectionUnlocked) return null;
    let rawLow: number | null = null;
    let rawHigh: number | null = null;
    if (projectionRanges?.handicapLow != null && projectionRanges?.handicapHigh != null) {
      rawLow = projectionRanges.handicapLow;
      rawHigh = projectionRanges.handicapHigh;
    } else if (hasCombinedStdDevForRanges && projection?.projectedHandicapIn10 != null) {
      rawLow = projection.projectedHandicapIn10 - (combinedStdDev! / 2);
      rawHigh = projection.projectedHandicapIn10 + (combinedStdDev! / 2);
    }
    if (rawLow == null || rawHigh == null) return null;
    const minRealisticLow =
      projection?.handicapCurrent != null ? projection.handicapCurrent - 1.0 : rawLow;
    const boundedLow = Math.max(rawLow, minRealisticLow);
    const boundedHigh = Math.max(rawHigh, boundedLow);
    return {
      low: boundedLow,
      high: boundedHigh,
    };
  }, [premiumHandicapProjectionUnlocked, projectionRanges, hasCombinedStdDevForRanges, projection, combinedStdDev]);

  const scoringWidths = useMemo(
    () => getMagnitudeWidths(modePayload?.kpis.avgScoreRecent ?? null, modePayload?.kpis.avgScoreBaseline ?? null, 10),
    [modePayload?.kpis.avgScoreRecent, modePayload?.kpis.avgScoreBaseline],
  );
  const scoringDelta = useMemo(
    () => getScoringDeltaSummary(modePayload?.kpis.avgScoreRecent ?? null, modePayload?.kpis.avgScoreBaseline ?? null),
    [modePayload],
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
  const penaltiesDelta = useMemo(
    () => getPenaltyRateDeltaSummary(penaltiesMetric.recent, penaltiesMetric.baseline),
    [penaltiesMetric.recent, penaltiesMetric.baseline],
  );

  const sgDeltaRows = useMemo(() => {
    if (!sgHasComponentData || !sgComponents) return [];
    const recent = sgComponents.recentAvg;
    const baseline = sgComponents.baselineAvg;
    const keys: SGComponentKey[] = ['offTee', 'approach', 'putting', 'penalties', 'residual'];
    return keys.map((key) => {
      const recentVal = recent[key];
      const baselineVal = baseline[key];
      const rawDelta =
        recentVal != null &&
        baselineVal != null &&
        Number.isFinite(recentVal) &&
        Number.isFinite(baselineVal)
          ? recentVal - baselineVal
          : null;
      return {
        key,
        label: sgComponentLabel(key),
        delta: normalizeDelta(rawDelta),
      };
    });
  }, [sgHasComponentData, sgComponents]);

  const sgMaxAbsDelta = useMemo(() => {
    const vals = sgDeltaRows
      .map((row) => row.delta)
      .filter((v): v is number => v != null && Number.isFinite(v))
      .map((v) => Math.abs(v));
    return vals.length ? Math.max(...vals) : 0;
  }, [sgDeltaRows]);

  const sgHasAnyDelta = useMemo(
    () => sgDeltaRows.some((row) => row.delta != null && Number.isFinite(row.delta)),
    [sgDeltaRows],
  );
  const sgDisplayRows = useMemo(() => {
    if (sgHasAnyDelta) return sgDeltaRows;
    const keys: SGComponentKey[] = ['offTee', 'approach', 'putting', 'penalties', 'residual'];
    return keys.map((key) => ({
      key,
      label: sgComponentLabel(key),
      delta: null as number | null,
    }));
  }, [sgHasAnyDelta, sgDeltaRows]);
  const sgRecentWindowRounds = useMemo(() => {
    const raw = modePayload?.kpis.roundsRecent ?? insights?.tier_context?.recentWindow ?? 5;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 5;
    return Math.max(1, Math.round(parsed));
  }, [modePayload?.kpis.roundsRecent, insights?.tier_context?.recentWindow]);
  const sgBaselineWindowRounds = useMemo(() => {
    const raw =
      selectedModeProjection?.roundsUsed ??
      modePayload?.trend?.labels?.length ??
      insights?.tier_context?.maxRoundsUsed ??
      sgRecentWindowRounds;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return sgRecentWindowRounds;
    return Math.max(sgRecentWindowRounds, Math.round(parsed));
  }, [
    selectedModeProjection?.roundsUsed,
    modePayload?.trend?.labels?.length,
    insights?.tier_context?.maxRoundsUsed,
    sgRecentWindowRounds,
  ]);
  const sgComponentDeltaTooltip = useMemo(
    () =>
      `Shows each strokes gained component delta comparing your recent ${formatRoundCountLabel(sgRecentWindowRounds)} versus your baseline window of ${formatRoundCountLabel(sgBaselineWindowRounds)} in this mode. Positive means better than baseline, negative means worse.`,
    [sgRecentWindowRounds, sgBaselineWindowRounds],
  );
  const aiPrimaryCard = useMemo(() => {
    if (!insights?.cards?.length) return null;
    return insights.cards[0] ?? null;
  }, [insights]);

  const aiPreviewCards = useMemo(() => {
    if (isPremiumContext || !insights?.cards?.length) return [];
    const start = 1;
    const count = Math.min(5, Math.max(0, insights.cards.length - 1));
    return insights.cards.slice(start, start + count);
  }, [insights, isPremiumContext]);

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
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: accentHighlight,
          pointHoverRadius: 7,
          spanGaps: true,
        },
      ],
    };
  }, [insights, modePayload, accentHighlight]);

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
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: accentColor,
          pointHoverRadius: 7,
          spanGaps: true,
        },
      ],
    };
  }, [insights, modePayload, accentColor]);

  if (status === 'unauthenticated') return null;
  const showSkeletonContent = status === 'loading' || loading;

  return (
    <div className="page-stack">
      <div className="card insights-card">
        <div className="insights-header">
          <div className="insights-title">
            <Sparkles size={20} />
            <h3>Overall Insights</h3>
          </div>
          <div className="overall-insights-actions">
            {showSkeletonContent ? (
              <span className="skeleton" style={{ display: 'inline-block', width: 78, height: 24, borderRadius: 999 }} />
            ) : (
              <span className={`insights-badge ${isPremiumContext ? 'is-premium' : 'is-free'}`}>
                {isPremiumContext ? 'Premium' : 'Free'}
              </span>
            )}
          </div>
        </div>
        <div className="overall-insights-meta">
          <p className="secondary-text">
            Last updated {insights?.generated_at ? new Date(insights.generated_at).toLocaleString() : '-'}
          </p>
          <button
            type="button"
            className="btn btn-toggle"
            onClick={handleRegenerate}
            disabled={regenerating || showSkeletonContent || !insights}
          >
            {regenerating ? <RefreshCw className="spinning" size={16} /> : <RefreshCw size={16} />} Regenerate
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}

        <div className="insights-content">
          {showSkeletonContent ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div key={`overall-insight-skeleton-${idx}`} className="insight-message insight-message-skeleton">
                <div className="insight-message-content">
                  <div className="insight-message-skeleton-lines">
                    <span className="skeleton" style={{ width: '92%', height: 14 }} />
                    <span className="skeleton" style={{ width: '72%', height: 14 }} />
                  </div>
                </div>
              </div>
            ))
          ) : isPremiumContext ? (
            (insights?.cards ?? []).map((card, idx) => (
              <OverallInsightMessage key={`card-${idx}`} card={card} index={idx} />
            ))
          ) : (
            <>
              {aiPrimaryCard ? (
                <OverallInsightMessage card={aiPrimaryCard} index={0} />
              ) : (
                <OverallInsightMessage card="Premium insight preview" index={0} />
              )}

              <LockedSection
                locked
                title="Unlock full Overall Insights"
                subtitle="See what’s costing you strokes, your SG breakdown, and projected ranges."
                showCta
                ctaLabel="Unlock Full Insights"
                onCtaClick={() => router.push('/pricing')}
              >
                <div className="insights-locked-preview-stack">
                  {(aiPreviewCards.length
                    ? aiPreviewCards
                    : ['Premium insight preview', 'Premium insight preview', 'Premium insight preview', 'Premium insight preview', 'Premium insight preview']
                  ).map((card, idx) => (
                    <div key={`blur-card-${idx}`} className="overall-insight-fake">
                      <OverallInsightMessage card={card} index={idx + 1} />
                    </div>
                  ))}
                </div>
              </LockedSection>
            </>
          )}
        </div>
      </div>

      <div className="dashboard-filters">
        <Select
          instanceId="insights-stats-mode"
          inputId="insights-stats-mode-input"
          value={{ value: statsMode, label: statsMode === 'combined' ? 'Combined' : statsMode === '9' ? '9 Holes' : '18 Holes' }}
          onChange={(option) => option && setStatsMode(option.value as StatsMode)}
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
                  <span className="skeleton" style={{ display: 'inline-block', width: '62%', height: 10, borderRadius: 999 }} />
                </div>
                <span className="comparison-bar-value">
                  <span className="skeleton" style={{ display: 'inline-block', width: 34, height: 14 }} />
                </span>
              </div>
              <div className="comparison-bar-row">
                <span className="comparison-bar-label">Average</span>
                <div className="comparison-bar-track">
                  <span className="skeleton" style={{ display: 'inline-block', width: '55%', height: 10, borderRadius: 999 }} />
                </div>
                <span className="comparison-bar-value">
                  <span className="skeleton" style={{ display: 'inline-block', width: 34, height: 14 }} />
                </span>
              </div>
              <span className="comparison-bar-delta">
                <span className="skeleton" style={{ display: 'inline-block', width: 110, height: 14 }} />
              </span>
            </div>
            <div className="card dashboard-stat-card comparison-bar-card consistency-card">
              <div className="comparison-bar-header">
                <h3>Scoring Consistency</h3>
              </div>
              <span className="skeleton" style={{ display: 'block', width: '40%', height: 28, borderRadius: 999, marginInline: 'auto' }} />
              <span className="skeleton" style={{ display: 'block', width: '50%', height: 14, marginInline: 'auto' }} />
            </div>
          </div>

          <div className="trend-card" style={{ height: 300 }}>
            <h3 className="insights-centered-title">Handicap Trend</h3>
            <div className="skeleton skeleton-chart-area" />
          </div>

          <section className="insights-sg-section">
            <div className="trend-card" style={{ height: 300 }}>
              <h3 className="insights-centered-title">Strokes Gained Trend</h3>
              <div className="skeleton skeleton-chart-area" />
            </div>
            <div className="card dashboard-stat-card sg-delta-card">
              <div className="comparison-bar-header">
                <h3 className="insights-centered-title">SG Component Delta</h3>
              </div>
              <div className="sg-delta-list">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={`sg-skeleton-${idx}`} className="sg-delta-row">
                    <span className="sg-delta-label">
                      <span className="skeleton" style={{ display: 'inline-block', width: 88, height: 14 }} />
                    </span>
                    <div className="sg-delta-track">
                      <span className="sg-delta-midline" />
                      <span className="skeleton" style={{ display: 'inline-block', width: '55%', height: 10, borderRadius: 999 }} />
                    </div>
                    <span className="sg-delta-value">
                      <span className="skeleton" style={{ display: 'inline-block', width: 52, height: 14 }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="grid grid-2 insights-performance-grid">
            {['Driving Accuracy', 'Approach Accuracy', 'Putting', 'Penalties'].map((title) => (
              <div key={`performance-skeleton-${title}`} className="card dashboard-stat-card comparison-bar-card">
                <div className="comparison-bar-header">
                  <h3>{title}</h3>
                </div>
                <div className="comparison-bar-row">
                  <span className="comparison-bar-label">Recent</span>
                  <div className="comparison-bar-track">
                    <span className="skeleton" style={{ display: 'inline-block', width: '58%', height: 10, borderRadius: 999 }} />
                  </div>
                  <span className="comparison-bar-value">
                    <span className="skeleton" style={{ display: 'inline-block', width: 34, height: 14 }} />
                  </span>
                </div>
                <div className="comparison-bar-row">
                  <span className="comparison-bar-label">Average</span>
                  <div className="comparison-bar-track">
                    <span className="skeleton" style={{ display: 'inline-block', width: '52%', height: 10, borderRadius: 999 }} />
                  </div>
                  <span className="comparison-bar-value">
                    <span className="skeleton" style={{ display: 'inline-block', width: 34, height: 14 }} />
                  </span>
                </div>
                <span className="comparison-bar-delta">
                  <span className="skeleton" style={{ display: 'inline-block', width: 100, height: 14 }} />
                </span>
              </div>
            ))}
          </div>

          <div className="card dashboard-stat-card trajectory-card">
            <div className="trajectory-header">
              <h3>Performance Trajectory</h3>
            </div>
            <div className="trajectory-status-row">
              <span className="skeleton" style={{ display: 'inline-block', width: 110, height: 28, borderRadius: 999 }} />
              <span className="skeleton" style={{ display: 'inline-block', width: 200, height: 14 }} />
            </div>
            <div className="trajectory-pill-grid">
              <div className="trajectory-pill">
                <span className="trajectory-pill-label">Score Range</span>
                <span className="skeleton" style={{ display: 'inline-block', width: '58%', height: 20 }} />
              </div>
              <div className="trajectory-pill">
                <span className="trajectory-pill-label">HCP Range</span>
                <span className="skeleton" style={{ display: 'inline-block', width: '58%', height: 20 }} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
      {modePayload && insights && (
        <div className="insights-top-grid">
          <ComparisonBarCard
            title="Scoring"
            tooltipText="Average score per round. Recent = average of your last 5 rounds. Lower is better."
            recentLabel="Recent"
            typicalLabel="Average"
            recentRawValue={modePayload.kpis.avgScoreRecent}
            typicalRawValue={modePayload.kpis.avgScoreBaseline}
            betterWhenHigher={false}
            recentValueText={formatCardValueOneDecimal(modePayload.kpis.avgScoreRecent)}
            typicalValueText={formatCardValueOneDecimal(modePayload.kpis.avgScoreBaseline)}
            recentBarWidth={scoringWidths.recent}
            typicalBarWidth={scoringWidths.typical}
            hasData={scoringWidths.hasData}
            deltaText={scoringDelta.text}
            deltaTone={scoringDelta.tone}
            accentColor={accentColor}
            accentHighlight={INSIGHTS_POSITIVE_COLOR}
            dangerColor={INSIGHTS_NEGATIVE_COLOR}
          />
          <div className="card dashboard-stat-card comparison-bar-card consistency-card">
            <div className="comparison-bar-header">
              <h3>Scoring Consistency</h3>
              <InfoTooltip text="Based on your last 10 rounds. Lower variation means your scoring is more repeatable." />
            </div>
            <p className="consistency-badge">{formatConsistencyLabel(consistencyLabel)}</p>
            {consistency.stdDev != null && (
              <span className="secondary-text consistency-stdev">+/- {consistency.stdDev.toFixed(1)} Strokes</span>
            )}
          </div>
        </div>
      )}

      {handicapData && (
        <TrendCard
          trendData={handicapData}
          accentColor={accentHighlight}
          surfaceColor={surfaceColor}
          textColor={textColor}
          gridColor={gridColor}
          height={300}
          yStep={1}
          label="Handicap Trend"
        />
      )}

      <section className="insights-sg-section">
        <LockedSection
          locked={!isPremiumContext}
          title="Strokes Gained Trend (Premium)"
          subtitle="See your SG Total trend over time to spot whether shot-value performance is improving or slipping."
        >
          {sgTrendData ? (
            <TrendCard
              trendData={sgTrendData}
              accentColor={accentColor}
              surfaceColor={surfaceColor}
              textColor={textColor}
              gridColor={gridColor}
              height={300}
              yStep={2}
              label="Strokes Gained Trend"
            />
          ) : (
            <div className="card dashboard-stat-card">
              <h3 className="insights-centered-title">Strokes Gained Trend</h3>
              <p className="secondary-text insights-subtle-note">No SG data yet. Log rounds after getting a handicap to populate this section.</p>
            </div>
          )}
        </LockedSection>

        <LockedSection
          locked={!isPremiumContext}
          title="SG Component Breakdown (Premium)"
          subtitle="Compare Off The Tee, Approach, Putting, Penalties, and Residual deltas vs your average to find your biggest leak."
        >
          <div
            className="card dashboard-stat-card sg-delta-card"
            style={{
              ['--sg-positive-color' as any]: INSIGHTS_POSITIVE_COLOR,
              ['--sg-negative-color' as any]: INSIGHTS_NEGATIVE_COLOR,
            } as any}
          >
            <div className="comparison-bar-header">
              <h3 className="insights-centered-title">SG Component Delta</h3>
              <InfoTooltip text={sgComponentDeltaTooltip} />
            </div>
            {!sgHasComponentData && (
              <p className="secondary-text insights-subtle-note insights-centered-title">No SG component data yet. Log rounds with advanced stats to populate this section.</p>
            )}
            <div className="sg-delta-list">
              {sgDisplayRows.map((row) => {
                const rowDelta = row.delta;
                const hasDelta = rowDelta != null && Number.isFinite(rowDelta);
                const absDelta = hasDelta ? Math.abs(rowDelta as number) : 0;
                const barHalfWidthPct =
                  hasDelta && sgMaxAbsDelta > 0
                    ? (absDelta / sgMaxAbsDelta) * 50
                    : 0;

                let barStyle: Record<string, string> = {};
                if (hasDelta) {
                  if (sgMaxAbsDelta === 0 || absDelta === 0) {
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
                    <span className="sg-delta-value">{row.delta == null ? 'Not tracked' : formatSigned(row.delta)}</span>
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
            tooltipText="Fairways in regulation. Recent = average of your last 5 rounds. Higher is better."
            recentLabel="Recent"
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
          />
          <ComparisonBarCard
            title="Approach Accuracy"
            tooltipText="Greens in regulation. Recent = average of your last 5 rounds. Higher is better."
            recentLabel="Recent"
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
          />
          <ComparisonBarCard
            title="Putting"
            tooltipText="Putts per round. Recent = average of your last 5 rounds. Lower is better."
            recentLabel="Recent"
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
          />
          <ComparisonBarCard
            title="Penalties"
            tooltipText="Penalties per round. Recent = average of your last 5 rounds. Lower is better."
            recentLabel="Recent"
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
          />
        </div>
      )}

      {insights && (
        <LockedSection
          locked={!isPremiumContext}
          title="Performance Trajectory (Premium)"
          subtitle="See whether your scoring trend is improving, flat, or worsening, with projected score and handicap ranges."
          className="trajectory-lock-section"
        >
          <div className="card dashboard-stat-card trajectory-card">
            <div className="trajectory-header">
              <h3>Performance Trajectory</h3>
              <InfoTooltip text="Uses your recent scoring vs your average to estimate direction. Based on your recent rounds continuing." />
            </div>
            <div className="trajectory-status-row">
              <span
                className={`trajectory-label trajectory-chip is-${trajectoryChipTone}`}
                style={{ color: trajectoryChipColor, borderColor: trajectoryChipColor }}
              >
                {trajectoryLabel}
              </span>
              <span
                className={`trajectory-delta ${getDeltaToneClass(trajectoryDelta.tone)}`}
                style={{ color: trajectoryDeltaColor }}
              >
                {trajectoryDelta.text}
              </span>
            </div>

            {isPremiumContext ? (
              premiumScoreProjectionUnlocked ? (
                <>
                  <div className="trajectory-pill-grid">
                    <div className="trajectory-pill">
                      <span className="trajectory-pill-label">{effectiveScoreRange ? 'Score Range' : 'Estimated Score'}</span>
                      <span className="trajectory-pill-value">
                        {effectiveScoreRange
                          ? `${Math.round(Math.min(effectiveScoreRange.low, effectiveScoreRange.high))}-${Math.round(Math.max(effectiveScoreRange.low, effectiveScoreRange.high))}`
                          : `~${formatNumber(selectedModeProjection?.projectedScoreIn10 ?? projection?.projectedScoreIn10 ?? null)}`}
                      </span>
                    </div>
                    <div className="trajectory-pill">
                      <span className="trajectory-pill-label">
                        {premiumHandicapProjectionUnlocked
                          ? (effectiveHandicapRange ? 'HCP Range' : 'Estimated Handicap')
                          : 'HCP Range'}
                      </span>
                      <span className="trajectory-pill-value">
                        {premiumHandicapProjectionUnlocked
                          ? (effectiveHandicapRange
                            ? `${formatHandicap(Math.min(effectiveHandicapRange.low, effectiveHandicapRange.high))}-${formatHandicap(Math.max(effectiveHandicapRange.low, effectiveHandicapRange.high))}`
                            : `~${formatHandicap(projection?.projectedHandicapIn10 ?? null)}`)
                          : '--'}
                      </span>
                    </div>
                  </div>
                  {!premiumHandicapProjectionUnlocked && (
                    <span className="secondary-text insights-subtle-note insights-centered-title">
                      Not enough handicap history yet for a reliable handicap projection.
                    </span>
                  )}
                </>
              ) : (
                <span className="secondary-text insights-subtle-note insights-centered-title">
                  Projections unlock after 10 rounds logged.
                </span>
              )
            ) : (
              <div className="trajectory-pill-grid">
                <div className="trajectory-pill">
                  <span className="trajectory-pill-label">Score Range</span>
                  <span className="trajectory-pill-value">--</span>
                </div>
                <div className="trajectory-pill">
                  <span className="trajectory-pill-label">HCP Range</span>
                  <span className="trajectory-pill-value">--</span>
                </div>
              </div>
            )}
          </div>
        </LockedSection>
      )}
        </>
      )}

    </div>
  );
}
