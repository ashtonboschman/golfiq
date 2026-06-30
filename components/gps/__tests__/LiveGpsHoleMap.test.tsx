/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveGpsHoleMap from '@/components/gps/LiveGpsHoleMap';
import { distanceYards } from '@/lib/gps/distance';
import type { LiveGpsMappedHole, LiveGpsPoint } from '@/lib/gps/liveMappingTypes';

type MockMapProps = {
  variant?: 'prototype' | 'live';
  activeHoleIndex: number | string;
  config: { holeNumber: number; tee: LiveGpsPoint };
  routeTargets: LiveGpsPoint[];
  targetPath: LiveGpsPoint[];
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

    expect(currentMapProps().currentLocation.position).toEqual(poorAccuracyPosition);
    expect(currentMapProps().measurementOrigin).toEqual(hole.tee);
    expect(currentMapProps().greenDistances.middle).toBeCloseTo(
      distanceYards(hole.tee, hole.green.center),
    );
    expect(currentMapProps().routeTargets).toEqual([hole.targets[0].point]);
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
