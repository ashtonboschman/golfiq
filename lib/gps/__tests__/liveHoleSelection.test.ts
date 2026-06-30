import { selectLiveGpsMappedHoleForDraft } from '@/lib/gps/liveHoleSelection';
import type { LiveGpsMappedHole } from '@/lib/gps/liveMappingTypes';

function mappedHole(holeNumber: number): LiveGpsMappedHole {
  return {
    holeNumber,
    tee: { lat: 49.9, lng: -97.1 },
    green: {
      front: { lat: 49.901, lng: -97.101 },
      center: { lat: 49.902, lng: -97.102 },
      back: { lat: 49.903, lng: -97.103 },
    },
    targets: [],
  };
}

describe('selectLiveGpsMappedHoleForDraft', () => {
  const holes = [mappedHole(1), mappedHole(7), mappedHole(10)];

  it('selects geometry using the physical hole number', () => {
    expect(selectLiveGpsMappedHoleForDraft(holes, {
      hole_number: 7,
      display_hole_number: 7,
    })?.holeNumber).toBe(7);
  });

  it('supports double-9 display holes by selecting their physical pass-two hole', () => {
    expect(selectLiveGpsMappedHoleForDraft(holes, {
      hole_number: 1,
      display_hole_number: 10,
    })?.holeNumber).toBe(1);
  });

  it('returns null when the physical hole is not mapped', () => {
    expect(selectLiveGpsMappedHoleForDraft(holes, {
      hole_number: 18,
      display_hole_number: 18,
    })).toBeNull();
  });
});
