'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import GoogleGpsHoleMap from '@/components/gps/GoogleGpsHoleMap';
import { distanceYards } from '@/lib/gps/distance';
import {
  buildLiveGpsCoursePresenceRoutes,
  resolveLiveGpsCoursePresenceFromRoutes,
} from '@/lib/gps/liveCoursePresence';
import {
  defaultLiveGpsIntermediateTargets,
  resolveLiveGpsMeasurementOrigin,
} from '@/lib/gps/liveRoute';
import { selectRelevantLiveRouteTargets } from '@/lib/gps/liveTargetRelevance';
import {
  resolveClubSuggestion,
  type ClubSuggestionClub,
} from '@/lib/clubs/clubSuggestion';
import { resolveActiveTargetYards } from '@/lib/gps/routeYardage';
import type { LiveGpsMappedHole, LiveGpsPoint } from '@/lib/gps/liveMappingTypes';
import type { CurrentLocationState, GpsHoleMapConfig } from '@/lib/gps/types';

type LiveGpsHoleMapProps = {
  apiKey: string | undefined;
  hole: LiveGpsMappedHole;
  courseHoles?: LiveGpsMappedHole[] | null;
  par: number | null;
  routeKey: string;
  userPosition?: LiveGpsPoint | null;
  userAccuracyMeters?: number | null;
  testLocationEnabled?: boolean;
  suggestionClubs?: ClubSuggestionClub[];
  onMapReady?: () => void;
  onMapError?: (message: string) => void;
};

type RouteState = {
  key: string;
  targets: LiveGpsPoint[] | null;
};

type TeeState = {
  key: string;
  position: LiveGpsPoint | null;
};

type CameraState = {
  key: string;
  dirty: boolean;
};

type TestLocationState = {
  key: string;
  position: LiveGpsPoint | null;
};

const noop = () => {};
const EMPTY_SUGGESTION_CLUBS: ClubSuggestionClub[] = [];

function samePoint(a: LiveGpsPoint | null | undefined, b: LiveGpsPoint | null | undefined) {
  return a?.lat === b?.lat && a?.lng === b?.lng;
}

function midpoint(from: LiveGpsPoint, to: LiveGpsPoint): LiveGpsPoint {
  return {
    lat: (from.lat + to.lat) / 2,
    lng: (from.lng + to.lng) / 2,
  };
}

export default function LiveGpsHoleMap({
  apiKey,
  hole,
  courseHoles = null,
  par,
  routeKey,
  userPosition = null,
  userAccuracyMeters = null,
  testLocationEnabled = false,
  suggestionClubs = EMPTY_SUGGESTION_CLUBS,
  onMapReady,
  onMapError,
}: LiveGpsHoleMapProps) {
  const [routeState, setRouteState] = useState<RouteState>({
    key: routeKey,
    targets: null,
  });
  const [teeState, setTeeState] = useState<TeeState>({
    key: routeKey,
    position: null,
  });
  const [cameraState, setCameraState] = useState<CameraState>({
    key: routeKey,
    dirty: false,
  });
  const [testLocationState, setTestLocationState] = useState<TestLocationState>({
    key: routeKey,
    position: null,
  });
  const [wasCoursePresent, rememberCoursePresence] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  );
  const [autoFitRequest, setAutoFitRequest] = useState(0);
  const customTee = teeState.key === routeKey ? teeState.position : null;
  const tee = customTee ?? hole.tee;
  const customTestPosition = testLocationState.key === routeKey
    ? testLocationState.position
    : null;
  const effectiveUserPosition = testLocationEnabled
    ? customTestPosition ?? tee
    : userPosition;
  const effectiveUserAccuracy = testLocationEnabled ? 0 : userAccuracyMeters;
  const holeWithTee = useMemo(
    () => ({ ...hole, tee }),
    [hole, tee],
  );
  const coursePresenceRoutes = useMemo(
    () => buildLiveGpsCoursePresenceRoutes(courseHoles ?? [hole]),
    [courseHoles, hole],
  );
  const defaultRouteTargets = useMemo(
    () => defaultLiveGpsIntermediateTargets(holeWithTee, par),
    [holeWithTee, par],
  );
  const customRouteTargets = routeState.key === routeKey ? routeState.targets : null;
  const isManualRoute = customRouteTargets !== null;
  const allRouteTargets = customRouteTargets ?? defaultRouteTargets;
  const hasCustomTarget = routeState.key === routeKey && routeState.targets !== null;
  const hasCustomTee = customTee !== null;
  const cameraDirty = cameraState.key === routeKey && cameraState.dirty;
  const config = useMemo<GpsHoleMapConfig>(() => ({
    courseName: 'Live Round',
    holeNumber: hole.holeNumber,
    par: par ?? 3,
    scorecardYardage: null,
    tee,
    greenFront: hole.green.front,
    greenCenter: hole.green.center,
    greenBack: hole.green.back,
    defaultTarget: defaultRouteTargets[0] ?? hole.green.center,
    recommendedTargets: hole.targets,
    mapCenter: midpoint(tee, hole.green.center),
    mapZoom: 17,
    mapBearing: 0,
    mapTilt: 0,
  }), [defaultRouteTargets, hole, par, tee]);
  const coursePresence = useMemo(
    () => (testLocationEnabled
      ? {
        isOnCourse: true,
        minimumDistanceYards: null,
        reason: 'within_enter_distance' as const,
      }
      : resolveLiveGpsCoursePresenceFromRoutes({
        position: effectiveUserPosition,
        routes: coursePresenceRoutes,
        wasOnCourse: wasCoursePresent,
      })),
    [coursePresenceRoutes, effectiveUserPosition, testLocationEnabled, wasCoursePresent],
  );
  useEffect(() => {
    if (testLocationEnabled) return;
    if (coursePresence.isOnCourse === wasCoursePresent) return;
    rememberCoursePresence(coursePresence.isOnCourse);
  }, [coursePresence.isOnCourse, testLocationEnabled, wasCoursePresent]);
  const measurementOrigin = useMemo(() => {
    if (!testLocationEnabled && effectiveUserPosition && !coursePresence.isOnCourse) {
      return {
        position: holeWithTee.tee,
        usingTeeFallback: true,
        reason: 'GPS is away from the mapped course, so distances are measured from the tee.',
      };
    }

    return resolveLiveGpsMeasurementOrigin({
      position: effectiveUserPosition,
      accuracyMeters: effectiveUserAccuracy,
      hole: holeWithTee,
    });
  }, [
    coursePresence.isOnCourse,
    effectiveUserAccuracy,
    effectiveUserPosition,
    holeWithTee,
    testLocationEnabled,
  ]);
  const currentLocation = useMemo<CurrentLocationState>(() => ({
    status: effectiveUserPosition ? 'granted' : 'idle',
    position: effectiveUserPosition,
    accuracyMeters: effectiveUserPosition ? effectiveUserAccuracy : null,
    message: null,
  }), [effectiveUserAccuracy, effectiveUserPosition]);
  const routeTargets = useMemo(
    () => (isManualRoute
      ? allRouteTargets
      : selectRelevantLiveRouteTargets({
        tee,
        targets: allRouteTargets,
        greenCenter: hole.green.center,
        userPosition: measurementOrigin.usingTeeFallback
          ? null
          : measurementOrigin.position,
      })),
    [allRouteTargets, hole.green.center, isManualRoute, measurementOrigin, tee],
  );
  const targetPath = useMemo(
    () => (routeTargets.length > 0
      ? [...routeTargets, hole.green.center]
      : [hole.green.center]),
    [hole.green.center, routeTargets],
  );
  const greenDistances = useMemo(() => ({
    front: distanceYards(measurementOrigin.position, hole.green.front),
    middle: distanceYards(measurementOrigin.position, hole.green.center),
    back: distanceYards(measurementOrigin.position, hole.green.back),
  }), [hole.green, measurementOrigin.position]);
  const activeTargetYards = useMemo(
    () => resolveActiveTargetYards(measurementOrigin.position, targetPath),
    [measurementOrigin.position, targetPath],
  );
  const displayedSuggestion = useMemo(
    () => (activeTargetYards === null
      ? null
      : resolveClubSuggestion({ targetYards: activeTargetYards, clubs: suggestionClubs })),
    [activeTargetYards, suggestionClubs],
  );

  const handleTargetChange = useCallback((nextTarget: LiveGpsPoint, targetIndex = 0) => {
    setRouteState((current) => {
      const currentManualTargets = current.key === routeKey ? current.targets : null;
      const baseTargets = currentManualTargets ?? routeTargets;
      const nextTargets = baseTargets.length > 0
        ? [...baseTargets]
        : [hole.green.center];
      const boundedTargetIndex = Math.max(0, Math.min(targetIndex, nextTargets.length - 1));
      if (samePoint(nextTargets[boundedTargetIndex], nextTarget)) {
        return current;
      }
      nextTargets[boundedTargetIndex] = nextTarget;
      return { key: routeKey, targets: nextTargets };
    });
  }, [hole.green.center, routeKey, routeTargets]);

  const handleTargetToGreenCenter = useCallback(() => {
    setRouteState({ key: routeKey, targets: [] });
  }, [routeKey]);

  const handleTeeChange = useCallback((position: LiveGpsPoint) => {
    setTeeState({ key: routeKey, position });
  }, [routeKey]);

  const handleTestUserPositionChange = useCallback((position: LiveGpsPoint) => {
    setTestLocationState({ key: routeKey, position });
  }, [routeKey]);

  const handleCameraInteraction = useCallback((dirty: boolean) => {
    setCameraState((current) => (
      current.key === routeKey && current.dirty === dirty
        ? current
        : { key: routeKey, dirty }
    ));
  }, [routeKey]);

  const handleResetMap = useCallback(() => {
    setRouteState({ key: routeKey, targets: null });
    setTeeState({ key: routeKey, position: null });
    setCameraState({ key: routeKey, dirty: false });
    setAutoFitRequest((current) => current + 1);
  }, [routeKey]);

  return (
    <div className="live-round-gps-interactive-shell">
      <GoogleGpsHoleMap
        config={config}
        activeHoleIndex={routeKey}
        routeTargets={routeTargets}
        targetPath={targetPath}
        clubSuggestion={displayedSuggestion}
        currentLocation={currentLocation}
        measurementOrigin={measurementOrigin.position}
        greenDistances={greenDistances}
        apiKey={apiKey}
        onTargetChange={handleTargetChange}
        onTargetToGreenCenter={handleTargetToGreenCenter}
        onTeeChange={handleTeeChange}
        onUserPositionChange={testLocationEnabled ? handleTestUserPositionChange : undefined}
        editModeEnabled={false}
        selectedEditField="tee"
        onEditFieldSelect={noop}
        onEditPointChange={noop}
        onCameraChange={noop}
        onCameraInteraction={handleCameraInteraction}
        onMapReady={onMapReady}
        onMapError={onMapError}
        useDerivedCamera
        autoFitRequest={autoFitRequest}
      />
      {(hasCustomTarget || hasCustomTee || cameraDirty) && (
        <button
          type="button"
          className="btn btn-secondary live-round-gps-reset-target"
          onClick={handleResetMap}
          aria-label="Reset Map and Target"
          title="Reset Map and Target"
        >
          <RotateCcw size={19} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
