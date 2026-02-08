'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

export default function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'center' | 'left' | 'right'>('center');
  const [vertical, setVertical] = useState<'above' | 'below'>('above');

  useEffect(() => {
    if (show && tooltipRef.current) {
      const timer = setTimeout(() => {
        if (!tooltipRef.current || !containerRef.current) return;
        const rect = tooltipRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (rect.right > viewportWidth - 10) {
          setPosition('right');
        } else if (rect.left < 10) {
          setPosition('left');
        } else {
          setPosition('center');
        }

        const tooltipHeight = rect.height;
        const availableTop = containerRect.top - 10;
        const availableBottom = viewportHeight - containerRect.bottom - 10;
        const nextVertical =
          tooltipHeight > availableTop && availableBottom > availableTop ? 'below' : 'above';
        setVertical(nextVertical);
      }, 10);

      return () => clearTimeout(timer);
    }

    setPosition('center');
    setVertical('above');
    return;
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
          className={`info-tooltip-content ${position} ${vertical}`}
        >
          {text}
          <div className={`info-tooltip-arrow ${position} ${vertical}`} />
        </div>
      )}
    </div>
  );
}
