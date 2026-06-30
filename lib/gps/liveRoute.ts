import { distanceYards, metersToYards } from '@/lib/gps/distance';
import type { LiveGpsMappedHole, LiveGpsPoint } from '@/lib/gps/liveMappingTypes';

const OFF_COURSE_FALLBACK_YARDS = 1800;
const BEHIND_TEE_FALLBACK_YARDS = 35;
export const MAX_USABLE_LIVE_GPS_ACCURACY_YARDS = 25;

function interpolateLatLng(from: LiveGpsPoint, to: LiveGpsPoint, ratio: number): LiveGpsPoint {
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lng: from.lng + (to.lng - from.lng) * ratio,
  };
}

function targetOrFallback(
  target: LiveGpsPoint | undefined,
  fallback: LiveGpsPoint,
  greenCenter: LiveGpsPoint,
) {
  if (!target) return fallback;
  return distanceYards(target, greenCenter) > 20 ? target : fallback;
}

export function defaultLiveGpsIntermediateTargets(
  hole: LiveGpsMappedHole,
  par: number | null,
): LiveGpsPoint[] {
  if (par === 4) {
    return [targetOrFallback(
      hole.targets[0]?.point,
      interpolateLatLng(hole.tee, hole.green.center, 0.55),
      hole.green.center,
    )];
  }

  if (par === 5) {
    return [
      targetOrFallback(
        hole.targets[0]?.point,
        interpolateLatLng(hole.tee, hole.green.center, 0.4),
        hole.green.center,
      ),
      targetOrFallback(
        hole.targets[1]?.point,
        interpolateLatLng(hole.tee, hole.green.center, 0.72),
        hole.green.center,
      ),
    ];
  }

  return [];
}

function toLocalYards(origin: LiveGpsPoint, point: LiveGpsPoint) {
  const metersPerDegree = 111320;
  const averageLat = ((origin.lat + point.lat) / 2) * (Math.PI / 180);
  return {
    x: metersToYards((point.lng - origin.lng) * metersPerDegree * Math.cos(averageLat)),
    y: metersToYards((point.lat - origin.lat) * metersPerDegree),
  };
}

export function resolveLiveGpsMeasurementOrigin(args: {
  position: LiveGpsPoint | null;
  accuracyMeters: number | null;
  hole: LiveGpsMappedHole;
}) {
  const { position, accuracyMeters, hole } = args;

  if (!position) {
    return {
      position: hole.tee,
      usingTeeFallback: true,
      reason: 'Distances are measured from the tee until your GPS location is available.',
    };
  }

  const distanceFromCourse = distanceYards(position, hole.green.center);
  if (distanceFromCourse > OFF_COURSE_FALLBACK_YARDS) {
    return {
      position: hole.tee,
      usingTeeFallback: true,
      reason: `GPS looks off-course (${Math.round(distanceFromCourse)} yd away), so distances are measured from the tee.`,
    };
  }

  const accuracyYards = (
    accuracyMeters != null
    && Number.isFinite(accuracyMeters)
    && accuracyMeters >= 0
  )
    ? metersToYards(accuracyMeters)
    : null;
  if (accuracyYards === null) {
    return {
      position: hole.tee,
      usingTeeFallback: true,
      reason: 'GPS accuracy is unavailable, so distances are measured from the tee.',
    };
  }

  if (accuracyYards > MAX_USABLE_LIVE_GPS_ACCURACY_YARDS) {
    return {
      position: hole.tee,
      usingTeeFallback: true,
      reason: `GPS accuracy is low (${Math.round(accuracyYards)} yd), so distances are measured from the tee.`,
    };
  }

  const holeVector = toLocalYards(hole.tee, hole.green.center);
  const userVector = toLocalYards(hole.tee, position);
  const holeLength = Math.hypot(holeVector.x, holeVector.y);
  const alongHoleYards = holeLength > 0
    ? (userVector.x * holeVector.x + userVector.y * holeVector.y) / holeLength
    : 0;

  if (alongHoleYards < -BEHIND_TEE_FALLBACK_YARDS) {
    return {
      position: hole.tee,
      usingTeeFallback: true,
      reason: 'GPS appears behind the tee, so distances are measured from the tee.',
    };
  }

  return {
    position,
    usingTeeFallback: false,
    reason: 'Distances are measured from your current GPS position.',
  };
}
