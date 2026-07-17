'use client';

import { useEffect, useState } from 'react';
import { BarChart3, CircleAlert, CircleCheck, Info, Sparkles } from 'lucide-react';
import type { GameProfileConclusionDto, GameTrendsMode, GameTrendsV2Dto } from '@/lib/insights/gameTrends/types';
import { useAdaptiveTooltipPlacement } from '@/lib/ui/useAdaptiveTooltipPlacement';
import {
  assertFreeGameTrendsCopySafe,
  composeGameProfileFallbackCopy,
  composeProfileConclusionCopy,
  composeRecentFormCopy,
  composeStabilityCopy,
  type GameTrendCopy,
} from '@/lib/insights/gameTrends/presentation';

type Props = {
  trends: GameTrendsV2Dto | null;
  mode: GameTrendsMode;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

function confidenceLabel(value: GameTrendsV2Dto['confidence']): string {
  return value === 'strong' ? 'Strong' : value === 'moderate' ? 'Moderate' : 'Building';
}

function TrendCopy({ copy }: { copy: GameTrendCopy }) {
  return (
    <div className="game-trends-copy">
      <p className="game-trends-conclusion">
        <span>{copy.conclusion}</span>
        {copy.supporting && <> <span>{copy.supporting}</span></>}
      </p>
    </div>
  );
}

function ProfileMessage({ conclusion, role }: { conclusion: GameProfileConclusionDto; role: 'strength' | 'opportunity' }) {
  const copy = composeProfileConclusionCopy(conclusion, role);
  const Icon = role === 'strength' ? CircleCheck : CircleAlert;
  return (
    <section className="insight-message game-trends-message" data-conclusion-type={role}>
      <div className="insight-message-content game-trends-message-content">
        <Icon aria-hidden="true" size={18} className="insight-message-icon game-trends-message-icon" data-icon-role={role} />
        <div className="game-trends-row-heading">
          <h4>{role === 'strength' ? 'Strength' : 'Opportunity'}</h4>
        </div>
        <TrendCopy copy={copy} />
      </div>
    </section>
  );
}

function GameTrendsSkeleton() {
  return (
    <div className="game-trends-sections" aria-label="Loading Game Trends">
      {['Recent Form', 'Strength', 'Opportunity', 'Stability'].map((label, index) => (
        <section className="insight-message game-trends-message insight-message-skeleton" key={label}>
          <div className="insight-message-content game-trends-message-content">
            <span className="skeleton insight-message-icon u-inline-block u-w-18 u-h-18" />
            <span className={`skeleton u-inline-block ${index === 1 ? 'u-w-110' : 'u-w-88'} u-h-14`} />
            <div className="game-trends-skeleton-copy">
              <span className="skeleton u-inline-block u-w-pct-100 u-h-14" />
              <span className="skeleton u-inline-block u-w-pct-88 u-h-14" />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

export default function GameTrendsCard({ trends, mode, loading, error, onRetry }: Props) {
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);
  const {
    containerRef: confidenceTooltipRef,
    tooltipRef: confidenceContentRef,
    displayPosition: confidenceTooltipPosition,
    displayVertical: confidenceTooltipVertical,
    isPositioned: confidenceTooltipIsPositioned,
    resetPlacement: resetConfidenceTooltipPlacement,
  } = useAdaptiveTooltipPlacement(showConfidenceInfo);
  const confidence = trends?.confidence ?? 'building';
  const label = confidenceLabel(confidence);

  useEffect(() => {
    if (!showConfidenceInfo) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!confidenceTooltipRef.current) return;
      if (!confidenceTooltipRef.current.contains(event.target as Node)) {
        setShowConfidenceInfo(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [confidenceTooltipRef, showConfidenceInfo]);

  if (trends?.tier === 'free') {
    const allCopy = [composeRecentFormCopy(trends), composeStabilityCopy(trends)];
    if (trends.gameProfile.strength) allCopy.push(composeProfileConclusionCopy(trends.gameProfile.strength, 'strength'));
    if (trends.gameProfile.opportunity) allCopy.push(composeProfileConclusionCopy(trends.gameProfile.opportunity, 'opportunity'));
    allCopy.forEach((copy) => assertFreeGameTrendsCopySafe(`${copy.conclusion} ${copy.supporting ?? ''}`));
  }

  const noRounds = !loading && !error && trends?.recentForm.state === 'unavailable';
  const modeEmptyTitle = mode === '9' ? 'No 9-hole rounds yet' : mode === '18' ? 'No 18-hole rounds yet' : null;

  return (
    <div className="card insights-card game-trends-card">
      <div className="insights-header">
        <div className="insights-title">
          <Sparkles aria-hidden="true" size={20} />
          <h3>Game Trends</h3>
        </div>
        <div className="overall-insights-actions">
          {loading ? (
            <span className="skeleton u-inline-block u-w-78 u-h-24 u-rounded-pill" />
          ) : (
            <div ref={confidenceTooltipRef} className="info-tooltip-container insights-confidence-tooltip">
              <button
                type="button"
                className={`insights-confidence-pill is-${confidence === 'strong' ? 'high' : confidence === 'moderate' ? 'medium' : 'low'}`}
                aria-label={`Game Trends confidence: ${label}`}
                aria-expanded={showConfidenceInfo}
                onClick={() => setShowConfidenceInfo((current) => {
                  const next = !current;
                  if (next) resetConfidenceTooltipPlacement();
                  return next;
                })}
              >
                {label}
              </button>
              {showConfidenceInfo && (
                <div
                  ref={confidenceContentRef}
                  className={`info-tooltip-content ${confidenceTooltipPosition} ${confidenceTooltipVertical} ${confidenceTooltipIsPositioned ? 'ready' : 'measuring'} insights-confidence-popover`}
                  role="status"
                >
                  <h4>Game Trends Confidence</h4>
                  <p>Building means an early read. Moderate means useful evidence is forming. Strong means every available conclusion has strong support.</p>
                  <div className={`info-tooltip-arrow ${confidenceTooltipPosition} ${confidenceTooltipVertical}`} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? <GameTrendsSkeleton /> : error ? (
        <div className="game-trends-state" role="alert">
          <p>GolfIQ couldn’t load Game Trends right now. Please try again.</p>
          <button type="button" className="btn btn-secondary" onClick={onRetry}>Try Again</button>
        </div>
      ) : noRounds ? (
        <div className="game-trends-state game-trends-empty-state">
          {modeEmptyTitle && <h4>{modeEmptyTitle}</h4>}
          <p>{modeEmptyTitle ? `Add ${mode === '9' ? 'a 9-hole' : 'an 18-hole'} round to build this view.` : 'Add your first round to start building Game Trends.'}</p>
        </div>
      ) : trends ? (
        <div className="game-trends-sections">
          <section className="insight-message game-trends-message" data-conclusion-type="recent_form">
            <div className="insight-message-content game-trends-message-content">
              <BarChart3 aria-hidden="true" size={18} className="insight-message-icon game-trends-message-icon" data-icon-role="recent_form" />
              <div className="game-trends-row-heading">
                <h4>Recent Form</h4>
                {trends.recentForm.maturity === 'early_comparison' && <span className="game-trends-context-label">Early Signal</span>}
              </div>
              <TrendCopy copy={composeRecentFormCopy(trends)} />
            </div>
          </section>

          {trends.gameProfile.strength && <ProfileMessage conclusion={trends.gameProfile.strength} role="strength" />}
          {trends.gameProfile.opportunity && <ProfileMessage conclusion={trends.gameProfile.opportunity} role="opportunity" />}
          {!trends.gameProfile.strength && !trends.gameProfile.opportunity && (
            <section className="insight-message game-trends-message" data-conclusion-type="game_profile" data-profile-state={trends.gameProfile.state}>
              <div className="insight-message-content game-trends-message-content">
                <Info aria-hidden="true" size={18} className="insight-message-icon game-trends-message-icon" data-icon-role={trends.gameProfile.state} />
                <div className="game-trends-row-heading">
                  <h4>{trends.gameProfile.state === 'balanced' ? 'Balanced Game' : 'Building Your Game Profile'}</h4>
                </div>
                <TrendCopy copy={composeGameProfileFallbackCopy(trends)} />
              </div>
            </section>
          )}

          <section className="insight-message game-trends-message" data-conclusion-type="stability">
            <div className="insight-message-content game-trends-message-content">
              {trends.stability.state === 'stable'
                ? <CircleCheck aria-hidden="true" size={18} className="insight-message-icon game-trends-message-icon" data-icon-role="stable" />
                : trends.stability.state === 'volatile'
                  ? <CircleAlert aria-hidden="true" size={18} className="insight-message-icon game-trends-message-icon" data-icon-role="volatile" />
                  : <Info aria-hidden="true" size={18} className="insight-message-icon game-trends-message-icon" data-icon-role={trends.stability.state} />}
              <div className="game-trends-row-heading">
                <h4>Stability</h4>
              </div>
              <TrendCopy copy={composeStabilityCopy(trends)} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
