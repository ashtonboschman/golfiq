/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveGpsHoleMap from '@/components/gps/LiveGpsHoleMap';
import { distanceYards } from '@/lib/gps/distance';
import { resolveActiveTargetYards } from '@/lib/gps/routeYardage';
import type { LiveGpsMappedHole, LiveGpsPoint } from '@/lib/gps/liveMappingTypes';

const METERS_PER_DEGREE = 111320;
const METERS_PER_YARD = 0.9144;

type MockMapProps = {
  variant?: 'prototype' | 'live';
  activeHoleIndex: number | string;
  config: { holeNumber: number; tee: LiveGpsPoint };
  routeTargets: LiveGpsPoint[];
  targetPath: LiveGpsPoint[];
  clubSuggestion?: { shortLabel: string } | null;
  measurementOrigin: LiveGpsPoint | null;
  greenDistances: { front: number | null; middle: number | null; back: number | null };
  currentLocation: { position: LiveGpsPoint | null; accuracyMeters: number | null };
  onTargetChange: (target: LiveGpsPoint, targetIndex?: number) => void;
  onTargetToGreenCenter: () => void;
  onTeeChange?: (tee: LiveGpsPoint) => void;
  onUserPositionChange?: (position: LiveGpsPoint) => void;
  onCameraInteraction?: (dirty: boolean) => void;
  autoFitRequest: number;
};

let mockMapProps: MockMapProps | null = null;

jest.mock('@/components/gps/GoogleGpsHoleMap', () => ({
  __esModule: true,
  default: (props: MockMapProps) => {
    mockMapProps = props;
    const targetYardsFromTee = (yards: number): LiveGpsPoint => ({
      lat: 49.9 + ((yards * 0.9144) / 111320),
      lng: -97.1,
    });

    return (
      <div
        data-testid="prototype-map"
        data-variant={props.variant}
        data-hole={props.config.holeNumber}
      >
        <button
          type="button"
          onClick={() => props.onTargetChange({ lat: 49.9006, lng: -97.1006 }, 0)}
        >
          Move Target
        </button>
        <button
          type="button"
          onClick={() => props.onTargetChange({ lat: 49.9013, lng: -97.1013 }, 0)}
        >
          Tap Map
        </button>
        <button type="button" onClick={props.onTargetToGreenCenter}>
          Target Green
        </button>
        <button
          type="button"
          onClick={() => props.onTeeChange?.({ lat: 49.8998, lng: -97.0998 })}
        >
          Move Tee
        </button>
        <button
          type="button"
          onClick={() => props.onUserPositionChange?.({ lat: 49.9011, lng: -97.1011 })}
        >
          Move Test User
        </button>
        <button type="button" onClick={() => props.onTargetChange(targetYardsFromTee(155), 0)}>
          Target 155
        </button>
        <button type="button" onClick={() => props.onTargetChange(targetYardsFromTee(154), 0)}>
          Target 154
        </button>
        <button type="button" onClick={() => props.onTargetChange(targetYardsFromTee(153), 0)}>
          Target 153
        </button>
        <button type="button" onClick={() => props.onTargetChange(targetYardsFromTee(100), 0)}>
          Target 100
        </button>
        <button type="button" onClick={() => props.onTargetChange(targetYardsFromTee(98), 0)}>
          Target 98
        </button>
        <button type="button" onClick={() => props.onTargetChange(targetYardsFromTee(97), 0)}>
          Target 97
        </button>
        <button type="button" onClick={() => props.onCameraInteraction?.(true)}>
          Move Camera
        </button>
        <button type="button" onClick={() => props.onCameraInteraction?.(false)}>
          Default Camera
        </button>
      </div>
    );
  },
}));

function mappedHole(holeNumber: number): LiveGpsMappedHole {
  return {
    holeNumber,
    tee: { lat: 49.9, lng: -97.1 },
    green: {
      front: { lat: 49.9018, lng: -97.1018 },
      center: { lat: 49.902, lng: -97.102 },
      back: { lat: 49.9022, lng: -97.1022 },
    },
    targets: [
      { label: 'Layup', point: { lat: 49.9004, lng: -97.1004 } },
      { label: 'Carry', point: { lat: 49.9008, lng: -97.1008 } },
    ],
  };
}

function pointBesideRoute(from: LiveGpsPoint, to: LiveGpsPoint, yards: number): LiveGpsPoint {
  const base = {
    lat: (from.lat + to.lat) / 2,
    lng: (from.lng + to.lng) / 2,
  };
  const averageLat = ((from.lat + to.lat) / 2) * (Math.PI / 180);
  const routeX = ((to.lng - from.lng) * METERS_PER_DEGREE * Math.cos(averageLat)) / METERS_PER_YARD;
  const routeY = ((to.lat - from.lat) * METERS_PER_DEGREE) / METERS_PER_YARD;
  const routeLength = Math.hypot(routeX, routeY) || 1;
  const perpendicularX = (-routeY / routeLength) * yards;
  const perpendicularY = (routeX / routeLength) * yards;

  return {
    lat: base.lat + ((perpendicularY * METERS_PER_YARD) / METERS_PER_DEGREE),
    lng: base.lng + (
      (perpendicularX * METERS_PER_YARD)
      / (METERS_PER_DEGREE * Math.cos((base.lat * Math.PI) / 180))
    ),
  };
}

function currentMapProps() {
  if (!mockMapProps) throw new Error('Expected the prototype map to render.');
  return mockMapProps;
}

describe('LiveGpsHoleMap', () => {
  beforeEach(() => {
    mockMapProps = null;
  });

  it.each([
    { par: 3, expectedTargets: 0, expectedPath: 1 },
    { par: 4, expectedTargets: 1, expectedPath: 2 },
    { par: 5, expectedTargets: 2, expectedPath: 3 },
  ])('passes the par $par default route into the prototype map', ({
    par,
    expectedTargets,
    expectedPath,
  }) => {
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={mappedHole(par)}
        par={par}
        routeKey={`hole-${par}`}
      />,
    );

    expect(screen.getByTestId('prototype-map')).toHaveAttribute('data-variant', 'live');
    expect(currentMapProps().routeTargets).toHaveLength(expectedTargets);
    expect(currentMapProps().targetPath).toHaveLength(expectedPath);
  });

  it('updates the club suggestion at the closest-club boundary from either direction', async () => {
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={mappedHole(4)}
        par={4}
        routeKey="draft-4"
        suggestionClubs={[
          { clubDefinitionId: '100', shortLabel: '100', carryYards: 100, catalogueOrder: 1 },
          { clubDefinitionId: '97', shortLabel: '97', carryYards: 97, catalogueOrder: 2 },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Target 100' }));
    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('100'));

    fireEvent.click(screen.getByRole('button', { name: 'Target 98' }));
    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('97'));

    fireEvent.click(screen.getByRole('button', { name: 'Target 97' }));
    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('97'));

    fireEvent.click(screen.getByRole('button', { name: 'Target 100' }));
    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('100'));

    fireEvent.click(screen.getByRole('button', { name: 'Target 98' }));
    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('97'));
  });

  it('updates the club suggestion from active target and bag changes', async () => {
    const hole = mappedHole(4);
    const suggestionClubs = [
      { clubDefinitionId: 'pitching-wedge', shortLabel: 'PW', carryYards: 100, catalogueOrder: 310 },
      { clubDefinitionId: '7', shortLabel: '7I', carryYards: 160, catalogueOrder: 280 },
    ];
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        suggestionClubs={suggestionClubs}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Target 155' }));
    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('7I'));

    fireEvent.click(screen.getByRole('button', { name: 'Target 100' }));
    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('PW'));

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={mappedHole(5)}
        par={5}
        routeKey="draft-5"
        suggestionClubs={suggestionClubs}
      />,
    );
    await waitFor(() => expect(currentMapProps().clubSuggestion).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Target 155' }));
    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('7I'));

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={mappedHole(5)}
        par={5}
        routeKey="draft-5"
        suggestionClubs={[]}
      />,
    );
    await waitFor(() => expect(currentMapProps().clubSuggestion).toBeNull());
  });

  it('uses the normalized first route segment for club suggestions', async () => {
    const hole = {
      ...mappedHole(4),
      targets: [
        { label: 'Duplicate tee', point: { lat: 49.9, lng: -97.1 } },
      ],
    };
    const canonicalYards = resolveActiveTargetYards(hole.tee, [hole.tee, hole.green.center]);
    expect(canonicalYards).not.toBeNull();

    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-duplicate-target"
        suggestionClubs={[
          { clubDefinitionId: 'near-zero', shortLabel: 'NZ', carryYards: 1, catalogueOrder: 1 },
          { clubDefinitionId: 'normalized', shortLabel: 'NRM', carryYards: canonicalYards!, catalogueOrder: 2 },
        ]}
      />,
    );

    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('NRM'));
  });

  it('clears the club suggestion when no normalized first segment is available', async () => {
    const validHole = mappedHole(3);
    const blockedHole: LiveGpsMappedHole = {
      ...validHole,
      green: {
        front: validHole.tee,
        center: validHole.tee,
        back: validHole.tee,
      },
    };
    const canonicalYards = resolveActiveTargetYards(validHole.tee, [validHole.green.center]);
    expect(canonicalYards).not.toBeNull();
    const suggestionClubs = [
      { clubDefinitionId: 'valid', shortLabel: 'OK', carryYards: canonicalYards!, catalogueOrder: 1 },
    ];

    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={validHole}
        par={3}
        routeKey="draft-no-segment"
        suggestionClubs={suggestionClubs}
      />,
    );

    await waitFor(() => expect(currentMapProps().clubSuggestion?.shortLabel).toBe('OK'));

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={blockedHole}
        par={3}
        routeKey="draft-no-segment"
        suggestionClubs={suggestionClubs}
      />,
    );

    await waitFor(() => expect(currentMapProps().clubSuggestion).toBeNull());
  });

  it('supports custom targeting, green lock, and resetting the route', () => {
    const hole = mappedHole(5);
    render(
      <LiveGpsHoleMap apiKey="test-key" hole={hole} par={5} routeKey="draft-5" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move Target' }));
    expect(currentMapProps().routeTargets[0]).toEqual({ lat: 49.9006, lng: -97.1006 });
    expect(screen.getByRole('button', { name: 'Reset Map and Target' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Target Green' }));
    expect(currentMapProps().routeTargets).toEqual([]);
    expect(currentMapProps().targetPath).toEqual([hole.green.center]);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Map and Target' }));
    expect(currentMapProps().routeTargets).toEqual(hole.targets.map((target) => target.point));
    expect(screen.queryByRole('button', { name: 'Reset Map and Target' })).not.toBeInTheDocument();
  });

  it('shows the reset icon after camera movement and refits the camera', () => {
    const hole = mappedHole(4);
    render(
      <LiveGpsHoleMap apiKey="test-key" hole={hole} par={4} routeKey="draft-4" />,
    );

    expect(screen.queryByRole('button', { name: 'Reset Map and Target' })).not.toBeInTheDocument();
    expect(currentMapProps().autoFitRequest).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Move Camera' }));
    expect(screen.getByRole('button', { name: 'Reset Map and Target' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Default Camera' }));
    expect(screen.queryByRole('button', { name: 'Reset Map and Target' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move Camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset Map and Target' }));

    expect(currentMapProps().autoFitRequest).toBe(1);
    expect(screen.queryByRole('button', { name: 'Reset Map and Target' })).not.toBeInTheDocument();
  });

  it('keeps a moved tee ephemeral and restores the mapped tee on reset', () => {
    const hole = mappedHole(4);
    render(
      <LiveGpsHoleMap apiKey="test-key" hole={hole} par={4} routeKey="draft-4" />,
    );

    expect(currentMapProps().config.tee).toEqual(hole.tee);
    expect(currentMapProps().measurementOrigin).toEqual(hole.tee);

    fireEvent.click(screen.getByRole('button', { name: 'Move Tee' }));

    expect(currentMapProps().config.tee).toEqual({ lat: 49.8998, lng: -97.0998 });
    expect(currentMapProps().measurementOrigin).toEqual({ lat: 49.8998, lng: -97.0998 });
    expect(screen.getByRole('button', { name: 'Reset Map and Target' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Map and Target' }));

    expect(currentMapProps().config.tee).toEqual(hole.tee);
    expect(currentMapProps().measurementOrigin).toEqual(hole.tee);
    expect(screen.queryByRole('button', { name: 'Reset Map and Target' })).not.toBeInTheDocument();
  });

  it('preserves a dragged test location when resetting manual map state', () => {
    const hole = mappedHole(4);
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 50.1, lng: -97.3 }}
        userAccuracyMeters={500}
        testLocationEnabled
      />,
    );

    expect(currentMapProps().currentLocation.position).toEqual(hole.tee);
    expect(currentMapProps().currentLocation.accuracyMeters).toBe(0);
    expect(currentMapProps().onUserPositionChange).toEqual(expect.any(Function));

    fireEvent.click(screen.getByRole('button', { name: 'Move Test User' }));

    expect(currentMapProps().currentLocation.position).toEqual({
      lat: 49.9011,
      lng: -97.1011,
    });
    expect(currentMapProps().measurementOrigin).toEqual({
      lat: 49.9011,
      lng: -97.1011,
    });
    expect(screen.queryByRole('button', { name: 'Reset Map and Target' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move Target' }));
    expect(screen.getByRole('button', { name: 'Reset Map and Target' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Map and Target' }));

    expect(currentMapProps().currentLocation.position).toEqual({
      lat: 49.9011,
      lng: -97.1011,
    });
    expect(currentMapProps().measurementOrigin).toEqual({
      lat: 49.9011,
      lng: -97.1011,
    });
    expect(currentMapProps().routeTargets).toEqual([]);
    expect(currentMapProps().autoFitRequest).toBe(1);
    expect(screen.queryByRole('button', { name: 'Reset Map and Target' })).not.toBeInTheDocument();
  });

  it('updates the measurement origin and distances from ephemeral GPS changes', () => {
    const hole = mappedHole(4);
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 49.9005, lng: -97.1005 }}
        userAccuracyMeters={8}
      />,
    );

    const firstMiddleDistance = currentMapProps().greenDistances.middle;
    expect(currentMapProps().measurementOrigin).toEqual({ lat: 49.9005, lng: -97.1005 });
    expect(currentMapProps().currentLocation.accuracyMeters).toBe(8);

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 49.901, lng: -97.101 }}
        userAccuracyMeters={6}
      />,
    );

    expect(currentMapProps().measurementOrigin).toEqual({ lat: 49.901, lng: -97.101 });
    expect(currentMapProps().greenDistances.middle).not.toBe(firstMiddleDistance);
  });

  it('shows a poor real GPS fix without using it for distances or route pruning', () => {
    const hole = mappedHole(4);
    const poorAccuracyPosition = { lat: 49.901, lng: -97.101 };
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={poorAccuracyPosition}
        userAccuracyMeters={30}
      />,
    );

    expect(currentMapProps().currentLocation.position).toBeNull();
    expect(currentMapProps().currentLocation.accuracyMeters).toBeNull();
    expect(currentMapProps().measurementOrigin).toEqual(hole.tee);
    expect(currentMapProps().greenDistances.middle).toBeCloseTo(
      distanceYards(hole.tee, hole.green.center),
    );
    expect(currentMapProps().routeTargets).toEqual([hole.targets[0].point]);
  });

  it('uses tee fallback for a hole-unsuitable accepted fix without showing it as the golfer marker', () => {
    const hole = mappedHole(4);
    const offCoursePosition = { lat: 50.5, lng: -98 };
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={offCoursePosition}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().currentLocation.position).toBeNull();
    expect(currentMapProps().measurementOrigin).toEqual(hole.tee);

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 49.901, lng: -97.101 }}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().currentLocation.position).toEqual({ lat: 49.901, lng: -97.101 });
    expect(currentMapProps().measurementOrigin).toEqual({ lat: 49.901, lng: -97.101 });
  });

  it('uses tee fallback for an accepted fix near but outside the mapped course routes', () => {
    const hole = mappedHole(4);
    const nearbyHome = pointBesideRoute(hole.tee, hole.green.center, 300);
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        courseHoles={[hole]}
        par={4}
        routeKey="draft-4"
        userPosition={nearbyHome}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().currentLocation.position).toBeNull();
    expect(currentMapProps().measurementOrigin).toEqual(hole.tee);
    expect(currentMapProps().greenDistances.middle).toBeCloseTo(
      distanceYards(hole.tee, hole.green.center),
    );
    expect(currentMapProps().routeTargets).toEqual([hole.targets[0].point]);
  });

  it('uses the device origin when an accepted fix is inside the mapped course route envelope', () => {
    const hole = mappedHole(4);
    const courseBoundary = pointBesideRoute(hole.tee, hole.green.center, 150);
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        courseHoles={[hole]}
        par={4}
        routeKey="draft-4"
        userPosition={courseBoundary}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().currentLocation.position).toEqual(courseBoundary);
    expect(currentMapProps().measurementOrigin).toEqual(courseBoundary);
  });

  it('keeps the accepted fix available when course-present but active-hole suitability rejects it', () => {
    const activeHole = mappedHole(4);
    const adjacentHole: LiveGpsMappedHole = {
      ...mappedHole(5),
      holeNumber: 5,
      tee: { lat: 50.2, lng: -97.4 },
      green: {
        front: { lat: 50.2018, lng: -97.4018 },
        center: { lat: 50.202, lng: -97.402 },
        back: { lat: 50.2022, lng: -97.4022 },
      },
      targets: [],
    };
    const acceptedPosition = adjacentHole.tee;
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={activeHole}
        courseHoles={[activeHole, adjacentHole]}
        par={4}
        routeKey="draft-4"
        userPosition={acceptedPosition}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().currentLocation.position).toBeNull();
    expect(currentMapProps().measurementOrigin).toEqual(activeHole.tee);

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={adjacentHole}
        courseHoles={[activeHole, adjacentHole]}
        par={5}
        routeKey="draft-5"
        userPosition={acceptedPosition}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().currentLocation.position).toEqual(acceptedPosition);
    expect(currentMapProps().measurementOrigin).toEqual(acceptedPosition);
  });

  it('uses enter and exit hysteresis so boundary movement does not oscillate', async () => {
    const hole = mappedHole(4);
    const insideEnter = pointBesideRoute(hole.tee, hole.green.center, 150);
    const betweenEnterAndExit = pointBesideRoute(hole.tee, hole.green.center, 225);
    const outsideExit = pointBesideRoute(hole.tee, hole.green.center, 275);
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        courseHoles={[hole]}
        par={4}
        routeKey="draft-4"
        userPosition={insideEnter}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().measurementOrigin).toEqual(insideEnter);
    await waitFor(() => expect(currentMapProps().measurementOrigin).toEqual(insideEnter));
    const initialAutoFitRequest = currentMapProps().autoFitRequest;

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        courseHoles={[hole]}
        par={4}
        routeKey="draft-4"
        userPosition={betweenEnterAndExit}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().measurementOrigin).toEqual(betweenEnterAndExit);
    expect(currentMapProps().autoFitRequest).toBe(initialAutoFitRequest);

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        courseHoles={[hole]}
        par={4}
        routeKey="draft-4"
        userPosition={outsideExit}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().measurementOrigin).toEqual(hole.tee);
    expect(currentMapProps().currentLocation.position).toBeNull();

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        courseHoles={[hole]}
        par={4}
        routeKey="draft-4"
        userPosition={betweenEnterAndExit}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().measurementOrigin).toEqual(hole.tee);

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        courseHoles={[hole]}
        par={4}
        routeKey="draft-4"
        userPosition={insideEnter}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().measurementOrigin).toEqual(insideEnter);
  });

  it('does not reset course-presence state when the active hole changes', async () => {
    const firstHole = mappedHole(4);
    const secondHole: LiveGpsMappedHole = {
      ...mappedHole(5),
      holeNumber: 5,
      tee: { lat: 49.9006, lng: -97.1006 },
      green: {
        front: { lat: 49.9025, lng: -97.1025 },
        center: { lat: 49.9027, lng: -97.1027 },
        back: { lat: 49.9029, lng: -97.1029 },
      },
    };
    const insideEnter = pointBesideRoute(firstHole.tee, firstHole.green.center, 150);
    const betweenEnterAndExit = pointBesideRoute(firstHole.tee, firstHole.green.center, 225);
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={firstHole}
        courseHoles={[firstHole, secondHole]}
        par={4}
        routeKey="draft-4"
        userPosition={insideEnter}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().measurementOrigin).toEqual(insideEnter);
    await waitFor(() => expect(currentMapProps().measurementOrigin).toEqual(insideEnter));

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={secondHole}
        courseHoles={[firstHole, secondHole]}
        par={5}
        routeKey="draft-5"
        userPosition={betweenEnterAndExit}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().measurementOrigin).toEqual(betweenEnterAndExit);
  });

  it('lets Test GPS bypass course-presence rejection for route testing', () => {
    const hole = mappedHole(4);
    const nearbyHome = pointBesideRoute(hole.tee, hole.green.center, 300);
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        courseHoles={[hole]}
        par={4}
        routeKey="draft-4"
        userPosition={nearbyHome}
        userAccuracyMeters={8}
        testLocationEnabled
      />,
    );

    act(() => {
      currentMapProps().onUserPositionChange?.(nearbyHome);
    });

    expect(currentMapProps().currentLocation.position).toEqual(nearbyHome);
    expect(currentMapProps().measurementOrigin).toEqual(nearbyHome);
  });

  it('keeps automatic intermediate targets pruned inside 200 yards', () => {
    const hole = mappedHole(4);
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 49.901, lng: -97.101 }}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().routeTargets).toEqual([]);
    expect(currentMapProps().targetPath).toEqual([hole.green.center]);
  });

  it('keeps a manually dragged target inside 200 yards across location updates', () => {
    const hole = mappedHole(4);
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 49.901, lng: -97.101 }}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().routeTargets).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Move Target' }));
    expect(currentMapProps().routeTargets).toEqual([{ lat: 49.9006, lng: -97.1006 }]);

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 49.9011, lng: -97.1011 }}
        userAccuracyMeters={6}
      />,
    );

    expect(currentMapProps().routeTargets).toEqual([{ lat: 49.9006, lng: -97.1006 }]);
    expect(currentMapProps().measurementOrigin).toEqual({ lat: 49.9011, lng: -97.1011 });
  });

  it('creates and preserves a one-point manual route from a map tap inside 200 yards', () => {
    const hole = mappedHole(4);
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 49.901, lng: -97.101 }}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().routeTargets).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Tap Map' }));

    expect(currentMapProps().routeTargets).toEqual([{ lat: 49.9013, lng: -97.1013 }]);
    expect(currentMapProps().targetPath).toEqual([
      { lat: 49.9013, lng: -97.1013 },
      hole.green.center,
    ]);
  });

  it('keeps an explicit green-center lock stable across location updates', () => {
    const hole = mappedHole(4);
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 49.901, lng: -97.101 }}
        userAccuracyMeters={8}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Target Green' }));
    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={hole.tee}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().routeTargets).toEqual([]);
    expect(currentMapProps().targetPath).toEqual([hole.green.center]);
  });

  it('clears manual mode on reset and reapplies automatic pruning', () => {
    const hole = mappedHole(4);
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={{ lat: 49.901, lng: -97.101 }}
        userAccuracyMeters={8}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tap Map' }));
    expect(currentMapProps().routeTargets).toEqual([{ lat: 49.9013, lng: -97.1013 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Map and Target' }));
    expect(currentMapProps().routeTargets).toEqual([]);
    expect(currentMapProps().measurementOrigin).toEqual({ lat: 49.901, lng: -97.101 });

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={4}
        routeKey="draft-4"
        userPosition={hole.tee}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().routeTargets).toEqual([hole.targets[0].point]);
  });

  it('preserves a mid-hole test location and reapplies par 5 pruning on reset', () => {
    const hole = mappedHole(5);
    render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={5}
        routeKey="draft-5"
        testLocationEnabled
      />,
    );

    act(() => {
      currentMapProps().onUserPositionChange?.(hole.targets[0].point);
    });
    expect(currentMapProps().currentLocation.position).toEqual(hole.targets[0].point);
    expect(currentMapProps().routeTargets).toEqual([hole.targets[1].point]);

    const movedSecondTarget = { lat: 49.9012, lng: -97.1012 };
    act(() => {
      currentMapProps().onTargetChange(movedSecondTarget, 0);
    });
    expect(currentMapProps().routeTargets).toEqual([movedSecondTarget]);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Map and Target' }));

    expect(currentMapProps().currentLocation.position).toEqual(hole.targets[0].point);
    expect(currentMapProps().measurementOrigin).toEqual(hole.targets[0].point);
    expect(currentMapProps().routeTargets).toEqual([hole.targets[1].point]);
    expect(currentMapProps().routeTargets).not.toContainEqual(hole.targets[0].point);
    expect(currentMapProps().autoFitRequest).toBe(1);
  });

  it('prunes passed route targets while keeping the remaining target draggable', () => {
    const hole = mappedHole(5);
    const { rerender } = render(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={5}
        routeKey="draft-5"
        userPosition={hole.targets[0].point}
        userAccuracyMeters={8}
      />,
    );

    expect(currentMapProps().routeTargets).toEqual([hole.targets[1].point]);
    expect(currentMapProps().targetPath).toEqual([
      hole.targets[1].point,
      hole.green.center,
    ]);

    const movedSecondTarget = { lat: 49.9012, lng: -97.1012 };
    act(() => {
      currentMapProps().onTargetChange(movedSecondTarget, 0);
    });

    expect(currentMapProps().routeTargets).toEqual([movedSecondTarget]);

    rerender(
      <LiveGpsHoleMap
        apiKey="test-key"
        hole={hole}
        par={5}
        routeKey="draft-5"
        userPosition={{ lat: 49.9011, lng: -97.1011 }}
        userAccuracyMeters={6}
      />,
    );

    expect(currentMapProps().routeTargets).toEqual([movedSecondTarget]);
    expect(currentMapProps().routeTargets).not.toContainEqual(hole.targets[0].point);
  });

  it('returns to the mapped default route when the active draft changes', () => {
    const firstHole = mappedHole(4);
    const { rerender } = render(
      <LiveGpsHoleMap apiKey="test-key" hole={firstHole} par={4} routeKey="draft-1" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Target Green' }));
    expect(currentMapProps().routeTargets).toEqual([]);

    const nextHole = mappedHole(5);
    rerender(
      <LiveGpsHoleMap apiKey="test-key" hole={nextHole} par={5} routeKey="draft-2" />,
    );

    expect(currentMapProps().activeHoleIndex).toBe('draft-2');
    expect(currentMapProps().routeTargets).toEqual(nextHole.targets.map((target) => target.point));
  });

  it('updates the map camera key when the draft changes on the same physical hole', () => {
    const hole = mappedHole(1);
    const { rerender } = render(
      <LiveGpsHoleMap apiKey="test-key" hole={hole} par={4} routeKey="draft-pass-1" />,
    );
    expect(currentMapProps().activeHoleIndex).toBe('draft-pass-1');

    rerender(
      <LiveGpsHoleMap apiKey="test-key" hole={hole} par={4} routeKey="draft-pass-2" />,
    );

    expect(currentMapProps().activeHoleIndex).toBe('draft-pass-2');
  });
});
