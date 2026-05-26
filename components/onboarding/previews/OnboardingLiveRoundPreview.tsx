'use client';

import { useEffect, useRef } from 'react';
import HoleCard from '@/components/HoleCard';
import styles from './OnboardingPreview.module.css';

export default function OnboardingLiveRoundPreview() {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewRef.current) return;
    const focusables = previewRef.current.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a, [tabindex]',
    );
    focusables.forEach((node) => {
      node.setAttribute('tabindex', '-1');
    });
  }, []);

  return (
    <div
      ref={previewRef}
      className={`${styles.previewNonInteractive} ${styles.liveRoundPreviewRoot}`}
      aria-hidden="true"
    >
      <div className={styles.liveRoundScrollViewport} data-onboarding-live-scroll>
        <HoleCard
          hole={6}
          par={4}
          score={4}
          fir_hit={1}
          fir_direction={null}
          gir_hit={0}
          gir_direction="miss_right"
          putts={1}
          penalties={0}
          chips={1}
          greenside_bunker_shots={0}
          isExpanded
          isCompleted={false}
          onChange={() => undefined}
          onNext={() => undefined}
        />
      </div>
    </div>
  );
}
