'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

export default function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'center' | 'left' | 'right'>('center');
  const [vertical, setVertical] = useState<'above' | 'below'>('above');
  const [isPositioned, setIsPositioned] = useState(false);

  useLayoutEffect(() => {
    if (!show) {
      setIsPositioned(false);
      setPosition('center');
      setVertical('above');
      return;
    }
    if (!tooltipRef.current || !containerRef.current) return;

    let rafId: number | null = null;
    const edgePadding = 10;
    const measureAndPlace = () => {
      if (!tooltipRef.current || !containerRef.current) return;
      const rect = tooltipRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth - edgePadding) {
        setPosition('right');
      } else if (rect.left < edgePadding) {
        setPosition('left');
      } else {
        setPosition('center');
      }

      const tooltipHeight = rect.height;
      const availableTop = containerRect.top - edgePadding;
      const availableBottom = viewportHeight - containerRect.bottom - edgePadding;
      const nextVertical =
        tooltipHeight > availableTop && availableBottom > availableTop ? 'below' : 'above';
      setVertical(nextVertical);
      setIsPositioned(true);
    };

    const schedulePlacement = () => {
      setIsPositioned(false);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(measureAndPlace);
    };

    schedulePlacement();

    window.addEventListener('resize', schedulePlacement);
    window.addEventListener('orientationchange', schedulePlacement);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', schedulePlacement);
      window.removeEventListener('orientationchange', schedulePlacement);
    };
  }, [show]);

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
  }, [show]);

  return (
    <div ref={containerRef} className="info-tooltip-container">
      <span
        onClick={(e) => {
          e.stopPropagation();
          setShow(!show);
        }}
        className="info-tooltip-icon"
      >
        <Info />
      </span>
      {show && (
        <div
          ref={tooltipRef}
          className={`info-tooltip-content ${position} ${vertical} ${isPositioned ? 'ready' : 'measuring'}`}
        >
          {text}
          <div className={`info-tooltip-arrow ${position} ${vertical}`} />
        </div>
      )}
    </div>
  );
}
