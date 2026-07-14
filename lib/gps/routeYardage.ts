import { distanceYards } from '@/lib/gps/distance';
import type { LatLng } from '@/lib/gps/types';

const ROUTE_LINE_DUPLICATE_TOLERANCE_YARDS = 0.5;

export function isValidRoutePoint(point: LatLng | null | undefined): point is LatLng {
  return Boolean(
    point
    && Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && point.lat >= -90
    && point.lat <= 90
    && point.lng >= -180
    && point.lng <= 180
  );
}

export function normalizeRouteLinePath(origin: LatLng | null, targetPath: readonly LatLng[]) {
  if (!isValidRoutePoint(origin)) return [];

  return [origin, ...targetPath]
    .filter(isValidRoutePoint)
    .reduce<LatLng[]>((points, point) => {
      const previous = points.at(-1);
      if (
        previous
        && distanceYards(previous, point) <= ROUTE_LINE_DUPLICATE_TOLERANCE_YARDS
      ) {
        return points;
      }

      points.push(point);
      return points;
    }, []);
}

export function roundRouteSegmentYards(from: LatLng, to: LatLng) {
  const yards = distanceYards(from, to);
  return Number.isFinite(yards) ? Math.round(yards) : null;
}

export function resolveActiveTargetYards(origin: LatLng | null, targetPath: readonly LatLng[]) {
  const routePoints = normalizeRouteLinePath(origin, targetPath);
  if (routePoints.length < 2) return null;

  return roundRouteSegmentYards(routePoints[0], routePoints[1]);
}

export function resolveRouteLineMetrics(origin: LatLng | null, targetPath: readonly LatLng[]) {
  const routePoints = normalizeRouteLinePath(origin, targetPath);

  return {
    routePoints,
    activeTargetYards: routePoints.length < 2
      ? null
      : roundRouteSegmentYards(routePoints[0], routePoints[1]),
  };
}
