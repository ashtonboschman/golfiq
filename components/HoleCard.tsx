import { memo } from 'react';
import BinaryNullToggle from './BinaryNullToggle';

interface HoleCardProps {
  hole: number;
  par: number | null;
  score: number | null;
  fir_hit: number | null;
  gir_hit: number | null;
  putts: number | null;
  penalties: number | null;
  hasAdvanced: boolean;
  onChange: (hole: number, field: string, value: any) => void;
}

const sanitizeNumeric = (val: string | number | null) => {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\D/g, '');
};

const clampValue = (field: string, rawValue: string): number | null => {
  const maxMap: Record<string, number> = {
    score: 15,
    putts: 6,
    penalties: 4,
  };

  const sanitized = sanitizeNumeric(rawValue);
  if (sanitized === '') return null;

  const numericValue = Number(sanitized);
  return Math.min(numericValue, maxMap[field] ?? Infinity);
};

const HoleCard = memo(({
  hole,
  par,
  score,
  fir_hit,
  gir_hit,
  putts,
  penalties,
  hasAdvanced,
  onChange,
}: HoleCardProps) => {
  return (
    <div className="card hole-card">
      <div className="hole-header">Hole {hole}</div>

      {/* Always render base row */}
      <div className="hole-card-grid">
        <div className="hole-field">
          <label className="form-label">Par:</label>
          <input
            className="hole-card-input"
            type="text"
            name="Par"
            value={par ?? ''}
            min="0"
            disabled
          />
        </div>

        <div className="hole-field">
          <label className="form-label">Score:</label>
          <input
            className="hole-card-input"
            type="text"
            pattern="[0-9]*"
            name="Score"
            value={score ?? ''}
            onChange={(e) =>
              onChange(hole, 'score', clampValue('score', e.target.value))
            }
          />
        </div>
      </div>

      {/* Advanced stats only */}
      {hasAdvanced && (
        <>
          <div className="hole-card-grid">
            <div className="hole-field">
              <label className="form-label">FIR:</label>
              <BinaryNullToggle
                value={fir_hit}
                onChange={(val) => onChange(hole, 'fir_hit', val)}
                disabled={par === 3}
              />
            </div>

            <div className="hole-field">
              <label className="form-label">Putts:</label>
              <input
                className="hole-card-input"
                type="text"
                pattern="[0-9]*"
                name="Putts"
                value={putts ?? ''}
                onChange={(e) =>
                  onChange(hole, 'putts', clampValue('putts', e.target.value))
                }
              />
            </div>
          </div>

          <div className="hole-card-grid">
            <div className="hole-field">
              <label className="form-label">GIR:</label>
              <BinaryNullToggle
                value={gir_hit}
                onChange={(val) => onChange(hole, 'gir_hit', val)}
              />
            </div>

            <div className="hole-field">
              <label className="form-label">Penalties:</label>
              <input
                className="hole-card-input"
                type="text"
                pattern="[0-9]*"
                name="Penalties"
                value={penalties ?? ''}
                onChange={(e) =>
                  onChange(hole, 'penalties', clampValue('penalties', e.target.value))
                }
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
});

HoleCard.displayName = 'HoleCard';

export default HoleCard;
