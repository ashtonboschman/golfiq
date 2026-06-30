import { distanceYards, metersToYards } from '@/lib/gps/distance';
import type { LiveGpsPoint } from '@/lib/gps/liveMappingTypes';

export const MIN_LIVE_TARGET_AHEAD_YARDS = 50;
export const MIN_LIVE_GREEN_DISTANCE_YARDS = 200;
export const MIN_LIVE_TARGET_TO_GREEN_YARDS = 50;
export const MAX_LIVE_ROUTE_TARGETS = 2;

type SelectRelevantLiveRouteTargetsArgs = {
  tee: LiveGpsPoint;
  targets: readonly LiveGpsPoint[];
  greenCenter: LiveGpsPoint;
  userPosition: LiveGpsPoint | null;
};

type LocalPoint = {
  x: number;
  y: number;
};

function isValidPoint(point: LiveGpsPoint | null | undefined): point is LiveGpsPoint {
  return Boolean(
    point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180,
  );
}

function toLocalYards(origin: LiveGpsPoint, point: LiveGpsPoint): LocalPoint {
  const metersPerDegree = 111320;
  const averageLatitudeRadians = ((origin.lat + point.lat) / 2) * (Math.PI / 180);

  return {
    x: metersToYards(
      (point.lng - origin.lng) * metersPerDegree * Math.cos(averageLatitudeRadians),
    ),
    y: metersToYards((point.lat - origin.lat) * metersPerDegree),
  };
}

function projectUserProgressYards(
  route: readonly LiveGpsPoint[],
  userPosition: LiveGpsPoint,
) {
  if (route.length < 2) return null;

  const origin = route[0];
  const localRoute = route.map((point) => toLocalYards(origin, point));
  const localUser = toLocalYards(origin, userPosition);
  let cumulativeYards = 0;
  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  let closestProgressYards = 0;

  for (let index = 0; index < route.length - 1; index += 1) {
    const from = localRoute[index];
    const to = localRoute[index + 1];
    const segmentX = to.x - from.x;
    const segmentY = to.y - from.y;
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
    const segmentYards = distanceYards(route[index], route[index + 1]);
    const projectionRatio = segmentLengthSquared > 0
      ? Math.max(0, Math.min(1, (
        (localUser.x - from.x) * segmentX +
        (localUser.y - from.y) * segmentY
      ) / segmentLengthSquared))
      : 0;
    const projectedX = from.x + segmentX * projectionRatio;
    const projectedY = from.y + segmentY * projectionRatio;
    const distanceSquared = (
      (localUser.x - projectedX) ** 2 +
      (localUser.y - projectedY) ** 2
    );

    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closestProgressYards = cumulativeYards + segmentYards * projectionRatio;
    }

    cumulativeYards += segmentYards;
  }

  return Number.isFinite(closestProgressYards) ? closestProgressYards : null;
}

export function selectRelevantLiveRouteTargets({
  tee,
  targets,
  greenCenter,
  userPosition,
}: SelectRelevantLiveRouteTargetsArgs): LiveGpsPoint[] {
  const validTargets = targets
    .slice(0, MAX_LIVE_ROUTE_TARGETS)
    .filter(isValidPoint);

  if (
    !isValidPoint(tee) ||
    !isValidPoint(greenCenter) ||
    !isValidPoint(userPosition)
  ) {
    return validTargets;
  }

  if (distanceYards(userPosition, greenCenter) < MIN_LIVE_GREEN_DISTANCE_YARDS) {
    return [];
  }

  const route = [tee, ...validTargets, greenCenter];
  const userProgressYards = projectUserProgressYards(route, userPosition);
  if (userProgressYards === null) return validTargets;

  const targetProgress = validTargets.map((point, targetIndex) => {
    let routeYards = 0;
    for (let index = 0; index <= targetIndex; index += 1) {
      routeYards += distanceYards(route[index], route[index + 1]);
    }
    return { point, routeYards };
  });
  const totalRouteYards = route.slice(1).reduce(
    (total, point, index) => total + distanceYards(route[index], point),
    0,
  );

  return targetProgress
    .filter((target) => (
      target.routeYards - userProgressYards >= MIN_LIVE_TARGET_AHEAD_YARDS &&
      totalRouteYards - target.routeYards >= MIN_LIVE_TARGET_TO_GREEN_YARDS
    ))
    .slice(0, MAX_LIVE_ROUTE_TARGETS)
    .map(({ point }) => point);
}
