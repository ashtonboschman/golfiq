import {
  defaultLiveGpsIntermediateTargets,
  MAX_USABLE_LIVE_GPS_ACCURACY_YARDS,
  resolveLiveGpsMeasurementOrigin,
} from '@/lib/gps/liveRoute';
import type { LiveGpsMappedHole } from '@/lib/gps/liveMappingTypes';

const hole: LiveGpsMappedHole = {
  holeNumber: 1,
  tee: { lat: 49.9, lng: -97.1 },
  green: {
    front: { lat: 49.9038, lng: -97.1038 },
    center: { lat: 49.904, lng: -97.104 },
    back: { lat: 49.9042, lng: -97.1042 },
  },
  targets: [
    { label: 'Target 1', point: { lat: 49.901, lng: -97.101 } },
    { label: 'Target 2', point: { lat: 49.9025, lng: -97.1025 } },
  ],
};

const METERS_PER_YARD = 0.9144;

describe('defaultLiveGpsIntermediateTargets', () => {
  it('aims a par 3 directly at the green', () => {
    expect(defaultLiveGpsIntermediateTargets(hole, 3)).toEqual([]);
  });

  it('uses target 1 for a par 4', () => {
    expect(defaultLiveGpsIntermediateTargets(hole, 4)).toEqual([
      hole.targets[0].point,
    ]);
  });

  it('uses targets 1 and 2 for a par 5', () => {
    expect(defaultLiveGpsIntermediateTargets(hole, 5)).toEqual([
      hole.targets[0].point,
      hole.targets[1].point,
    ]);
  });

  it('falls back to generated targets when mapped targets are missing', () => {
    const holeWithoutTargets = { ...hole, targets: [] };

    expect(defaultLiveGpsIntermediateTargets(holeWithoutTargets, 5)).toHaveLength(2);
  });
});

describe('resolveLiveGpsMeasurementOrigin', () => {
  it('uses the tee until a GPS position is available', () => {
    expect(resolveLiveGpsMeasurementOrigin({
      position: null,
      accuracyMeters: null,
      hole,
    })).toEqual(expect.objectContaining({
      position: hole.tee,
      usingTeeFallback: true,
    }));
  });

  it('uses an on-course GPS position with usable accuracy', () => {
    const position = { lat: 49.901, lng: -97.101 };

    expect(resolveLiveGpsMeasurementOrigin({
      position,
      accuracyMeters: 8,
      hole,
    })).toEqual(expect.objectContaining({
      position,
      usingTeeFallback: false,
    }));
  });

  it.each([
    [24, false],
    [25, false],
    [26, true],
    [500, true],
  ])('handles %d-yard reported accuracy with tee fallback=%s', (accuracyYards, usingTeeFallback) => {
    const position = { lat: 49.901, lng: -97.101 };

    expect(resolveLiveGpsMeasurementOrigin({
      position,
      accuracyMeters: accuracyYards * METERS_PER_YARD,
      hole,
    })).toEqual(expect.objectContaining({
      position: usingTeeFallback ? hole.tee : position,
      usingTeeFallback,
    }));
  });

  it('uses the deliberate 25-yard maximum for live GPS accuracy', () => {
    expect(MAX_USABLE_LIVE_GPS_ACCURACY_YARDS).toBe(25);
  });

  it('falls back safely when a position has no reported accuracy', () => {
    expect(resolveLiveGpsMeasurementOrigin({
      position: { lat: 49.901, lng: -97.101 },
      accuracyMeters: null,
      hole,
    })).toEqual(expect.objectContaining({
      position: hole.tee,
      usingTeeFallback: true,
      reason: expect.stringContaining('accuracy is unavailable'),
    }));
  });

  it('falls back to the tee for an off-course GPS position', () => {
    expect(resolveLiveGpsMeasurementOrigin({
      position: { lat: 50.5, lng: -98 },
      accuracyMeters: 8,
      hole,
    })).toEqual(expect.objectContaining({
      position: hole.tee,
      usingTeeFallback: true,
    }));
  });
});
