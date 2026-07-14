'use client';

type DirectionBucket = 'miss_left' | 'miss_right' | 'miss_short' | 'miss_long';
type DirectionPosition = 'left' | 'right' | 'short' | 'long';
type MissArea = 'fairway' | 'green';

interface MissSeries {
  percentages: (number | null)[];
  counts: number[];
  tracked_misses: number;
  total_misses: number;
  untracked_misses: number;
}

interface MissTendenciesData {
  labels: string[];
  keys: DirectionBucket[];
  fir: MissSeries;
  gir: MissSeries;
}

interface MissTendenciesChartProps {
  data: MissTendenciesData | null;
}

type DirectionViewModel = {
  key: DirectionBucket;
  label: string;
  position: DirectionPosition;
  percentage: number;
  displayPercentage: string;
  isStrongest: boolean;
};

export type DirectionalMissViewModel = {
  area: MissArea;
  title: string;
  trackedMisses: number;
  isLimited: boolean;
  isEmpty: boolean;
  directions: DirectionViewModel[];
};

const DIRECTION_DEFINITIONS: Array<{
  key: DirectionBucket;
  label: string;
  position: DirectionPosition;
}> = [
  { key: 'miss_left', label: 'Left', position: 'left' },
  { key: 'miss_right', label: 'Right', position: 'right' },
  { key: 'miss_short', label: 'Short', position: 'short' },
  { key: 'miss_long', label: 'Long', position: 'long' },
];

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function safePercentage(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatPercentage(value: number): string {
  return `${Math.round(value)}%`;
}

export function buildDirectionalMissViewModel(args: {
  area: MissArea;
  keys?: DirectionBucket[] | null;
  series?: Partial<MissSeries> | null;
}): DirectionalMissViewModel {
  const title = args.area === 'fairway' ? 'Fairway' : 'Green';
  const keys = Array.isArray(args.keys) ? args.keys : [];
  const percentages = Array.isArray(args.series?.percentages) ? args.series.percentages : [];
  const trackedMisses = safeCount(args.series?.tracked_misses);

  const resolvedPercentages = DIRECTION_DEFINITIONS.map((direction, fallbackIndex) => {
    const keyedIndex = keys.indexOf(direction.key);
    const sourceIndex = keyedIndex >= 0 ? keyedIndex : keys.length === 0 ? fallbackIndex : -1;
    return safePercentage(percentages[sourceIndex]);
  });
  const maximumPercentage = Math.max(...resolvedPercentages);

  const directions = DIRECTION_DEFINITIONS.map((direction, index) => {
    const percentage = resolvedPercentages[index];
    return {
      ...direction,
      percentage,
      displayPercentage: formatPercentage(percentage),
      isStrongest: trackedMisses > 0 && maximumPercentage > 0 && percentage === maximumPercentage,
    };
  });

  return {
    area: args.area,
    title,
    trackedMisses,
    isLimited: trackedMisses >= 1 && trackedMisses <= 5,
    isEmpty: trackedMisses === 0,
    directions,
  };
}

const DIRECTION_ANGLES: Record<DirectionPosition, number> = {
  right: 0,
  short: 90,
  left: 180,
  long: 270,
};

function polarPoint(radius: number, angle: number): { x: number; y: number } {
  const radians = angle * (Math.PI / 180);
  return {
    x: 110 + radius * Math.cos(radians),
    y: 110 + radius * Math.sin(radians),
  };
}

function getWedgeRadius(percentage: number, maximumPercentage: number): number {
  if (percentage <= 0 || maximumPercentage <= 0) return 1;
  const relativeShare = Math.min(1, percentage / maximumPercentage);
  return 40 + relativeShare * 60;
}

function getWedgePath(direction: DirectionViewModel, maximumPercentage: number): string {
  const radius = getWedgeRadius(direction.percentage, maximumPercentage);
  const angle = DIRECTION_ANGLES[direction.position];
  const start = polarPoint(radius, angle - 23);
  const end = polarPoint(radius, angle + 23);

  return `M110 110 L${start.x.toFixed(2)} ${start.y.toFixed(2)} A${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

function DirectionalTargetGraphic({
  area,
  directions,
}: {
  area: MissArea;
  directions: DirectionViewModel[];
}) {
  const maximumPercentage = Math.max(...directions.map((direction) => direction.percentage));

  return (
    <svg
      className={`directional-miss-target is-${area}`}
      viewBox="0 0 220 220"
      aria-hidden="true"
      focusable="false"
      data-testid={`${area}-miss-target`}
    >
      <defs>
        {directions.map((direction) => (
          <radialGradient
            key={direction.key}
            id={`${area}-${direction.position}-miss-gradient`}
            gradientUnits="userSpaceOnUse"
            cx="110"
            cy="110"
            r={getWedgeRadius(direction.percentage, maximumPercentage)}
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.06" />
            <stop offset="58%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.78" />
          </radialGradient>
        ))}
      </defs>
      {directions.map((direction) => (
        <path
          key={direction.key}
          className={`directional-miss-region is-${direction.position} ${direction.isStrongest ? 'is-strongest' : ''}`}
          d={getWedgePath(direction, maximumPercentage)}
          fill={`url(#${area}-${direction.position}-miss-gradient)`}
          data-percentage={direction.percentage}
          data-radius={getWedgeRadius(direction.percentage, maximumPercentage)}
        />
      ))}
      <g className="directional-miss-arrows">
        <path className="directional-miss-arrow-line" d="M110 60V-5" />
        <path className="directional-miss-arrow-head" d="M104 3L110 -5L116 3" />
        <path className="directional-miss-arrow-line" d="M60 110H-5" />
        <path className="directional-miss-arrow-head" d="M3 104L-5 110L3 116" />
        <path className="directional-miss-arrow-line" d="M160 110H225" />
        <path className="directional-miss-arrow-head" d="M217 104L225 110L217 116" />
        <path className="directional-miss-arrow-line" d="M110 160V225" />
        <path className="directional-miss-arrow-head" d="M104 217L110 225L116 217" />
      </g>
      {area === 'fairway' ? (
        <g className="directional-miss-target-core">
          <path
            className="directional-miss-fairway-rough"
            d="M88 42 C82 72 82 144 92 178 C102 182 118 182 128 178 C138 144 138 72 132 42 C121 37 99 37 88 42 Z"
          />
          <path
            className="directional-miss-fairway-main"
            d="M97 46 C92 77 93 143 101 174 C106 177 114 177 119 174 C127 143 128 77 123 46 C116 43 104 43 97 46 Z"
          />
          <path d="M110 49V172" className="directional-miss-target-centerline" />
          <path d="M103 50 C99 83 100 141 106 172" className="directional-miss-target-stripe" />
          <path d="M117 50 C121 83 120 141 114 172" className="directional-miss-target-stripe" />
        </g>
      ) : (
        <g className="directional-miss-target-core">
          <ellipse className="directional-miss-green-main" cx="110" cy="110" rx="48" ry="38" />
          <ellipse className="directional-miss-target-ring" cx="110" cy="110" rx="34" ry="26" />
          <path d="M110 82V116" className="directional-miss-green-pin" />
          <path d="M110 84 L124 89 L110 94 Z" className="directional-miss-green-flag" />
          <circle cx="110" cy="116" r="3" />
        </g>
      )}
    </svg>
  );
}

function DirectionalMissSection({ model }: { model: DirectionalMissViewModel }) {
  return (
    <section className={`directional-miss-section is-${model.area}`} aria-labelledby={`${model.area}-miss-heading`}>
      <div className="directional-miss-section-header">
        <h4 id={`${model.area}-miss-heading`}>{model.title}</h4>
        {model.isLimited && <span className="directional-miss-limited">Limited data</span>}
      </div>

      {model.isEmpty ? (
        <p className="directional-miss-empty">
          No tracked {model.area === 'fairway' ? 'fairway' : 'green'} misses
        </p>
      ) : (
        <div className="directional-miss-grid">
          <dl className="directional-miss-values">
            {model.directions.map((direction) => (
              <div
                key={direction.key}
                className={`directional-miss-direction is-${direction.position} ${direction.isStrongest ? 'is-strongest' : ''}`}
              >
                <dt>{direction.label}</dt>
                <dd>{direction.displayPercentage}</dd>
              </div>
            ))}
          </dl>
          <DirectionalTargetGraphic area={model.area} directions={model.directions} />
        </div>
      )}
    </section>
  );
}

export default function MissTendenciesChart({ data }: MissTendenciesChartProps) {
  const fairway = buildDirectionalMissViewModel({
    area: 'fairway',
    keys: data?.keys,
    series: data?.fir,
  });
  const green = buildDirectionalMissViewModel({
    area: 'green',
    keys: data?.keys,
    series: data?.gir,
  });
  const isWholeCardEmpty = fairway.isEmpty && green.isEmpty;

  return (
    <div className="trend-card miss-tendencies-card">
      <h3>Miss Direction</h3>

      {isWholeCardEmpty ? (
        <div className="miss-tendencies-empty">
          <p className="miss-tendencies-empty-title">No tracked miss directions yet.</p>
          <p className="secondary-text">Record miss directions during rounds to see your tendencies.</p>
        </div>
      ) : (
        <div className="miss-tendencies-sections">
          <DirectionalMissSection model={fairway} />
          <div className="miss-tendencies-divider" aria-hidden="true" />
          <DirectionalMissSection model={green} />
        </div>
      )}
    </div>
  );
}
