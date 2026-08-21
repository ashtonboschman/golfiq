import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';

interface RoundCardProps {
  round: {
    id: number;
    club_name?: string;
    course_name?: string;
    city?: string;
    state?: string;
    tee_name?: string;
    number_of_holes?: number;
    net_score?: number | null;
    round_context?: 'real' | 'simulator' | 'practice' | 'scramble' | null;
    date: string;
    score: number | null;
    par?: number | null;
    fir_hit?: number | null;
    gir_hit?: number | null;
    putts?: number | null;
    penalties?: number | null;
    notes?: string | null;
  };
  showHoles?: boolean;
  disableClick?: boolean;
}

export default function RoundCard({
  round,
  showHoles = false,
  disableClick = false,
}: RoundCardProps) {
  const formatValue = (val: number | null | undefined) => val ?? '-';

  const formatToPar = (score: number | null | undefined, par: number | null | undefined) => {
    if (score === null || score === undefined || par === null || par === undefined) return '-';
    const diff = score - par;
    if (diff > 0) return `+${diff}`;
    if (diff < 0) return `${diff}`;
    return 'E';
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';

    // Parse date string to avoid timezone conversion issues
    // Date comes from API as ISO string, extract just the date part
    const datePart = dateStr.split('T')[0]; // "YYYY-MM-DD"
    const [year, month, day] = datePart.split('-').map(Number);

    // Create date at noon local time to avoid timezone shifts
    const date = new Date(year, month - 1, day, 12, 0, 0);

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const teeName = round.tee_name || 'default';
  const par = round.par ?? null;
  const locationLabel = [round.city, round.state].filter(Boolean).join(', ');
  const roundContext = round.round_context ?? 'real';
  const roundContextLabel =
    roundContext === 'simulator'
      ? 'SIM'
      : roundContext === 'practice'
        ? 'PRACTICE'
        : roundContext === 'scramble'
          ? 'SCRAMBLE'
          : null;

  const cardContent = (
    <>
      {/* Header */}
      <div>
        <div className={`roundcard-header${roundContextLabel && showHoles ? ' has-three-tags' : ''}`}>
          <div className="roundcard-header-left">
            <h3 className="roundcard-course-name">
              {round.club_name === round.course_name
                ? round.course_name
                : `${round.club_name} - ${round.course_name}` || '-'}
            </h3>
          </div>

          <div className="roundcard-header-right flex-row gap-small">
            {roundContextLabel && (
              <p className={`round-context-tag round-context-${roundContext}`}>{roundContextLabel}</p>
            )}
            <p className={`tee-tag tee-${teeName.toLowerCase()}`}>{teeName}</p>
            {showHoles && (
              <p className="round-holes-tag">{round.number_of_holes} Holes</p>
            )}
          </div>
        </div>
      </div>
      <div className="roundcard-summary">
        <div className="roundcard-meta">
          {locationLabel && (
            <span className="roundcard-meta-item">
              <MapPin size={14} aria-hidden="true" />
              {locationLabel}
            </span>
          )}
          <span className="roundcard-meta-item">
            <CalendarDays size={14} aria-hidden="true" />
            {formatDate(round.date)}
          </span>
        </div>

        <div
          className="roundcard-score-summary"
          aria-label={`Score ${formatValue(round.score)}, ${formatToPar(round.score, par)} to par`}
        >
          <div className="roundcard-score-values">
            <strong className="roundcard-score-value">{formatValue(round.score)}</strong>
            <span className="roundcard-to-par-value">{formatToPar(round.score, par)}</span>
          </div>
        </div>

        {!disableClick && (
          <div className="roundcard-details-icon" aria-hidden="true">
            <ChevronRight className="primary-text" />
          </div>
        )}
      </div>
    </>
  );

  if (disableClick) {
    return (
      <div className="card roundcard-card u-link-reset">
        {cardContent}
      </div>
    );
  }

  return (
    <Link href={`/rounds/${round.id}/stats`} className="card roundcard-card clickable u-link-reset">
      {cardContent}
    </Link>
  );
}
