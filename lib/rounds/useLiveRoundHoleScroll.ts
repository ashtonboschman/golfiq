import { type RefObject, useEffect } from 'react';

export const LIVE_ROUND_SCROLL_TOP_OFFSET = 96;

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

  useEffect(() => {
    if (!enabled || expandedHole < 1 || typeof window === 'undefined') {
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
