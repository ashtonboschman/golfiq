import { selectRelevantLiveRouteTargets } from '@/lib/gps/liveTargetRelevance';
import type { LiveGpsPoint } from '@/lib/gps/liveMappingTypes';

const EARTH_RADIUS_METERS = 6371008.8;
const METERS_TO_YARDS = 1.0936132983;
const tee: LiveGpsPoint = { lat: 49.9, lng: -97.1 };

function pointAtRouteYards(yards: number): LiveGpsPoint {
  const meters = yards / METERS_TO_YARDS;
  return {
    lat: tee.lat + (meters / EARTH_RADIUS_METERS) * (180 / Math.PI),
    lng: tee.lng,
  };
}

function select(args: {
  targets: number[];
  green: number;
  user: number | null;
}) {
  return selectRelevantLiveRouteTargets({
    tee,
    targets: args.targets.map(pointAtRouteYards),
    greenCenter: pointAtRouteYards(args.green),
    userPosition: args.user === null ? null : pointAtRouteYards(args.user),
  });
}

describe('selectRelevantLiveRouteTargets', () => {
  it('preserves the static route when user location is unavailable', () => {
    expect(select({ targets: [100, 250], green: 400, user: null })).toEqual([
      pointAtRouteYards(100),
      pointAtRouteYards(250),
    ]);
  });

  it('keeps a target when the user is more than 50 route-yards behind it', () => {
    expect(select({ targets: [100], green: 400, user: 40 })).toHaveLength(1);
  });

  it('prunes a target when the user is less than 50 route-yards behind it', () => {
    expect(select({ targets: [100], green: 400, user: 60 })).toEqual([]);
  });

  it.each([100, 120])('prunes a target when the user is at or past it', (user) => {
    expect(select({ targets: [100], green: 400, user })).toEqual([]);
  });

  it('prunes every intermediate target inside 200 straight-line yards to green', () => {
    expect(select({ targets: [250, 300], green: 400, user: 210 })).toEqual([]);
  });

  it('prunes a target less than 50 route-yards short of green', () => {
    expect(select({ targets: [360], green: 400, user: 0 })).toEqual([]);
  });

  it('prunes the short par 4 target once the user is inside 200 yards to green', () => {
    expect(select({ targets: [172], green: 287, user: 110 })).toEqual([]);
  });

  it('prunes target 1 but keeps target 2 when the user nears the first par 5 target', () => {
    expect(select({ targets: [250, 350], green: 500, user: 225 })).toEqual([
      pointAtRouteYards(350),
    ]);
  });

  it('keeps both par 5 targets after a topped tee shot', () => {
    expect(select({ targets: [250, 350], green: 500, user: 25 })).toHaveLength(2);
  });

  it('handles a zero-length segment without crashing', () => {
    expect(() => select({ targets: [0, 250], green: 500, user: 10 })).not.toThrow();
    expect(select({ targets: [0, 250], green: 500, user: 10 })).toEqual([
      pointAtRouteYards(250),
    ]);
  });

  it('ignores invalid points and does not crash on reversed route geometry', () => {
    const invalidPoint = { lat: Number.NaN, lng: tee.lng };
    expect(selectRelevantLiveRouteTargets({
      tee,
      targets: [invalidPoint, pointAtRouteYards(250)],
      greenCenter: pointAtRouteYards(500),
      userPosition: null,
    })).toEqual([
      pointAtRouteYards(250),
    ]);
    expect(() => select({ targets: [300, 150], green: 400, user: 40 })).not.toThrow();
  });

  it('returns no more than two intermediate targets', () => {
    expect(select({ targets: [150, 250, 350], green: 500, user: 0 })).toHaveLength(2);
  });

  it('is deterministic immediately around the 50 and 200 yard thresholds', () => {
    expect(select({ targets: [100], green: 400, user: 49 })).toHaveLength(1);
    expect(select({ targets: [100], green: 400, user: 51 })).toEqual([]);
    expect(select({ targets: [250], green: 400, user: 199 })).toHaveLength(1);
    expect(select({ targets: [250], green: 400, user: 201 })).toEqual([]);
  });
});
