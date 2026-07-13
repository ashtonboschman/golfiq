import { distanceYards, metersToYards } from '@/lib/gps/distance';
import type { LiveGpsMappedHole, LiveGpsPoint } from '@/lib/gps/liveMappingTypes';

export const COURSE_PRESENCE_ENTER_YARDS = 200;
export const COURSE_PRESENCE_EXIT_YARDS = 250;

export type CoursePresenceRoute = {
  holeNumber: number;
  points: LiveGpsPoint[];
};

export type CoursePresenceReason =
  | 'no_position'
  | 'no_course_geometry'
  | 'within_enter_distance'
  | 'within_exit_distance'
  | 'outside_course';

export type CoursePresenceResult = {
  isOnCourse: boolean;
  minimumDistanceYards: number | null;
  reason: CoursePresenceReason;
};

function isValidPoint(point: LiveGpsPoint | null | undefined): point is LiveGpsPoint {
  return Boolean(
    point
    && Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && point.lat >= -90
    && point.lat <= 90
    && point.lng >= -180
    && point.lng <= 180,
  );
}

function toLocalYards(origin: LiveGpsPoint, point: LiveGpsPoint) {
  const metersPerDegree = 111320;
  const averageLat = ((origin.lat + point.lat) / 2) * (Math.PI / 180);
  return {
    x: metersToYards((point.lng - origin.lng) * metersPerDegree * Math.cos(averageLat)),
    y: metersToYards((point.lat - origin.lat) * metersPerDegree),
  };
}

export function buildLiveGpsCoursePresenceRoutes(
  holes: LiveGpsMappedHole[] | null | undefined,
): CoursePresenceRoute[] {
  if (!Array.isArray(holes)) return [];

  return holes.flatMap((hole) => {
    const targets = Array.isArray(hole.targets)
      ? hole.targets.map((target) => target.point)
      : [];
    const points = [
      hole.tee,
      ...targets,
      hole.green?.center,
    ].filter(isValidPoint);

    return points.length >= 2
      ? [{ holeNumber: hole.holeNumber, points }]
      : [];
  });
}

export function pointToPolylineDistanceYards(
  point: LiveGpsPoint | null | undefined,
  polyline: LiveGpsPoint[] | null | undefined,
): number | null {
  if (!isValidPoint(point) || !Array.isArray(polyline)) return null;

  const validPoints = polyline.filter(isValidPoint);
  if (validPoints.length < 2) return null;

  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < validPoints.length - 1; index += 1) {
    const segmentStart = validPoints[index];
    const segmentEnd = validPoints[index + 1];
    const segmentVector = toLocalYards(segmentStart, segmentEnd);
    const pointVector = toLocalYards(segmentStart, point);
    const segmentLengthSquared = segmentVector.x ** 2 + segmentVector.y ** 2;

    if (segmentLengthSquared <= Number.EPSILON) {
      minimumDistance = Math.min(minimumDistance, distanceYards(point, segmentStart));
      continue;
    }

    const rawProjection = (
      pointVector.x * segmentVector.x
      + pointVector.y * segmentVector.y
    ) / segmentLengthSquared;
    const projection = Math.max(0, Math.min(1, rawProjection));
    const closestX = segmentVector.x * projection;
    const closestY = segmentVector.y * projection;
    const distance = Math.hypot(pointVector.x - closestX, pointVector.y - closestY);
    minimumDistance = Math.min(minimumDistance, distance);
  }

  return Number.isFinite(minimumDistance) ? minimumDistance : null;
}

export function minimumDistanceToCourseRoutesYards(
  point: LiveGpsPoint | null | undefined,
  routes: CoursePresenceRoute[] | null | undefined,
): number | null {
  if (!isValidPoint(point) || !Array.isArray(routes) || routes.length === 0) return null;

  const distances = routes
    .map((route) => pointToPolylineDistanceYards(point, route.points))
    .filter((distance): distance is number => (
      distance !== null && Number.isFinite(distance)
    ));

  if (distances.length === 0) return null;
  return Math.min(...distances);
}

export function resolveLiveGpsCoursePresenceFromRoutes(args: {
  position: LiveGpsPoint | null;
  routes: CoursePresenceRoute[] | null | undefined;
  wasOnCourse: boolean;
  enterDistanceYards?: number;
  exitDistanceYards?: number;
}): CoursePresenceResult {
  const {
    position,
    routes,
    wasOnCourse,
    enterDistanceYards = COURSE_PRESENCE_ENTER_YARDS,
    exitDistanceYards = COURSE_PRESENCE_EXIT_YARDS,
  } = args;

  if (!position) {
    return {
      isOnCourse: false,
      minimumDistanceYards: null,
      reason: 'no_position',
    };
  }

  const minimumDistanceYards = minimumDistanceToCourseRoutesYards(position, routes);
  if (minimumDistanceYards === null) {
    return {
      isOnCourse: true,
      minimumDistanceYards: null,
      reason: 'no_course_geometry',
    };
  }

  if (wasOnCourse && minimumDistanceYards <= exitDistanceYards) {
    return {
      isOnCourse: true,
      minimumDistanceYards,
      reason: 'within_exit_distance',
    };
  }

  if (!wasOnCourse && minimumDistanceYards <= enterDistanceYards) {
    return {
      isOnCourse: true,
      minimumDistanceYards,
      reason: 'within_enter_distance',
    };
  }

  return {
    isOnCourse: false,
    minimumDistanceYards,
    reason: 'outside_course',
  };
}

export function resolveLiveGpsCoursePresence(args: {
  position: LiveGpsPoint | null;
  holes: LiveGpsMappedHole[] | null | undefined;
  wasOnCourse: boolean;
  enterDistanceYards?: number;
  exitDistanceYards?: number;
}): CoursePresenceResult {
  return resolveLiveGpsCoursePresenceFromRoutes({
    position: args.position,
    routes: buildLiveGpsCoursePresenceRoutes(args.holes),
    wasOnCourse: args.wasOnCourse,
    enterDistanceYards: args.enterDistanceYards,
    exitDistanceYards: args.exitDistanceYards,
  });
}
