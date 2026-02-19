import { Edit, Info, Sparkles, Trash2 } from 'lucide-react';
import { SkeletonBlock, SkeletonCard, SkeletonCircle, SkeletonText } from '@/components/skeleton/Skeleton';

type RoundListSkeletonProps = {
  count?: number;
  metricCount?: number;
  showHolesTag?: boolean;
  useGridList?: boolean;
};

export function RoundListSkeleton({
  count = 4,
  metricCount = 8,
  showHolesTag = true,
  useGridList = false,
}: RoundListSkeletonProps) {
  const containerClassName = useGridList ? 'grid grid-1' : 'skeleton-stack';

  return (
    <div className={containerClassName} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={`round-skeleton-wrap-${index}`}>
          <SkeletonCard
            key={`round-skeleton-${index}`}
            className={`skeleton-round-card${metricCount > 4 ? ' skeleton-round-card-advanced' : ''}`}
          >
            <div className="skeleton-round-top">
              <div className="roundcard-header">
                <div className="roundcard-header-left">
                  <SkeletonBlock className="skeleton-round-title" height={20} />
                </div>
                <div className="roundcard-header-right flex-row gap-small">
                  <SkeletonBlock className="skeleton-tee-tag" height={22} />
                  {showHolesTag && <SkeletonBlock className="skeleton-holes-tag" height={22} />}
                </div>
              </div>
              <div className="roundcard-header-info">
                <SkeletonBlock className="skeleton-round-location" height={14} />
                <SkeletonBlock className="skeleton-round-date" height={14} />
              </div>
            </div>
            <div className="roundcard-bottom skeleton-round-bottom">
              <div className={`grid grid-4${metricCount > 4 ? ' skeleton-round-grid-advanced' : ''}`}>
                {Array.from({ length: metricCount }).map((__, metricIndex) => (
                  <SkeletonBlock key={`metric-${metricIndex}`} className="skeleton-round-metric" height={20} />
                ))}
              </div>
              <div className="roundcard-bottom-right">
                <SkeletonCircle size={18} />
              </div>
            </div>
          </SkeletonCard>
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonBlock className="skeleton-btn" height={44} />

      <div className="dashboard-filters">
        <div>
          <SkeletonBlock className="skeleton-select" />
        </div>
        <div>
          <SkeletonBlock className="skeleton-select" />
        </div>
      </div>
      <SkeletonBlock className="skeleton-note-line" height={12} />

      <div className="grid grid-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={`dash-stat-${index}`} className="card dashboard-stat-card skeleton-dashboard-stat-card">
            <SkeletonBlock className="skeleton-dashboard-stat-title" height={20} />
            <SkeletonBlock className="skeleton-dashboard-stat-value" height={38} />
          </div>
        ))}
      </div>

      <div className="trend-card" style={{ height: 300 }}>
        <SkeletonBlock className="skeleton-trend-title" height={18} />
        <SkeletonBlock className="skeleton-chart-area" />
      </div>

      <div className="section">
        <SkeletonCard className="last-five-rounds-card">
          <SkeletonBlock width={120} height={22} style={{ marginInline: 'auto' }} />
        </SkeletonCard>
        <RoundListSkeleton count={5} metricCount={8} showHolesTag={false} />
      </div>
      <SkeletonBlock className="skeleton-btn" height={44} />
    </div>
  );
}

export function InsightsSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonCard className="insights-card">
        <div className="insights-header">
          <div className="skeleton-row">
            <SkeletonCircle size={20} />
            <SkeletonBlock width={170} height={18} />
          </div>
          <SkeletonBlock width={78} height={24} />
        </div>
        <div className="overall-insights-meta">
          <SkeletonBlock className="skeleton-insights-updated" height={14} />
          <SkeletonBlock className="skeleton-insights-meta-button" height={40} />
        </div>
        <div className="insights-content">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`insight-message-skeleton-${index}`} className="insight-message">
              <div className="insight-message-content skeleton-insight-message-content">
                <SkeletonCircle size={16} />
                <SkeletonText className="round-insights-line" lines={1} lineHeight={14} />
              </div>
            </div>
          ))}
        </div>
      </SkeletonCard>

      <div className="dashboard-filters">
        <div>
          <SkeletonBlock className="skeleton-select" />
        </div>
      </div>
      <SkeletonBlock className="skeleton-note-line" height={12} />

      <div className="grid grid-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={`insights-kpi-${index}`} className="card dashboard-stat-card skeleton-dashboard-stat-card">
            <SkeletonBlock className="skeleton-dashboard-stat-title" height={20} />
            <SkeletonBlock className="skeleton-dashboard-stat-value" height={30} />
            <SkeletonBlock className="skeleton-note-line" height={12} />
          </div>
        ))}
      </div>

      <div className="trend-card" style={{ height: 300 }}>
        <SkeletonBlock className="skeleton-trend-title" height={18} />
        <SkeletonBlock className="skeleton-chart-area" />
      </div>

      <div className="trend-card" style={{ height: 300 }}>
        <SkeletonBlock className="skeleton-trend-title" height={18} />
        <SkeletonBlock className="skeleton-chart-area" />
      </div>

      <div className="grid grid-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`insights-perf-${index}`} className="card dashboard-stat-card skeleton-dashboard-stat-card">
            <SkeletonBlock className="skeleton-dashboard-stat-title" height={20} />
            <SkeletonBlock className="skeleton-chart-area-short" />
            <SkeletonBlock className="skeleton-note-line" height={12} />
          </div>
        ))}
      </div>

      <SkeletonCard className="trajectory-card">
        <SkeletonBlock width="42%" height={20} />
        <SkeletonBlock width="55%" height={26} />
        <div className="trajectory-pill-grid">
          <SkeletonBlock height={56} />
          <SkeletonBlock height={56} />
        </div>
      </SkeletonCard>
    </div>
  );
}

export function RoundsSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonBlock className="skeleton-btn" height={44} />
      <SkeletonBlock className="skeleton-input" />
      <RoundListSkeleton count={12} useGridList />
    </div>
  );
}

export function RoundInsightsSkeleton() {
  return (
    <div className="card insights-card skeleton-stack" aria-busy="true">
      <div className="insights-header">
        <div className="insights-title">
          <Sparkles size={20} />
          <h3>Performance Insights</h3>
        </div>
        <SkeletonBlock width={78} height={24} style={{ borderRadius: 999 }} />
      </div>
      <div className="insights-content">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`round-insight-message-skeleton-${index}`} className="insight-message insight-message-skeleton">
            <div className="insight-message-content skeleton-insight-message-content">
              <SkeletonText className="round-insights-line" lines={2} lineHeight={14} lastLineWidth="88%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CoursesSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonBlock className="skeleton-input" />
      <CourseListSkeleton count={16} />
    </div>
  );
}

export function CourseListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-1" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={`course-skeleton-${index}`} className="course-card skeleton-course-card">
          <div className="course-card-top">
            <SkeletonBlock width="62%" height={20} />
            <SkeletonBlock className="skeleton-holes-tag" height={22} />
          </div>
          <SkeletonBlock width="44%" height={14} />
          <div className="course-card-bottom">
            <div className="course-card-bottom-left">
              <SkeletonBlock width="15%" height={12} />
            </div>
            <div className="course-card-bottom-right">
              <SkeletonCircle size={18} />
            </div>
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <div className="stats-tabs">
        <SkeletonBlock height={44} />
        <SkeletonBlock height={44} />
      </div>
      <SkeletonCard>
        <div className="leaderboard-row">
          <div className="leaderboard-cell">
            <SkeletonBlock width={14} height={14} />
          </div>
          <div className="leaderboard-cell">
            <SkeletonBlock width={56} height={14} />
          </div>
          <div className="leaderboard-cell">
            <SkeletonBlock width={28} height={14} style={{ marginInline: 'auto' }} />
          </div>
          <div className="leaderboard-cell">
            <SkeletonBlock width={28} height={14} style={{ marginInline: 'auto' }} />
          </div>
          <div className="leaderboard-cell">
            <SkeletonBlock width={28} height={14} style={{ marginInline: 'auto' }} />
          </div>
        </div>
      </SkeletonCard>
      <LeaderboardRowsSkeleton count={25} />
    </div>
  );
}

export function LeaderboardRowsSkeleton({ count = 25 }: { count?: number }) {
  return (
    <div className="grid grid-1" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={`leaderboard-skeleton-${index}`} className="leaderboard-card">
          <div className="leaderboard-row">
            <div className="leaderboard-cell left">
              <SkeletonBlock width={14} height={16} />
            </div>
            <div className="leaderboard-cell left">
              <div className="avatar-name-wrapper">
                <SkeletonCircle className="leaderboard-avatar" size={32} />
                <div className="name-stack">
                  <SkeletonBlock width={70} height={14} />
                  <SkeletonBlock width={20} height={14} />
                </div>
              </div>
            </div>
            <div className="leaderboard-cell centered">
              <SkeletonBlock width={36} height={14} style={{ marginInline: 'auto' }} />
            </div>
            <div className="leaderboard-cell centered">
              <SkeletonBlock width={36} height={14} style={{ marginInline: 'auto' }} />
            </div>
            <div className="leaderboard-cell centered">
              <SkeletonBlock width={36} height={14} style={{ marginInline: 'auto' }} />
            </div>
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

export function FriendsSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonBlock className="skeleton-btn" height={44} />
      {Array.from({ length: 2 }).map((_, cardIndex) => (
        <SkeletonCard key={`friends-card-skeleton-${cardIndex}`}>
          <SkeletonBlock width="34%" height={18} />
          {Array.from({ length: 4 }).map((__, rowIndex) => (
            <div key={`friends-row-${cardIndex}-${rowIndex}`} className="skeleton-row">
              <SkeletonCircle size={34} />
              <div style={{ flex: 1 }}>
                <SkeletonBlock width="44%" height={14} />
              </div>
              <SkeletonBlock width={78} height={30} />
            </div>
          ))}
        </SkeletonCard>
      ))}
    </div>
  );
}

export function FriendsAddSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonBlock className="skeleton-input" />
      {Array.from({ length: 8 }).map((_, index) => (
        <SkeletonCard key={`friends-add-row-${index}`}>
          <div className="skeleton-row" style={{ justifyContent: 'space-between' }}>
            <div className="skeleton-row">
              <SkeletonCircle size={34} />
              <SkeletonBlock width={140} height={14} />
            </div>
            <SkeletonBlock width={88} height={30} />
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

export function PricingSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <div className="pricing-tabs">
        <SkeletonBlock height={42} />
        <SkeletonBlock height={42} />
        <SkeletonBlock height={42} />
      </div>
      <SkeletonCard>
        <SkeletonBlock width="32%" height={22} />
        <SkeletonBlock width="24%" height={32} />
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={`pricing-feature-${index}`} className="skeleton-row">
            <SkeletonCircle size={14} />
            <SkeletonBlock width="80%" height={12} />
          </div>
        ))}
        <SkeletonBlock className="skeleton-btn" height={44} />
      </SkeletonCard>
      <div className="grid grid-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={`pricing-faq-${index}`}>
            <SkeletonBlock width="48%" height={16} />
            <SkeletonBlock width="100%" height={12} />
            <SkeletonBlock width="90%" height={12} />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

export function CoursesSearchSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonCard>
        <SkeletonBlock width="24%" height={18} />
        <SkeletonBlock width="92%" height={12} />
        <SkeletonBlock width="88%" height={12} />
        <div className="skeleton-row">
          <div style={{ flex: 1 }}>
            <SkeletonBlock className="skeleton-input" />
          </div>
          <SkeletonBlock width={120} height={42} />
        </div>
      </SkeletonCard>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonCard>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SkeletonCircle size={180} />
        </div>
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={`profile-field-${index}`}>
            <SkeletonBlock width="26%" height={12} />
            <SkeletonBlock className="skeleton-input" style={{ marginTop: 6 }} />
          </div>
        ))}
        <div className="grid grid-2">
          <SkeletonBlock className="skeleton-btn" height={42} />
          <SkeletonBlock className="skeleton-btn" height={42} />
        </div>
      </SkeletonCard>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <SkeletonCard key={`settings-skeleton-${index}`}>
          <SkeletonBlock width="28%" height={16} />
          <SkeletonBlock width="78%" height={12} />
          <SkeletonBlock className="skeleton-btn" height={42} />
        </SkeletonCard>
      ))}
    </div>
  );
}

export function CourseDetailsSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonBlock className="skeleton-btn" height={44} />
      <SkeletonCard className="course-card">
        <SkeletonBlock width="42%" height={20} />
        <SkeletonBlock width="34%" height={14} />
        <SkeletonBlock width="56%" height={14} />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonBlock width="20%" height={12} />
        <SkeletonBlock className="skeleton-select" />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonBlock width="68%" height={16} />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonBlock width="100%" height={220} />
      </SkeletonCard>
    </div>
  );
}

export function UserDetailsSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonCard>
        <div className="skeleton-row">
          <SkeletonCircle size={64} />
          <div style={{ flex: 1 }}>
            <SkeletonBlock width="42%" height={16} />
            <SkeletonBlock width="28%" height={12} style={{ marginTop: 8 }} />
          </div>
        </div>
      </SkeletonCard>
      <SkeletonCard>
        <div className="grid grid-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={`user-stat-${index}`} height={52} />
          ))}
        </div>
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonBlock className="skeleton-btn" height={42} />
      </SkeletonCard>
    </div>
  );
}

export function RoundFormSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonCard>
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={`round-form-field-${index}`}>
            <SkeletonBlock width="22%" height={12} />
            <SkeletonBlock className={index < 5 ? 'skeleton-select' : 'skeleton-input'} style={{ marginTop: 6 }} />
          </div>
        ))}
        <SkeletonBlock width="100%" height={72} />
        <SkeletonBlock className="skeleton-btn" height={44} />
      </SkeletonCard>
      <div className="grid grid-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonCard key={`hole-skeleton-${index}`}>
            <SkeletonBlock width="36%" height={16} />
            <div className="grid grid-2">
              {Array.from({ length: 4 }).map((__, fieldIndex) => (
                <SkeletonBlock key={`hole-field-${index}-${fieldIndex}`} height={38} />
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

export function RoundStatsPageSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonCard>
        <div className="stats-header">
          <div className="stats-header-container">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 420, minWidth: 0 }}>
              <SkeletonBlock width="78%" height={28} />
              <SkeletonBlock width="50%" height={14} />
            </div>
            <div className="stats-holes-tees-container">
              <SkeletonBlock className="skeleton-holes-tag" height={22} />
              <SkeletonBlock className="skeleton-tee-tag" height={22} />
              <SkeletonBlock width={62} height={22} style={{ borderRadius: 999 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-edit" disabled>
              <Edit />
            </button>
            <button className="btn btn-cancel" disabled>
              <Trash2 />
            </button>
          </div>
        </div>

        <div className="stats-score-summary">
          <div className="stats-summary-header">
            <h3 className="stats-summary-title">Round Summary</h3>
          </div>
          <div className="stats-score-grid">
            {['Total Score', 'vs Par', 'FIR', 'GIR', 'Putts/Hole', 'Penalties'].map((label, index) => (
              <div key={`round-score-summary-${index}`}>
                <SkeletonBlock width="44%" height={29} style={{ marginInline: 'auto' }} />
                <div className="stats-score-label" style={{ marginTop: 6 }}>
                  {label}
                </div>
                {(index === 1 || index === 4) && (
                  <SkeletonBlock width="26%" height={12} style={{ marginInline: 'auto', marginTop: 4 }} />
                )}
              </div>
            ))}
          </div>
        </div>

        <RoundInsightsSkeleton />

        <div className="stats-score-summary">
          <div className="stats-summary-header">
            <h3 className="stats-summary-title">Strokes Gained</h3>
            <span className="info-tooltip-container" aria-hidden="true">
              <span className="info-tooltip-icon">
                <Info />
              </span>
            </span>
          </div>
          <div className="stats-score-grid">
            {['Total', 'Off Tee', 'Approach', 'Putting', 'Penalties', 'Residual'].map((label, index) => (
              <div key={`round-sg-summary-${index}`}>
                <SkeletonBlock width="44%" height={29} style={{ marginInline: 'auto' }} />
                <div className="stats-score-label" style={{ marginTop: 6 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="form">
          <button className="btn btn-add" disabled>
            Back to Rounds
          </button>
          <button className="btn btn-add" disabled>
            Back to Dashboard
          </button>
        </div>
      </SkeletonCard>
    </div>
  );
}

export function AdminPanelSkeleton() {
  return (
    <div className="page-stack skeleton-stack" aria-busy="true">
      <SkeletonCard>
        <SkeletonBlock width="30%" height={18} />
        <SkeletonBlock className="skeleton-input" />
        <SkeletonBlock className="skeleton-input" />
        <SkeletonBlock className="skeleton-btn" height={42} />
      </SkeletonCard>
      <SkeletonCard>
        <SkeletonBlock width="34%" height={18} />
        <SkeletonBlock width="100%" height={220} />
      </SkeletonCard>
    </div>
  );
}

export function AuthCardSkeleton() {
  return (
    <div className="login-stack skeleton-stack" aria-busy="true">
      <SkeletonCard className="login-card">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SkeletonCircle size={56} />
        </div>
        <SkeletonBlock width="42%" height={18} style={{ marginInline: 'auto' }} />
        <SkeletonBlock width="72%" height={12} style={{ marginInline: 'auto' }} />
      </SkeletonCard>
    </div>
  );
}
