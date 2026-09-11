'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react';
import type {
  DirectionalResult,
  LiveRoundHoleDraft,
  LiveRoundTrackingPrefs,
  MissDirection,
} from '@/components/rounds/live/types';

type LiveHoleScoreEntryProps = {
  draft: LiveRoundHoleDraft;
  trackingPrefs: LiveRoundTrackingPrefs;
  onChange: (draft: LiveRoundHoleDraft) => void;
};

const DIRECTION_ICON_SIZE = 24;

function displayValue(value: number | null) {
  return value === null ? '--' : value;
}

function resolveDirectionalResult(
  hit: number | null,
  direction: MissDirection | null,
): DirectionalResult {
  if (hit === 1) return 'hit';
  if (hit === 0 && direction != null) return direction;
  if (hit === 0) return 'miss';
  return 'untracked';
}

function nextCounterValue(args: {
  field: keyof Pick<LiveRoundHoleDraft, 'score' | 'putts' | 'penalties' | 'chips' | 'greenside_bunker_shots'>;
  value: number | null;
  delta: number;
  par: number | null;
}) {
  const bounds = {
    score: { min: 1, max: 15 },
    putts: { min: 0, max: 6 },
    penalties: { min: 0, max: 4 },
    chips: { min: 0, max: 6 },
    greenside_bunker_shots: { min: 0, max: 6 },
  }[args.field];

  let next: number | null;

  if (args.field === 'score' && args.value === null) {
    next = Math.max(bounds.min, Math.min(args.par ?? 4, bounds.max));
  } else if (args.field === 'putts' && args.value === null) {
    next = args.delta > 0 ? 2 : 1;
  } else if (args.field !== 'score' && args.value === 0 && args.delta < 0) {
    return null;
  } else if (args.value === null) {
    next = Math.max(0, args.delta);
  } else {
    next = args.value + args.delta;
  }

  return Math.max(bounds.min, Math.min(next, bounds.max));
}

export default function LiveHoleScoreEntry({
  draft,
  trackingPrefs,
  onChange,
}: LiveHoleScoreEntryProps) {
  const par = draft.hole?.par ?? null;
  const directionPickerKey = `${draft.id}:${draft.display_hole_number}`;
  const [openDirectionPickerKey, setOpenDirectionPickerKey] = useState<string | null>(null);
  const firDirectionPickerOpen = openDirectionPickerKey === `fir:${directionPickerKey}`;
  const girDirectionPickerOpen = openDirectionPickerKey === `gir:${directionPickerKey}`;
  const firResultRef = useRef<HTMLDivElement | null>(null);
  const girResultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!firDirectionPickerOpen && !girDirectionPickerOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!firResultRef.current?.contains(target) && !girResultRef.current?.contains(target)) {
        setOpenDirectionPickerKey(null);
      }
    };

    document.addEventListener('click', closeOnOutsideClick);
    return () => document.removeEventListener('click', closeOnOutsideClick);
  }, [firDirectionPickerOpen, girDirectionPickerOpen]);

  const updateDraft = (patch: Partial<LiveRoundHoleDraft>) => {
    onChange({ ...draft, ...patch });
  };

  const handleStepperChange = (
    field: keyof Pick<LiveRoundHoleDraft, 'score' | 'putts' | 'penalties' | 'chips' | 'greenside_bunker_shots'>,
    delta: number,
  ) => {
    updateDraft({
      [field]: nextCounterValue({
        field,
        value: draft[field],
        delta,
        par,
      }),
    });
  };

  const handleDirectionalResultChange = (
    area: 'fir' | 'gir',
    result: DirectionalResult,
  ) => {
    const currentResult = area === 'fir'
      ? resolveDirectionalResult(draft.fir_hit, draft.fir_direction)
      : resolveDirectionalResult(draft.gir_hit, draft.gir_direction);
    const next = currentResult === result && result !== 'hit' && result !== 'miss'
      ? 'miss'
      : currentResult === result
        ? 'untracked'
        : result;

    if (area === 'fir') {
      if (next === 'untracked') {
        updateDraft({ fir_hit: null, fir_direction: null });
        setOpenDirectionPickerKey(null);
        return;
      }
      if (next === 'hit') {
        updateDraft({ fir_hit: 1, fir_direction: null });
        setOpenDirectionPickerKey(null);
        return;
      }
      if (next === 'miss') {
        updateDraft({ fir_hit: 0, fir_direction: null });
        setOpenDirectionPickerKey(null);
        return;
      }
      updateDraft({ fir_hit: 0, fir_direction: next });
      setOpenDirectionPickerKey(null);
      return;
    }

    if (next === 'untracked') {
      updateDraft({ gir_hit: null, gir_direction: null });
      setOpenDirectionPickerKey(null);
      return;
    }
    if (next === 'hit') {
      updateDraft({ gir_hit: 1, gir_direction: null });
      setOpenDirectionPickerKey(null);
      return;
    }
    if (next === 'miss') {
      updateDraft({ gir_hit: 0, gir_direction: null });
      setOpenDirectionPickerKey(null);
      return;
    }
    updateDraft({ gir_hit: 0, gir_direction: next });
    setOpenDirectionPickerKey(null);
  };

  const handleMissClick = (area: 'fir' | 'gir') => {
    const hit = area === 'fir' ? draft.fir_hit : draft.gir_hit;
    const pickerKey = `${area}:${directionPickerKey}`;

    if (hit !== 0) {
      updateDraft(area === 'fir'
        ? { fir_hit: 0, fir_direction: null }
        : { gir_hit: 0, gir_direction: null });
      setOpenDirectionPickerKey(pickerKey);
      return;
    }

    if (openDirectionPickerKey !== pickerKey) {
      setOpenDirectionPickerKey(pickerKey);
      return;
    }

    updateDraft(area === 'fir'
      ? { fir_hit: null, fir_direction: null }
      : { gir_hit: null, gir_direction: null });
    setOpenDirectionPickerKey(null);
  };

  const renderDirectionalResultControl = (args: {
    area: 'fir' | 'gir';
    hit: number | null;
    direction: MissDirection | null;
  }) => {
    const selected = resolveDirectionalResult(args.hit, args.direction);
    const prefix = args.area === 'fir' ? 'FIR' : 'GIR';

    const directionButtons: Array<{
      result: MissDirection;
      label: string;
      icon: ReactNode;
    }> = [
      { result: 'miss_left', label: 'Left', icon: <ChevronLeft size={DIRECTION_ICON_SIZE} /> },
      { result: 'miss_long', label: 'Long', icon: <ChevronUp size={DIRECTION_ICON_SIZE} /> },
      { result: 'miss_short', label: 'Short', icon: <ChevronDown size={DIRECTION_ICON_SIZE} /> },
      { result: 'miss_right', label: 'Right', icon: <ChevronRight size={DIRECTION_ICON_SIZE} /> },
    ];
    const selectedDirection = directionButtons.find((button) => button.result === args.direction);
    const directionPickerOpen = args.area === 'fir' ? firDirectionPickerOpen : girDirectionPickerOpen;

    return (
      <div
        ref={args.area === 'fir' ? firResultRef : girResultRef}
        className="directional-result"
      >
        <div className="directional-result-primary-grid" role="group" aria-label={`${prefix} result`}>
          <button
            type="button"
            aria-label={selectedDirection ? `Miss ${selectedDirection.label}` : 'Miss'}
            aria-pressed={args.hit === 0}
            className={`directional-result-btn${args.hit === 0 ? ' active active-miss' : ''}`}
            onClick={() => handleMissClick(args.area)}
          >
            {selectedDirection ? selectedDirection.icon : <X size={DIRECTION_ICON_SIZE} />}
          </button>
          <button
            type="button"
            aria-label="Hit"
            aria-pressed={selected === 'hit'}
            className={`directional-result-btn${selected === 'hit' ? ' active active-hit' : ''}`}
            onClick={() => handleDirectionalResultChange(args.area, 'hit')}
          >
            <Check size={DIRECTION_ICON_SIZE} />
          </button>
        </div>
        {directionPickerOpen && args.hit === 0 && (
          <div className="directional-result-picker" role="group" aria-label={`${prefix} miss direction`}>
            {directionButtons.map((button) => (
            <button
              key={`${prefix}-${button.result}`}
              type="button"
              aria-label={button.label}
              aria-pressed={selected === button.result}
              className={`directional-result-btn${selected === button.result ? ' active active-miss' : ''}`}
              onClick={() => handleDirectionalResultChange(args.area, button.result)}
            >
              {button.icon}
            </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderStepper = (
    field: keyof Pick<LiveRoundHoleDraft, 'score' | 'putts' | 'penalties' | 'chips' | 'greenside_bunker_shots'>,
    label: string,
  ) => (
    <div className="stepper-field">
      <label className="stepper-label">{label}</label>
      <div className="stepper-controls">
        <button
          type="button"
          className="stepper-btn stepper-minus"
          onClick={() => handleStepperChange(field, -1)}
          disabled={field === 'score' && draft.score === 1}
        >
          -
        </button>
        <div className="stepper-value">{displayValue(draft[field])}</div>
        <button
          type="button"
          className="stepper-btn stepper-plus"
          onClick={() => handleStepperChange(field, 1)}
          disabled={draft[field] !== null && draft[field] >= (field === 'score' ? 15 : field === 'penalties' ? 4 : 6)}
        >
          +
        </button>
      </div>
    </div>
  );

  return (
    <div className="live-round-score-entry">
      {renderStepper('score', 'Score')}

      {trackingPrefs.fir && (
        <div className="stepper-field">
          <label className="stepper-label">Fairway In Regulation</label>
          {par === 3 ? (
            <div className="directional-result-na">Not tracked on par 3s</div>
          ) : (
            renderDirectionalResultControl({
              area: 'fir',
              hit: draft.fir_hit,
              direction: draft.fir_direction,
            })
          )}
        </div>
      )}

      {trackingPrefs.gir && (
        <div className="stepper-field">
          <label className="stepper-label">Green In Regulation</label>
          {renderDirectionalResultControl({
            area: 'gir',
            hit: draft.gir_hit,
            direction: draft.gir_direction,
          })}
        </div>
      )}

      {trackingPrefs.chips && renderStepper('chips', 'Chips')}
      {trackingPrefs.greensideBunkerShots && renderStepper('greenside_bunker_shots', 'Greenside Bunker Shots')}
      {trackingPrefs.putts && renderStepper('putts', 'Putts')}
      {trackingPrefs.penalties && renderStepper('penalties', 'Penalties')}
    </div>
  );
}
