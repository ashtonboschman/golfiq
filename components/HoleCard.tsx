import { memo, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import BinaryNullToggle from './BinaryNullToggle';

interface HoleCardProps {
  hole: number;
  par: number | null;
  score: number | null;
  fir_hit: number | null;
  gir_hit: number | null;
  putts: number | null;
  penalties: number | null;
  isExpanded?: boolean;
  isCompleted?: boolean;
  onChange: (hole: number, field: string, value: any) => void;
  onToggleExpand?: (hole: number) => void;
  onNext?: () => void;
}

const HoleCard = memo(({
  hole,
  par,
  score,
  fir_hit,
  gir_hit,
  putts,
  penalties,
  isExpanded = true,
  isCompleted = false,
  onChange,
  onToggleExpand,
  onNext,
}: HoleCardProps) => {
  // Local state for uncommitted changes
  const [localScore, setLocalScore] = useState<number | null>(score);
  const [localFirHit, setLocalFirHit] = useState<number | null>(fir_hit);
  const [localGirHit, setLocalGirHit] = useState<number | null>(gir_hit);
  const [localPutts, setLocalPutts] = useState<number | null>(putts);
  const [localPenalties, setLocalPenalties] = useState<number | null>(penalties);

  const syncLocalStateFromProps = () => {
    setLocalScore(score ?? par);
    setLocalFirHit(fir_hit);
    setLocalGirHit(gir_hit);
    setLocalPutts(putts);
    setLocalPenalties(penalties);
  };

  // Commit all local changes to parent
  const handleCommit = () => {
    onChange(hole, 'score', localScore);
    onChange(hole, 'fir_hit', localFirHit);
    onChange(hole, 'gir_hit', localGirHit);
    onChange(hole, 'putts', localPutts);
    onChange(hole, 'penalties', localPenalties);
    onNext?.();
  };

  // Stepper handlers - update local state only
  const handleStepperChange = (field: string, delta: number) => {
    let currentValue: number | null = null;
    let setValue: (value: number | null) => void = () => {};

    switch (field) {
      case 'score':
        currentValue = localScore;
        setValue = setLocalScore;
        break;
      case 'putts':
        currentValue = localPutts;
        setValue = setLocalPutts;
        break;
      case 'penalties':
        currentValue = localPenalties;
        setValue = setLocalPenalties;
        break;
      default:
        break;
    }

    let newValue: number | null;

    if (field === 'score' && currentValue === null) {
      // Default score to par
      newValue = (par ?? 4) + delta;
    } else if (field === 'putts' && currentValue === null) {
      // Wake-up logic for putts: first + goes to 2, first - goes to 1
      newValue = delta > 0 ? 2 : 1;
    } else if (field === 'putts' && currentValue === 0 && delta < 0) {
      // Allow minus at 0 to return to null
      setValue(null);
      return;
    } else if (field === 'penalties' && currentValue === null) {
      // Wake-up logic for penalties: goes to 0 then can increment/decrement
      newValue = Math.max(0, delta);
    } else if (field === 'penalties' && currentValue === 0 && delta < 0) {
      // Allow minus at 0 to return to null
      setValue(null);
      return;
    } else if (currentValue === null) {
      newValue = Math.max(0, delta);
    } else {
      newValue = currentValue + delta;
    }

    // Apply bounds
    const bounds: Record<string, { min: number; max: number }> = {
      score: { min: 1, max: 15 },
      putts: { min: 0, max: 6 },
      penalties: { min: 0, max: 4 },
    };

    const { min, max } = bounds[field] || { min: 0, max: 99 };
    newValue = Math.max(min, Math.min(newValue, max));

    setValue(newValue);
  };

  const displayValue = (val: number | null) => (val === null ? '--' : val);

  const handleHeaderClick = () => {
    if (!isExpanded) {
      syncLocalStateFromProps();
    }
    onToggleExpand?.(hole);
  };

  return (
    <div className={`accordion-hole-card ${isExpanded ? 'expanded' : 'collapsed'} ${isCompleted ? 'completed' : ''}`}>
      {/* Header - always visible */}
      <div
        className="accordion-hole-header"
        onClick={handleHeaderClick}
        style={{ cursor: onToggleExpand ? 'pointer' : 'default' }}
      >
        <div className="accordion-hole-header-left">
          {isCompleted && <Check className="completion-check" />}
          <span className="accordion-hole-number">Hole {hole}</span>
          <span className="accordion-hole-par">Par {par ?? '-'}</span>
        </div>
        <div className="accordion-hole-header-right">
          {!isExpanded && isCompleted && score !== null && (
            <span className="accordion-hole-summary">
              Score: {score}{putts !== null && ` - Putts: ${putts}`}
            </span>
          )}
          {onToggleExpand && (
            isExpanded ? <ChevronUp className="accordion-icon" /> : <ChevronDown className="accordion-icon" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="accordion-hole-content">
          {/* Score - always shown */}
          <div className="stepper-field">
            <label className="stepper-label">Score</label>
            <div className="stepper-controls">
              <button
                type="button"
                className="stepper-btn stepper-minus"
                onClick={() => handleStepperChange('score', -1)}
                disabled={(localScore ?? par ?? 4) <= 1}
              >
                -
              </button>
              <div className="stepper-value">{displayValue(localScore)}</div>
              <button
                type="button"
                className="stepper-btn stepper-plus"
                onClick={() => handleStepperChange('score', 1)}
                disabled={(localScore ?? par ?? 4) >= 15}
              >
                +
              </button>
            </div>
          </div>

          {/* FIR */}
          <div className="stepper-field">
            <label className="stepper-label">Fairway In Regulation</label>
            <BinaryNullToggle
              value={localFirHit}
              onChange={setLocalFirHit}
              disabled={par === 3}
            />
          </div>

          {/* GIR */}
          <div className="stepper-field">
            <label className="stepper-label">Green In Regulation</label>
            <BinaryNullToggle
              value={localGirHit}
              onChange={setLocalGirHit}
            />
          </div>

          {/* Putts */}
          <div className="stepper-field">
            <label className="stepper-label">Putts</label>
            <div className="stepper-controls">
              <button
                type="button"
                className="stepper-btn stepper-minus"
                onClick={() => handleStepperChange('putts', -1)}
              >
                -
              </button>
              <div className="stepper-value">{displayValue(localPutts)}</div>
              <button
                type="button"
                className="stepper-btn stepper-plus"
                onClick={() => handleStepperChange('putts', 1)}
                disabled={localPutts !== null && localPutts >= 6}
              >
                +
              </button>
            </div>
          </div>

          {/* Penalties */}
          <div className="stepper-field">
            <label className="stepper-label">Penalties</label>
            <div className="stepper-controls">
              <button
                type="button"
                className="stepper-btn stepper-minus"
                onClick={() => handleStepperChange('penalties', -1)}
              >
                -
              </button>
              <div className="stepper-value">{displayValue(localPenalties)}</div>
              <button
                type="button"
                className="stepper-btn stepper-plus"
                onClick={() => handleStepperChange('penalties', 1)}
                disabled={localPenalties !== null && localPenalties >= 4}
              >
                +
              </button>
            </div>
          </div>

          {/* Next Button - only show if onNext is provided */}
          {onNext && (
            <button
              type="button"
              className="btn btn-accent btn-accordion-next"
              onClick={handleCommit}
            >
              Next Hole
            </button>
          )}
        </div>
      )}
    </div>
  );
});

HoleCard.displayName = 'HoleCard';

export default HoleCard;
