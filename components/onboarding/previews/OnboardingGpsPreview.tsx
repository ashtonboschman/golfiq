'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import LiveGpsHoleMap from '@/components/gps/LiveGpsHoleMap';
import type { ClubSuggestionClub } from '@/lib/clubs/clubSuggestion';
import type { LiveGpsMappedHole } from '@/lib/gps/liveMappingTypes';
import styles from './OnboardingPreview.module.css';

const MACGREGOR_HOLE_ONE: LiveGpsMappedHole = {
  holeNumber: 1,
  tee: { lat: 49.9729305, lng: -98.7679347 },
  green: {
    front: { lat: 49.9707183, lng: -98.7700172 },
    center: { lat: 49.9705416, lng: -98.7699443 },
    back: { lat: 49.9703762, lng: -98.7698588 },
  },
  targets: [
    {
      label: 'Target 1',
      point: { lat: 49.9720032, lng: -98.7698277 },
    },
  ],
};

const DEMO_CLUBS: ClubSuggestionClub[] = [
  {
    clubDefinitionId: 'onboarding-6i',
    shortLabel: '6I',
    carryYards: 200,
    catalogueOrder: 1,
  },
  {
    clubDefinitionId: 'onboarding-7i',
    shortLabel: '7I',
    carryYards: 185,
    catalogueOrder: 2,
  },
  {
    clubDefinitionId: 'onboarding-8i',
    shortLabel: '8I',
    carryYards: 170,
    catalogueOrder: 3,
  },
];

export default function OnboardingGpsPreview() {
  return (
    <div
      className={`${styles.previewNonInteractive} ${styles.gpsPreviewRoot}`}
      aria-hidden="true"
    >
      <div className={styles.gpsPreviewMap}>
        <LiveGpsHoleMap
          apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          hole={MACGREGOR_HOLE_ONE}
          courseHoles={[MACGREGOR_HOLE_ONE]}
          par={4}
          routeKey="onboarding-macgregor-hole-1"
          userPosition={MACGREGOR_HOLE_ONE.tee}
          userAccuracyMeters={5}
          userLocationStatus="granted"
          suggestionClubs={DEMO_CLUBS}
        />
      </div>

      <div className="live-round-gps-hud">
        <div className="live-round-gps-hole-menu">
          <button
            type="button"
            className="live-round-gps-hole-card"
            tabIndex={-1}
          >
            <strong>
              Hole 1
              <ChevronDown size={18} aria-hidden="true" />
            </strong>
            <small className="live-round-gps-hole-meta">Par 4 · 372 yd · HCP 3</small>
          </button>
        </div>
      </div>

      <div className="live-round-gps-controls">
        <button type="button" className="btn btn-secondary" tabIndex={-1}>
          <ChevronLeft size={18} aria-hidden="true" />
          Previous Hole
        </button>
        <button type="button" className="btn btn-accent" tabIndex={-1}>
          Log Score
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
