import { useLayoutEffect, useRef, useState } from 'react';

type TooltipHorizontalPosition = 'center' | 'left' | 'right';
type TooltipVerticalPosition = 'above' | 'below';

export function useAdaptiveTooltipPlacement(show: boolean) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<TooltipHorizontalPosition>('center');
  const [vertical, setVertical] = useState<TooltipVerticalPosition>('above');
  const [isPositioned, setIsPositioned] = useState(false);
  const displayPosition = isPositioned ? position : 'center';
  const displayVertical = isPositioned ? vertical : 'above';

  useLayoutEffect(() => {
    if (!show) return;
    if (!tooltipRef.current || !containerRef.current) return;

    let rafId: number | null = null;
    const edgePadding = 10;

    const measureAndPlace = () => {
      if (!tooltipRef.current || !containerRef.current) return;

      const rect = tooltipRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const headerEl = document.querySelector('.header');
      const headerBottom =
        headerEl instanceof HTMLElement ? headerEl.getBoundingClientRect().bottom : 0;
      const topSafeBoundary = Math.max(edgePadding, headerBottom + edgePadding);

      if (rect.right > viewportWidth - edgePadding) {
        setPosition('right');
      } else if (rect.left < edgePadding) {
        setPosition('left');
      } else {
        setPosition('center');
      }

      const tooltipHeight = rect.height;
      const availableTop = containerRect.top - topSafeBoundary;
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

  return {
    tooltipRef,
    containerRef,
    displayPosition,
    displayVertical,
    isPositioned,
  };
}

