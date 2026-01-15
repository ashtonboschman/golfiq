import { Edit, MapPin, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface RoundCardProps {
  round: {
    id: number;
    club_name?: string;
    course_name?: string;
    city?: string;
    tee_name?: string;
    date: string;
    score: number | null;
    par?: number | null;
    fir_hit?: number | null;
    gir_hit?: number | null;
    putts?: number | null;
    penalties?: number | null;
    notes?: string | null;
  };
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  showActions?: boolean;
  showAdvanced?: boolean;
}

export default function RoundCard({
  round,
  onEdit,
  onDelete,
  showActions = true,
  showAdvanced = false,
}: RoundCardProps) {
  const formatValue = (val: number | null | undefined) => val ?? '-';

  const formatToPar = (score: number | null, par: number | null | undefined) => {
    if (score === null || par === null || par === undefined) return '-';
    const diff = score - par;
    return diff > 0 ? `+${diff}` : diff.toString();
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

  const handleButtonClick = (e: React.MouseEvent, callback: (id: number) => void) => {
    e.preventDefault();
    e.stopPropagation();
    callback(round.id);
  };

  return (
    <Link href={`/rounds/${round.id}/stats`} className="card clickable" style={{ textDecoration: 'none', color: 'inherit' }}>
      {/* Header */}
      <div className="roundcard-header">
        <div className="roundcard-header-text">
          <h3 className="roundcard-course-name">{round.club_name == round.course_name ? round.course_name : round.club_name + ' - ' + round.course_name || '-'}</h3>
          <h5 className="roundcard-city"><MapPin size='14'/> {round.city || '-'}</h5>
          <div className="roundcard-header-info">
            <span className={`tee-tag tee-${teeName.toLowerCase()}`}>{teeName}</span>
            <span className="round-date">{formatDate(round.date)}</span>
          </div>
        </div>

        {showActions && onEdit && onDelete && (
          <div className="roundcard-button-group">
            <button
              onClick={(e) => handleButtonClick(e, onEdit)}
              className="btn btn-edit"
            >
              <Edit/>
            </button>
            <button
              onClick={(e) => handleButtonClick(e, onDelete)}
              className="btn btn-cancel"
            >
              <Trash2/>
            </button>
          </div>
        )}
      </div>

      {/* Info Grid */}
      <div className="grid grid-3">
        <div className="roundcard-info-row">
          <strong>To Par:</strong> {formatToPar(round.score, par)}
        </div>
        <div className="roundcard-info-row">
          <strong>Score:</strong> {formatValue(round.score)}
        </div>
        <div className="roundcard-info-row">
          <strong>Par:</strong> {formatValue(par)}
        </div>
        {showAdvanced && (
          <div className="roundcard-info-row">
            <strong>FIR:</strong> {formatValue(round.fir_hit)}
          </div>
        )}
        {showAdvanced && (
          <div className="roundcard-info-row">
            <strong>GIR:</strong> {formatValue(round.gir_hit)}
          </div>
        )}
        {showAdvanced && (
          <div className="roundcard-info-row">
            <strong>Putts:</strong> {formatValue(round.putts)}
          </div>
        )}
        {showAdvanced && (
          <div className="roundcard-info-row">
            <strong>Penalties:</strong> {formatValue(round.penalties)}
          </div>
        )}
      </div>

      {round.notes && (
        <div className="roundcard-notes">
          <strong>Notes:</strong> {round.notes}
        </div>
      )}
    </Link>
  );
}
