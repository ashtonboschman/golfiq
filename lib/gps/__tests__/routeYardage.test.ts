import { distanceYards } from '@/lib/gps/distance';
import {
  normalizeRouteLinePath,
  resolveActiveTargetYards,
  resolveRouteLineMetrics,
} from '@/lib/gps/routeYardage';
import type { LatLng } from '@/lib/gps/types';

const tee: LatLng = { lat: 49.9, lng: -97.1 };
const firstTarget: LatLng = { lat: 49.901, lng: -97.101 };
const greenCenter: LatLng = { lat: 49.902, lng: -97.102 };
const invalidTarget: LatLng = { lat: Number.NaN, lng: -97.1015 };

describe('route yardage helpers', () => {
  it('returns the rounded first normalized segment yardage for a normal route', () => {
    const targetPath = [firstTarget, greenCenter];
    const expected = Math.round(distanceYards(tee, firstTarget));

    expect(resolveActiveTargetYards(tee, targetPath)).toBe(expected);
    expect(resolveRouteLineMetrics(tee, targetPath)).toEqual({
      routePoints: [tee, firstTarget, greenCenter],
      activeTargetYards: expected,
    });
  });

  it('skips an adjacent duplicate before resolving the active target yardage', () => {
    const targetPath = [tee, greenCenter];

    expect(normalizeRouteLinePath(tee, targetPath)).toEqual([tee, greenCenter]);
    expect(resolveActiveTargetYards(tee, targetPath)).toBe(
      Math.round(distanceYards(tee, greenCenter)),
    );
  });

  it('removes invalid route points before resolving the active target yardage', () => {
    const targetPath = [invalidTarget, firstTarget, greenCenter];

    expect(normalizeRouteLinePath(tee, targetPath)).toEqual([tee, firstTarget, greenCenter]);
    expect(resolveActiveTargetYards(tee, targetPath)).toBe(
      Math.round(distanceYards(tee, firstTarget)),
    );
  });

  it('returns null when no valid normalized first segment exists', () => {
    expect(resolveActiveTargetYards(null, [firstTarget])).toBeNull();
    expect(resolveActiveTargetYards(tee, [tee])).toBeNull();
    expect(resolveRouteLineMetrics(tee, [invalidTarget])).toEqual({
      routePoints: [tee],
      activeTargetYards: null,
    });
  });
});
