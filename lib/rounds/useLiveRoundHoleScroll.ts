import { type RefObject, useEffect, useRef } from 'react';

export const LIVE_ROUND_SCROLL_TOP_OFFSET = 88;

type HoleCardRefs = Record<number, HTMLDivElement | null>;

export function scrollLiveRoundHoleIntoView(
  element: HTMLDivElement,
  topOffset = LIVE_ROUND_SCROLL_TOP_OFFSET,
) {
  if (typeof window === 'undefined') {
    return;
  }

  const nextTop = Math.max(0, window.scrollY + element.getBoundingClientRect().top - topOffset);
  window.scrollTo({ top: nextTop, behavior: 'auto' });
}

export function useLiveRoundHoleScroll(args: {
  enabled: boolean;
  expandedHole: number;
  holeCardRefs: RefObject<HoleCardRefs>;
}) {
  const { enabled, expandedHole, holeCardRefs } = args;
  const hasHandledEnabledStateRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      hasHandledEnabledStateRef.current = false;
      return;
    }

    if (expandedHole < 1 || typeof window === 'undefined') {
      return;
    }

    const isInitialHoleOneOpen = !hasHandledEnabledStateRef.current && expandedHole === 1;
    hasHandledEnabledStateRef.current = true;

    if (isInitialHoleOneOpen) {
      return;
    }

    let outerFrame: number | null = null;
    let innerFrame: number | null = null;

    outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        const nextHoleCard = holeCardRefs.current?.[expandedHole];
        if (!nextHoleCard) {
          return;
        }

        scrollLiveRoundHoleIntoView(nextHoleCard);
      });
    });

    return () => {
      if (outerFrame !== null) {
        window.cancelAnimationFrame(outerFrame);
      }
      if (innerFrame !== null) {
        window.cancelAnimationFrame(innerFrame);
      }
    };
  }, [enabled, expandedHole, holeCardRefs]);
}
