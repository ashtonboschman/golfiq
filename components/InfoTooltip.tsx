'use client';

import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { useAdaptiveTooltipPlacement } from '@/lib/ui/useAdaptiveTooltipPlacement';

export default function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const {
    tooltipRef,
    containerRef,
    displayPosition,
    displayVertical,
    isPositioned,
    resetPlacement,
  } = useAdaptiveTooltipPlacement(show);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    };

    if (show) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }

    return;
  }, [containerRef, show]);

  return (
    <div ref={containerRef} className="info-tooltip-container">
      <span
        onClick={(e) => {
          e.stopPropagation();
          setShow((prev) => {
            const next = !prev;
            if (next) resetPlacement();
            return next;
          });
        }}
        className="info-tooltip-icon"
      >
        <Info />
      </span>
      {show && (
        <div
          ref={tooltipRef}
          className={`info-tooltip-content ${displayPosition} ${displayVertical} ${isPositioned ? 'ready' : 'measuring'}`}
        >
          {text}
          <div className={`info-tooltip-arrow ${displayPosition} ${displayVertical}`} />
        </div>
      )}
    </div>
  );
}
