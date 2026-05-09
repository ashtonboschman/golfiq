import { memo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';

type MissDirection = 'miss_left' | 'miss_right' | 'miss_short' | 'miss_long';
type DirectionalResult = 'untracked' | 'hit' | MissDirection;
const ACCORDION_ICON_SIZE = 24;

interface HoleCardProps {
  hole: number;
  par: number | null;
  score: number | null;
  fir_hit: number | null;
  fir_direction?: MissDirection | null;
  gir_hit: number | null;
  gir_direction?: MissDirection | null;
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
  fir_direction = null,
  gir_hit,
  gir_direction = null,
  putts,
  penalties,
  isExpanded = true,
  isCompleted = false,
  onChange,
  onToggleExpand,
  onNext,
}: HoleCardProps) => {
  // Local state for uncommitted changes
  const [localScore, setLocalScore] = useState<number | null>(score ?? par);
  const [localFirHit, setLocalFirHit] = useState<number | null>(fir_hit);
  const [localFirDirection, setLocalFirDirection] = useState<MissDirection | null>(fir_direction);
  const [localGirHit, setLocalGirHit] = useState<number | null>(gir_hit);
  const [localGirDirection, setLocalGirDirection] = useState<MissDirection | null>(gir_direction);
  const [localPutts, setLocalPutts] = useState<number | null>(putts);
  const [localPenalties, setLocalPenalties] = useState<number | null>(penalties);

  const syncLocalStateFromProps = () => {
    setLocalScore(score ?? par);
    setLocalFirHit(fir_hit);
    setLocalFirDirection(fir_direction);
    setLocalGirHit(gir_hit);
    setLocalGirDirection(gir_direction);
    setLocalPutts(putts);
    setLocalPenalties(penalties);
  };

  const resolveDirectionalResult = (
    hit: number | null,
    direction: MissDirection | null,
  ): DirectionalResult => {
    if (hit === 1) return 'hit';
    if (hit === 0 && direction != null) return direction;
    return 'untracked';
  };

  const handleDirectionalResultChange = (
    area: 'fir' | 'gir',
    result: DirectionalResult,
  ) => {
    const currentResult = area === 'fir'
      ? resolveDirectionalResult(localFirHit, localFirDirection)
      : resolveDirectionalResult(localGirHit, localGirDirection);
    const next = currentResult === result ? 'untracked' : result;

    if (area === 'fir') {
      if (next === 'untracked') {
        setLocalFirHit(null);
        setLocalFirDirection(null);
        return;
      }
      if (next === 'hit') {
        setLocalFirHit(1);
        setLocalFirDirection(null);
        return;
      }
      setLocalFirHit(0);
      setLocalFirDirection(next);
      return;
    }

    if (next === 'untracked') {
      setLocalGirHit(null);
      setLocalGirDirection(null);
      return;
    }
    if (next === 'hit') {
      setLocalGirHit(1);
      setLocalGirDirection(null);
      return;
    }
    setLocalGirHit(0);
    setLocalGirDirection(next);
  };

  // Commit all local changes to parent
  const handleCommit = () => {
    onChange(hole, 'score', localScore);
    onChange(hole, 'fir_hit', localFirHit);
    onChange(hole, 'fir_direction', localFirHit === 0 && par !== 3 ? localFirDirection : null);
    onChange(hole, 'gir_hit', localGirHit);
    onChange(hole, 'gir_direction', localGirHit === 0 ? localGirDirection : null);
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

  const renderDirectionalResultControl = (args: {
    area: 'fir' | 'gir';
    hit: number | null;
    direction: MissDirection | null;
    disabled?: boolean;
  }) => {
    const selected = resolveDirectionalResult(args.hit, args.direction);
    const prefix = args.area === 'fir' ? 'FIR' : 'GIR';

    const buttons: Array<{
      result: DirectionalResult;
      label: string;
      className: string;
      icon: ReactNode;
    }> = [
      { result: 'miss_long', label: 'Long', className: 'pos-up', icon: <ChevronUp size={ACCORDION_ICON_SIZE} /> },
      { result: 'miss_left', label: 'Left', className: 'pos-left', icon: <ChevronLeft size={ACCORDION_ICON_SIZE} /> },
      { result: 'hit', label: 'Hit', className: 'pos-center', icon: <Check size={ACCORDION_ICON_SIZE} /> },
      { result: 'miss_right', label: 'Right', className: 'pos-right', icon: <ChevronRight size={ACCORDION_ICON_SIZE} /> },
      { result: 'miss_short', label: 'Short', className: 'pos-down', icon: <ChevronDown size={ACCORDION_ICON_SIZE} /> },
    ];

    return (
      <div className="directional-result">
        <div className="directional-result-grid" role="group" aria-label={`${prefix} result`}>
          {buttons.map((button) => (
            <button
              key={`${prefix}-${button.result}`}
              type="button"
              aria-label={button.label}
              className={`directional-result-btn ${button.className} ${selected === button.result ? 'active' : ''} ${selected === button.result ? (button.result === 'hit' ? 'active-hit' : 'active-miss') : ''}`}
              onClick={() => handleDirectionalResultChange(args.area, button.result)}
              disabled={args.disabled}
            >
              {button.icon}
            </button>
          ))}
        </div>
        {args.hit === 0 && args.direction == null && (
          <span className="directional-result-miss-note">{prefix} miss logged (no direction)</span>
        )}
      </div>
    );
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
              Score: {score}{putts !== null && ` • Putts: ${putts}`}
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
            {par === 3 ? (
              <div className="directional-result-na">Not tracked on par 3s</div>
            ) : (
              renderDirectionalResultControl({
                area: 'fir',
                hit: localFirHit,
                direction: localFirDirection,
              })
            )}
          </div>

          {/* GIR */}
          <div className="stepper-field">
            <label className="stepper-label">Green In Regulation</label>
            {renderDirectionalResultControl({
              area: 'gir',
              hit: localGirHit,
              direction: localGirDirection,
            })}
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
