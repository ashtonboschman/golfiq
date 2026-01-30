'use client';

import { useRef, useEffect, useState, useCallback, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => void | Promise<void>;
  children: ReactNode;
}

const THRESHOLD = 60;
const SPINNER_DURATION = 600;

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const currentPull = useRef(0);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setPullDistance(THRESHOLD);
    try {
      const result = onRefresh();
      if (result instanceof Promise) {
        await result;
      } else {
        // If onRefresh is synchronous (e.g., state setter), show spinner briefly
        await new Promise(resolve => setTimeout(resolve, SPINNER_DURATION));
      }
    } finally {
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;

      const currentY = e.touches[0].clientY;
      const delta = currentY - startY.current;

      if (delta > 0 && window.scrollY <= 0) {
        const distance = Math.min(delta * 0.4, 100);
        currentPull.current = distance;
        setPullDistance(distance);
      } else {
        currentPull.current = 0;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = () => {
      if (!pulling.current || refreshing) return;
      pulling.current = false;

      if (currentPull.current >= THRESHOLD) {
        handleRefresh();
      } else {
        setPullDistance(0);
      }
      currentPull.current = 0;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [refreshing, handleRefresh]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 5 || refreshing;

  return (
    <>
      {showIndicator && (
        <div
          className="pull-to-refresh-indicator"
          style={{ height: `${pullDistance}px` }}
        >
          <RefreshCw
            size={20}
            className={refreshing ? 'ptr-spinning' : ''}
            style={{
              opacity: progress,
              transform: `rotate(${progress * 360}deg)`,
            }}
          />
        </div>
      )}
      {children}
    </>
  );
}
