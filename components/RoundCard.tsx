import { ChevronRight, Edit, MapPin, Trash2 } from 'lucide-react';
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
  showAdvanced?: boolean;
  disableClick?: boolean;
}

export default function RoundCard({
  round,
  showAdvanced = false,
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

  const cardContent = (
    <>
      {/* Header */}
      <div>
        <div className="roundcard-header">
          <div className="roundcard-header-left">
            <h3 className="roundcard-course-name">
              {round.club_name === round.course_name
                ? round.course_name
                : `${round.club_name} - ${round.course_name}` || '-'}
            </h3>
          </div>

          <div className="roundcard-header-right flex-row gap-small">
            <p className={`tee-tag tee-${teeName.toLowerCase()}`}>{teeName}</p>
            {showHoles && (
              <p className="round-holes-tag">{round.number_of_holes} Holes</p>
            )}
          </div>
        </div>
        <div className="roundcard-header-info">
          <h5 className="roundcard-city"><MapPin size='14'/> {round.city + ', ' + round.state || '-'}</h5>
          <span className="round-date">{formatDate(round.date)}</span>
        </div>
      </div>
      <div className='roundcard-bottom'>
        {/* Info Grid */}
        <div className="grid grid-4">
          <div className="roundcard-info-row">
            <strong>Score</strong> {formatValue(round.score)}
          </div>
          <div className="roundcard-info-row">
            <strong>To Par</strong> {formatToPar(round.score, par)}
          </div>
          <div className="roundcard-info-row">
            <strong>Net</strong> {formatToPar(round.net_score, par)}
          </div>
          <div className="roundcard-info-row">
            <strong>Par</strong> {formatValue(par)}
          </div>
          {showAdvanced && (
            <div className="roundcard-info-row">
              <strong>FIR</strong> {formatValue(round.fir_hit)}
            </div>
          )}
          {showAdvanced && (
            <div className="roundcard-info-row">
              <strong>GIR</strong> {formatValue(round.gir_hit)}
            </div>
          )}
          {showAdvanced && (
            <div className="roundcard-info-row">
              <strong>Putts</strong> {formatValue(round.putts)}
            </div>
          )}
          {showAdvanced && (
            <div className="roundcard-info-row">
              <strong>Pen</strong> {formatValue(round.penalties)}
            </div>
          )}
        </div>
        {!disableClick && (
          <div  className='roundcard-bottom-right'>
            <ChevronRight className='primary-text'/>
          </div>
        )}
      </div>

      {round.notes && (
        <div className="roundcard-notes">
          <strong>Notes</strong> {round.notes}
        </div>
      )}
    </>
  );

  if (disableClick) {
    return (
      <div className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
        {cardContent}
      </div>
    );
  }

  return (
    <Link href={`/rounds/${round.id}/stats`} className="card clickable" style={{ textDecoration: 'none', color: 'inherit' }}>
      {cardContent}
    </Link>
  );
}
