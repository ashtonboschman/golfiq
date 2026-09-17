'use client';

import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';

type GpsHoleDockProps = {
  holeNumber: number;
  centerAction?: string;
  onCenter?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onReview?: () => void;
  disabled?: boolean;
  hiddenFromAccessibility?: boolean;
  className?: string;
};

export default function GpsHoleDock({
  holeNumber,
  centerAction,
  onCenter,
  onPrevious,
  onNext,
  onReview,
  disabled = false,
  hiddenFromAccessibility = false,
  className = '',
}: GpsHoleDockProps) {
  const centerContent = (
    <>
      <strong>Hole {holeNumber}</strong>
      {centerAction ? <span>{centerAction}</span> : null}
    </>
  );

  return (
    <div
      className={`gps-hole-dock${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Hole navigation"
      aria-hidden={hiddenFromAccessibility || undefined}
    >
      <div className="gps-hole-dock-slot">
        {onPrevious ? (
          <button
            type="button"
            className="gps-hole-dock-button gps-hole-dock-side"
            onClick={onPrevious}
            disabled={disabled}
            aria-label="Previous Hole"
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {onCenter ? (
        <button
          type="button"
          className="gps-hole-dock-button gps-hole-dock-center"
          onClick={onCenter}
          disabled={disabled}
          aria-label={centerAction ?? `Hole ${holeNumber}`}
        >
          {centerContent}
        </button>
      ) : (
        <div className="gps-hole-dock-center gps-hole-dock-center-static">
          {centerContent}
        </div>
      )}

      <div className="gps-hole-dock-slot">
        {onReview ? (
          <button
            type="button"
            className="gps-hole-dock-button gps-hole-dock-side"
            onClick={onReview}
            disabled={disabled}
            aria-label="Review Round"
          >
            <Flag size={22} aria-hidden="true" />
          </button>
        ) : onNext ? (
          <button
            type="button"
            className="gps-hole-dock-button gps-hole-dock-side"
            onClick={onNext}
            disabled={disabled}
            aria-label="Next Hole"
          >
            <ChevronRight size={24} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
