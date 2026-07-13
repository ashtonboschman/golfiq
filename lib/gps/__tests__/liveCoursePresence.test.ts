import { distanceYards } from '@/lib/gps/distance';
import {
  COURSE_PRESENCE_ENTER_YARDS,
  COURSE_PRESENCE_EXIT_YARDS,
  buildLiveGpsCoursePresenceRoutes,
  pointToPolylineDistanceYards,
  resolveLiveGpsCoursePresence,
} from '@/lib/gps/liveCoursePresence';
import type { LiveGpsMappedHole, LiveGpsPoint } from '@/lib/gps/liveMappingTypes';

const METERS_PER_DEGREE = 111320;
const METERS_PER_YARD = 0.9144;

function pointEastOf(point: LiveGpsPoint, yards: number): LiveGpsPoint {
  const lngOffset = (yards * METERS_PER_YARD)
    / (METERS_PER_DEGREE * Math.cos((point.lat * Math.PI) / 180));

  return {
    lat: point.lat,
    lng: point.lng + lngOffset,
  };
}

function mappedHole(overrides: Partial<LiveGpsMappedHole> = {}): LiveGpsMappedHole {
  return {
    holeNumber: 1,
    tee: { lat: 49.9, lng: -97.1 },
    green: {
      front: { lat: 49.9038, lng: -97.1001 },
      center: { lat: 49.904, lng: -97.1 },
      back: { lat: 49.9042, lng: -97.0999 },
    },
    targets: [
      { label: 'Fairway', point: { lat: 49.9014, lng: -97.1 } },
      { label: 'Approach', point: { lat: 49.9028, lng: -97.1 } },
    ],
    ...overrides,
  };
}

describe('pointToPolylineDistanceYards', () => {
  const route = [
    { lat: 49.9, lng: -97.1 },
    { lat: 49.904, lng: -97.1 },
  ];

  it('returns approximately zero for a point directly on a two-point route', () => {
    expect(pointToPolylineDistanceYards({ lat: 49.902, lng: -97.1 }, route)).toBeCloseTo(0, 5);
  });

  it('returns the perpendicular distance for a point beside a segment', () => {
    const pointOnRoute = { lat: 49.902, lng: -97.1 };
    const besideRoute = pointEastOf(pointOnRoute, 125);

    expect(pointToPolylineDistanceYards(besideRoute, route)).toBeCloseTo(
      distanceYards(pointOnRoute, besideRoute),
      0,
    );
  });

  it('uses the tee endpoint for a point before the first route point', () => {
    const beforeTee = { lat: 49.899, lng: -97.1 };

    expect(pointToPolylineDistanceYards(beforeTee, route)).toBeCloseTo(
      distanceYards(beforeTee, route[0]),
      0,
    );
  });

  it('uses the green endpoint for a point beyond the final route point', () => {
    const beyondGreen = { lat: 49.905, lng: -97.1 };

    expect(pointToPolylineDistanceYards(beyondGreen, route)).toBeCloseTo(
      distanceYards(beyondGreen, route[1]),
      0,
    );
  });

  it('selects the closest segment on a multi-segment dogleg', () => {
    const dogleg = [
      { lat: 49.9, lng: -97.1 },
      { lat: 49.902, lng: -97.1 },
      { lat: 49.902, lng: -97.096 },
    ];
    const pointBesideSecondLeg = { lat: 49.9024, lng: -97.098 };

    expect(pointToPolylineDistanceYards(pointBesideSecondLeg, dogleg)).toBeLessThan(55);
  });

  it('handles duplicate route points without breaking calculation', () => {
    const pointOnRoute = { lat: 49.902, lng: -97.1 };
    const routeWithDuplicate = [route[0], route[0], route[1]];

    expect(pointToPolylineDistanceYards(pointOnRoute, routeWithDuplicate)).toBeCloseTo(0, 5);
  });

  it('fails safely for invalid or insufficient geometry', () => {
    expect(pointToPolylineDistanceYards({ lat: 49.9, lng: -97.1 }, [route[0]])).toBeNull();
    expect(pointToPolylineDistanceYards({ lat: Number.NaN, lng: -97.1 }, route)).toBeNull();
  });
});

describe('buildLiveGpsCoursePresenceRoutes', () => {
  it('builds a par 3 route from tee to green center', () => {
    expect(buildLiveGpsCoursePresenceRoutes([mappedHole({ targets: [] })])[0].points).toEqual([
      mappedHole({ targets: [] }).tee,
      mappedHole({ targets: [] }).green.center,
    ]);
  });

  it('builds a one-target route', () => {
    const hole = mappedHole({ targets: [{ label: 'Only Target', point: { lat: 49.902, lng: -97.1 } }] });

    expect(buildLiveGpsCoursePresenceRoutes([hole])[0].points).toEqual([
      hole.tee,
      hole.targets[0].point,
      hole.green.center,
    ]);
  });

  it('builds a two-target route and ignores invalid target points', () => {
    const hole = mappedHole({
      targets: [
        { label: 'Valid', point: { lat: 49.901, lng: -97.1 } },
        { label: 'Invalid', point: { lat: Number.NaN, lng: -97.1 } },
      ],
    });

    expect(buildLiveGpsCoursePresenceRoutes([hole])[0].points).toEqual([
      hole.tee,
      hole.targets[0].point,
      hole.green.center,
    ]);
  });
});

describe('resolveLiveGpsCoursePresence', () => {
  const primaryHole = mappedHole();
  const adjacentHole = mappedHole({
    holeNumber: 2,
    tee: { lat: 49.9, lng: -97.108 },
    green: {
      front: { lat: 49.9038, lng: -97.1081 },
      center: { lat: 49.904, lng: -97.108 },
      back: { lat: 49.9042, lng: -97.1079 },
    },
    targets: [],
  });
  const activeFairway = { lat: 49.902, lng: -97.1 };
  const nearbyHome = pointEastOf(activeFairway, 300);
  const boundary = pointEastOf(activeFairway, COURSE_PRESENCE_ENTER_YARDS + 25);

  it('uses the named conservative enter and exit thresholds', () => {
    expect(COURSE_PRESENCE_ENTER_YARDS).toBe(200);
    expect(COURSE_PRESENCE_EXIT_YARDS).toBe(250);
  });

  it('treats no accepted fix as off-course', () => {
    expect(resolveLiveGpsCoursePresence({
      position: null,
      holes: [primaryHole],
      wasOnCourse: false,
    })).toEqual({
      isOnCourse: false,
      minimumDistanceYards: null,
      reason: 'no_position',
    });
  });

  it('fails open to existing active-hole behaviour when no usable course geometry exists', () => {
    expect(resolveLiveGpsCoursePresence({
      position: activeFairway,
      holes: [],
      wasOnCourse: false,
    })).toEqual({
      isOnCourse: true,
      minimumDistanceYards: null,
      reason: 'no_course_geometry',
    });
  });

  it('enters course-present mode inside the enter threshold', () => {
    const result = resolveLiveGpsCoursePresence({
      position: pointEastOf(activeFairway, 175),
      holes: [primaryHole],
      wasOnCourse: false,
    });

    expect(result.isOnCourse).toBe(true);
    expect(result.reason).toBe('within_enter_distance');
  });

  it('stays off-course just outside enter threshold when previously off-course', () => {
    const result = resolveLiveGpsCoursePresence({
      position: boundary,
      holes: [primaryHole],
      wasOnCourse: false,
    });

    expect(result.isOnCourse).toBe(false);
    expect(result.reason).toBe('outside_course');
  });

  it('stays on-course between enter and exit after previously being on-course', () => {
    const result = resolveLiveGpsCoursePresence({
      position: boundary,
      holes: [primaryHole],
      wasOnCourse: true,
    });

    expect(result.isOnCourse).toBe(true);
    expect(result.reason).toBe('within_exit_distance');
  });

  it('falls back off-course beyond the exit threshold', () => {
    const result = resolveLiveGpsCoursePresence({
      position: pointEastOf(activeFairway, COURSE_PRESENCE_EXIT_YARDS + 20),
      holes: [primaryHole],
      wasOnCourse: true,
    });

    expect(result.isOnCourse).toBe(false);
    expect(result.reason).toBe('outside_course');
  });

  it('calculates minimum distance across all mapped holes, not only the active hole', () => {
    const adjacentFairway = { lat: 49.902, lng: -97.108 };
    const result = resolveLiveGpsCoursePresence({
      position: adjacentFairway,
      holes: [primaryHole, adjacentHole],
      wasOnCourse: false,
    });

    expect(result.isOnCourse).toBe(true);
    expect(result.minimumDistanceYards).toBeCloseTo(0, 5);
  });

  it('keeps a recovery position in an adjacent fairway course-present', () => {
    const recoveryPosition = pointEastOf({ lat: 49.902, lng: -97.108 }, 125);

    expect(resolveLiveGpsCoursePresence({
      position: recoveryPosition,
      holes: [primaryHole, adjacentHole],
      wasOnCourse: false,
    }).isOnCourse).toBe(true);
  });

  it('treats a nearby home about 300 yards from every mapped route as off-course', () => {
    const result = resolveLiveGpsCoursePresence({
      position: nearbyHome,
      holes: [primaryHole],
      wasOnCourse: true,
    });

    expect(result.isOnCourse).toBe(false);
    expect(result.minimumDistanceYards).toBeGreaterThan(250);
  });

  it('does not depend on active-hole state, so hole changes do not reset course presence', () => {
    const position = pointEastOf(activeFairway, 225);
    const beforeHoleChange = resolveLiveGpsCoursePresence({
      position,
      holes: [primaryHole, adjacentHole],
      wasOnCourse: true,
    });
    const afterHoleChange = resolveLiveGpsCoursePresence({
      position,
      holes: [adjacentHole, primaryHole],
      wasOnCourse: true,
    });

    expect(beforeHoleChange).toEqual(afterHoleChange);
  });
});
