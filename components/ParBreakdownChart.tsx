'use client';

interface ParBreakdownChartRow {
  id: string | number;
  par: number;
  average: number | null;
  delta: number | null;
  averageLabel: string;
  deltaLabel: string;
  holesLabel?: string | null;
  vsClassName?: string;
  trendClassName?: string;
}

interface ParBreakdownChartProps {
  rows: ParBreakdownChartRow[];
  showHoles?: boolean;
  className?: string;
  emptyMessage?: string;
  deltaPrefix?: string;
}

const PAR_DELTA_PER_HOLE_LIMIT = 1.5;
const PAR_DELTA_EPSILON = 0.001;

export default function ParBreakdownChart({
  rows,
  showHoles = true,
  className = '',
  emptyMessage = 'No scoring-by-par data yet.',
  deltaPrefix = 'vs par ',
}: ParBreakdownChartProps) {
  if (!rows.length) {
    return <p className="secondary-text text-center">{emptyMessage}</p>;
  }

  return (
    <div className={`stats-par-chart ${className}`.trim()}>
      {rows.map((row) => {
        const hasDelta = row.delta != null && Number.isFinite(row.delta);
        const safeDelta = hasDelta ? (row.delta as number) : 0;
        const isEvenDelta = Math.abs(safeDelta) < PAR_DELTA_EPSILON;
        const clampedDelta = Math.max(-PAR_DELTA_PER_HOLE_LIMIT, Math.min(PAR_DELTA_PER_HOLE_LIMIT, safeDelta));
        const normalizedWidth = (Math.abs(clampedDelta) / PAR_DELTA_PER_HOLE_LIMIT) * 50;
        const deltaWidth = isEvenDelta ? 0 : Math.max(normalizedWidth, 1.5);
        const deltaLeft = safeDelta < 0 ? 50 - deltaWidth : 50;
        const pointLeft = safeDelta < 0 ? 50 - deltaWidth : safeDelta > 0 ? 50 + deltaWidth : 50;
        const trendClass =
          row.trendClassName ??
          (!hasDelta
            ? 'is-unavailable'
            : safeDelta < -PAR_DELTA_EPSILON
              ? 'is-better'
              : safeDelta > PAR_DELTA_EPSILON
                ? 'is-worse'
                : 'is-even');

        return (
          <div key={row.id} className={`stats-par-chart-row ${!hasDelta ? 'is-unavailable' : ''}`.trim()}>
            <div className="stats-par-chart-meta">
              <div className="stats-par-chart-par">Par {row.par}</div>
              {showHoles && row.holesLabel && <div className="stats-par-chart-holes">{row.holesLabel}</div>}
            </div>

            <div className="stats-par-chart-track-wrap">
              <div className="stats-par-chart-track">
                {hasDelta && !isEvenDelta && (
                  <div
                    className={`stats-par-chart-delta ${trendClass}`}
                    style={{
                      left: `${deltaLeft}%`,
                      width: `${deltaWidth}%`,
                    }}
                  />
                )}
                <div className="stats-par-chart-center" />
                <div className={`stats-par-chart-point ${trendClass}`} style={{ left: `${pointLeft}%` }} />
              </div>
            </div>

            <div className="stats-par-chart-values">
              <div className="stats-par-chart-average">Avg {row.averageLabel}</div>
              <div className={`stats-par-chart-vs ${row.vsClassName ?? ''}`.trim()}>
                {deltaPrefix}
                {row.deltaLabel}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type { ParBreakdownChartRow };
