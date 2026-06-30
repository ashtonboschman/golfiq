'use client';

import { useEffect, useRef, useState } from 'react';
import { distanceYards, formatYardNumber } from '@/lib/gps/distance';
import { deriveAnchoredGpsCamera, normalizeDegrees } from '@/lib/gps/derivedCamera';
import { loadGoogleMaps } from '@/lib/gps/googleMapsLoader';
import type {
  CurrentLocationState,
  GpsHolePrototypeConfig,
  GpsPrototypeEditField,
  LatLng,
} from '@/lib/gps/types';

type GoogleMapsEventHandler = (...args: never[]) => void;
type GoogleMapsEventListener = { remove: () => void };
type GoogleMapMouseEvent = { latLng: GoogleLatLng | null };

type GoogleLatLng = {
  lat: () => number;
  lng: () => number;
};

type GoogleCameraOptions = {
  center?: LatLng;
  zoom?: number;
  heading?: number;
  tilt?: number;
};

type GoogleMapOptions = GoogleCameraOptions & {
  mapTypeId: string;
  disableDefaultUI: boolean;
  cameraControl: boolean;
  fullscreenControl: boolean;
  keyboardShortcuts: boolean;
  mapTypeControl: boolean;
  rotateControl: boolean;
  scaleControl: boolean;
  streetViewControl: boolean;
  clickableIcons: boolean;
  disableDoubleClickZoom: boolean;
  isFractionalZoomEnabled: boolean;
  minZoom: number;
  maxZoom: number;
  renderingType?: unknown;
  headingInteractionEnabled?: boolean;
  tiltInteractionEnabled?: boolean;
};

type GoogleSymbolIcon = {
  path: unknown;
  fillColor: string;
  fillOpacity: number;
  scale: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
};

type GoogleImageIcon = {
  url: string;
  scaledSize: object;
  anchor: object;
};

type GoogleMarkerIcon = GoogleSymbolIcon | GoogleImageIcon | null;

type GoogleMarkerOptions = {
  map?: GoogleMap | null;
  position?: LatLng;
  clickable?: boolean;
  draggable?: boolean;
  title?: string;
  icon?: GoogleMarkerIcon;
  zIndex?: number;
};

type GoogleMarkerLabel = {
  text: string;
  color: string;
  fontSize: string;
  fontWeight: string;
};

type GoogleMap = {
  addListener: (eventName: string, handler: GoogleMapsEventHandler) => GoogleMapsEventListener;
  getCenter: () => GoogleLatLng | null;
  getHeading: () => number | undefined;
  getRenderingType?: () => unknown;
  getTilt: () => number | undefined;
  getZoom: () => number | undefined;
  moveCamera?: (options: GoogleCameraOptions) => void;
  setCenter: (center: LatLng) => void;
  setHeading: (heading: number) => void;
  setTilt: (tilt: number) => void;
  setZoom: (zoom: number) => void;
};

type GoogleMarker = {
  addListener: (eventName: string, handler: GoogleMapsEventHandler) => GoogleMapsEventListener;
  getPosition: () => GoogleLatLng | null;
  setDraggable: (draggable: boolean) => void;
  setIcon: (icon: GoogleMarkerIcon) => void;
  setLabel: (label: GoogleMarkerLabel) => void;
  setMap: (map: GoogleMap | null) => void;
  setPosition: (position: LatLng) => void;
  setZIndex: (zIndex: number) => void;
};

type GooglePolylineOptions = {
  map?: GoogleMap | null;
  clickable: boolean;
  geodesic: boolean;
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
  zIndex: number;
};

type GooglePolyline = {
  setMap: (map: GoogleMap | null) => void;
  setOptions: (options: GooglePolylineOptions) => void;
  setPath: (path: LatLng[]) => void;
};

type GoogleMapsNamespace = {
  Map: new (element: HTMLElement, options: GoogleMapOptions) => GoogleMap;
  Marker: {
    new (options?: GoogleMarkerOptions): GoogleMarker;
    MAX_ZINDEX: number;
  };
  Point: new (x: number, y: number) => object;
  Polyline: new (options: GooglePolylineOptions) => GooglePolyline;
  RenderingType: { VECTOR: unknown };
  Size: new (width: number, height: number) => object;
  SymbolPath: { CIRCLE: unknown };
};

type GoogleGpsHoleMapProps = {
  variant?: 'prototype' | 'live';
  config: GpsHolePrototypeConfig;
  activeHoleIndex: number | string;
  routeTargets: LatLng[];
  targetPath: LatLng[];
  currentLocation: CurrentLocationState;
  measurementOrigin: LatLng | null;
  greenDistances: {
    front: number | null;
    middle: number | null;
    back: number | null;
  };
  apiKey: string | undefined;
  onTargetChange: (target: LatLng, targetIndex?: number) => void;
  onTargetToGreenCenter: () => void;
  onTeeChange?: (tee: LatLng) => void;
  onUserPositionChange?: (position: LatLng) => void;
  editModeEnabled: boolean;
  selectedEditField: GpsPrototypeEditField;
  onEditFieldSelect: (field: GpsPrototypeEditField) => void;
  onEditPointChange: (field: GpsPrototypeEditField, point: LatLng) => void;
  onCameraChange: (camera: {
    center: LatLng;
    zoom: number;
    heading: number;
    tilt: number;
  }) => void;
  onCameraInteraction?: (dirty: boolean) => void;
  useDerivedCamera: boolean;
  autoFitRequest: number;
};

const SNAP_TO_GREEN_CENTER_YARDS = 10;
const MIN_MAP_ZOOM = 16;
const MAX_MAP_ZOOM = 19;
const CAMERA_CENTER_TOLERANCE_YARDS = 3;
const CAMERA_ZOOM_TOLERANCE = 0.05;
const CAMERA_ANGLE_TOLERANCE_DEGREES = 1;
const PLAY_TEE_MARKER_COLOR = '#94a3b8';
const PLAY_ENDPOINT_MARKER_SCALE = 6.25;
const ROUTE_LINE_DUPLICATE_TOLERANCE_YARDS = 0.5;
const ROUTE_LINE_OPTIONS = {
  clickable: false,
  geodesic: true,
  strokeColor: '#f8fafc',
  strokeOpacity: 0.9,
  strokeWeight: 2,
  zIndex: 30,
} satisfies GooglePolylineOptions;
const EDIT_MARKER_COLORS: Record<GpsPrototypeEditField, string> = {
  tee: '#38bdf8',
  greenFront: '#d9f99d',
  greenCenter: '#22c55e',
  greenBack: '#14532d',
  recommendedTarget1: '#c084fc',
  recommendedTarget2: '#a78bfa',
  mapCenter: '#f472b6',
};

function getGoogleMaps(): GoogleMapsNamespace | null {
  if (typeof window === 'undefined') return null;

  const googleValue: unknown = Reflect.get(window, 'google');
  if (typeof googleValue !== 'object' || googleValue === null) return null;

  const mapsValue: unknown = Reflect.get(googleValue, 'maps');
  if (typeof mapsValue !== 'object' || mapsValue === null) return null;

  const mapConstructor = Reflect.get(mapsValue, 'Map');
  const markerConstructor = Reflect.get(mapsValue, 'Marker');
  const polylineConstructor = Reflect.get(mapsValue, 'Polyline');
  if (
    typeof mapConstructor !== 'function'
    || typeof markerConstructor !== 'function'
    || typeof polylineConstructor !== 'function'
  ) {
    return null;
  }

  return mapsValue as GoogleMapsNamespace;
}

function toGoogleLatLngLiteral(point: LatLng): LatLng {
  return { lat: point.lat, lng: point.lng };
}

function isValidRoutePoint(point: LatLng | null | undefined): point is LatLng {
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

function normalizeRouteLinePath(origin: LatLng | null, targetPath: readonly LatLng[]) {
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

function fromGooglePosition(position: GoogleLatLng): LatLng {
  return {
    lat: position.lat(),
    lng: position.lng(),
  };
}

function midpoint(from: LatLng, to: LatLng): LatLng {
  return {
    lat: (from.lat + to.lat) / 2,
    lng: (from.lng + to.lng) / 2,
  };
}

function markerIcon(color: string, scale = 7): GoogleMarkerIcon {
  const googleMaps = getGoogleMaps();
  if (!googleMaps) return null;

  return {
    path: googleMaps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    scale,
    strokeColor: '#ffffff',
    strokeOpacity: 0.95,
    strokeWeight: 2,
  };
}

function playGreenMarkerIcon(size: 'center' | 'outer'): GoogleMarkerIcon {
  const googleMaps = getGoogleMaps();
  if (!googleMaps) return null;

  return {
    path: googleMaps.SymbolPath.CIRCLE,
    fillColor: size === 'center' ? EDIT_MARKER_COLORS.greenCenter : '#f8fafc',
    fillOpacity: 0.98,
    scale: size === 'center' ? PLAY_ENDPOINT_MARKER_SCALE : 4.75,
    strokeColor: size === 'center' ? '#ffffff' : '#f8fafc',
    strokeOpacity: size === 'center' ? 0.95 : 0,
    strokeWeight: size === 'center' ? 2 : 0,
  };
}

function targetIcon(): GoogleMarkerIcon {
  const googleMaps = getGoogleMaps();
  if (!googleMaps) return null;

  const size = 50;
  const center = size / 2;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${center}" cy="${center}" r="17" fill="rgba(15, 23, 42, 0.22)" stroke="#f8fafc" stroke-width="3" />
      <circle cx="${center}" cy="${center}" r="4.75" fill="#f8fafc" />
      <path d="M ${center} 4 V 12" stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round" />
      <path d="M ${center} 38 V 46" stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round" />
      <path d="M 4 ${center} H 12" stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round" />
      <path d="M 38 ${center} H 46" stroke="#f8fafc" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  `.trim();

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new googleMaps.Size(size, size),
    anchor: new googleMaps.Point(center, center),
  };
}

function editMarkerIcon(field: GpsPrototypeEditField): GoogleMarkerIcon {
  const googleMaps = getGoogleMaps();
  if (!googleMaps) return null;

  return {
    path: googleMaps.SymbolPath.CIRCLE,
    fillColor: EDIT_MARKER_COLORS[field],
    fillOpacity: 1,
    scale: field === 'mapCenter' ? 6 : 8,
    strokeColor: '#111827',
    strokeOpacity: 0.9,
    strokeWeight: 2,
  };
}

function distanceLabelIcon(): GoogleMarkerIcon {
  const googleMaps = getGoogleMaps();
  if (!googleMaps) return null;

  return {
    path: googleMaps.SymbolPath.CIRCLE,
    fillColor: '#161616',
    fillOpacity: 0.92,
    scale: 24,
    strokeColor: '#f8fafc',
    strokeOpacity: 0.16,
    strokeWeight: 1,
  };
}

function formatMapDistanceLabel(from: LatLng, to: LatLng) {
  return formatYardNumber(distanceYards(from, to));
}

function snapToGreenCenterIfClose(point: LatLng, greenCenter: LatLng): LatLng {
  return distanceYards(point, greenCenter) <= SNAP_TO_GREEN_CENTER_YARDS
    ? greenCenter
    : point;
}

function normalizeHeading(heading: number | undefined) {
  if (heading == null || !Number.isFinite(heading)) return 0;
  return normalizeDegrees(heading);
}

function clampZoom(zoom: number | undefined) {
  if (zoom == null || !Number.isFinite(zoom)) return MIN_MAP_ZOOM;
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, zoom));
}

function isGreenLockPath(targetPath: LatLng[], greenCenter: LatLng) {
  return (
    targetPath.length === 1 &&
    distanceYards(targetPath[0], greenCenter) <= SNAP_TO_GREEN_CENTER_YARDS
  );
}

function cameraDebugText(map: GoogleMap | null) {
  if (!map) return 'heading: -- | tilt: -- | rendering: --';

  const heading = map.getHeading();
  const tilt = map.getTilt();
  const renderingType = typeof map.getRenderingType === 'function'
    ? map.getRenderingType()
    : undefined;

  return `heading: ${Math.round(heading ?? 0)} | tilt: ${Math.round(tilt ?? 0)} | rendering: ${renderingType ?? 'unknown'}`;
}

function readMapCamera(map: GoogleMap) {
  const center = map.getCenter();

  if (!center) return null;

  return {
    center: fromGooglePosition(center),
    zoom: map.getZoom() ?? 0,
    heading: normalizeHeading(map.getHeading()),
    tilt: map.getTilt() ?? 0,
  };
}

function supportsWebGl2() {
  if (typeof document === 'undefined') return false;

  const canvas = document.createElement('canvas');
  return Boolean(canvas.getContext('webgl2'));
}

function derivedCameraForConfig(
  config: GpsHolePrototypeConfig,
  viewportWidth: number,
  viewportHeight: number,
  variant: 'prototype' | 'live' = 'prototype',
) {
  return deriveAnchoredGpsCamera(
    {
      tee: config.tee,
      target1: config.recommendedTargets?.[0]?.point ?? null,
      target2: config.recommendedTargets?.[1]?.point ?? null,
      greenFront: config.greenFront,
      greenCenter: config.greenCenter,
      greenBack: config.greenBack,
    },
    {
      viewportWidth,
      viewportHeight,
      minZoom: MIN_MAP_ZOOM,
      maxZoom: MAX_MAP_ZOOM,
      topGuideRatio: variant === 'live' ? 0.2 : undefined,
    },
  );
}

function headingMatches(expected: number | null, actual: number | null) {
  if (expected == null || actual == null) return false;
  const delta = Math.abs(normalizeHeading(expected) - normalizeHeading(actual));
  return Math.min(delta, 360 - delta) < 1;
}

function angleDelta(first: number, second: number) {
  const delta = Math.abs(normalizeHeading(first) - normalizeHeading(second));
  return Math.min(delta, 360 - delta);
}

export default function GoogleGpsHoleMap({
  variant = 'prototype',
  config,
  activeHoleIndex,
  routeTargets,
  targetPath,
  currentLocation,
  measurementOrigin,
  greenDistances,
  apiKey,
  onTargetChange,
  onTargetToGreenCenter,
  onTeeChange,
  onUserPositionChange,
  editModeEnabled,
  selectedEditField,
  onEditFieldSelect,
  onEditPointChange,
  onCameraChange,
  onCameraInteraction,
  useDerivedCamera,
  autoFitRequest,
}: GoogleGpsHoleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const teeMarkerRef = useRef<GoogleMarker | null>(null);
  const frontMarkerRef = useRef<GoogleMarker | null>(null);
  const middleMarkerRef = useRef<GoogleMarker | null>(null);
  const backMarkerRef = useRef<GoogleMarker | null>(null);
  const userMarkerRef = useRef<GoogleMarker | null>(null);
  const recommendedTargetMarkerRefs = useRef<GoogleMarker[]>([]);
  const targetMarkerRefs = useRef<GoogleMarker[]>([]);
  const distanceLabelRefs = useRef<GoogleMarker[]>([]);
  const polylineRef = useRef<GooglePolyline | null>(null);
  const mapClickListenerRef = useRef<GoogleMapsEventListener | null>(null);
  const mapListenerRefs = useRef<GoogleMapsEventListener[]>([]);
  const markerListenerRefs = useRef(new Map<GoogleMarker, GoogleMapsEventListener[]>());
  const targetPathRef = useRef<LatLng[]>(targetPath);
  const measurementOriginRef = useRef<LatLng | null>(measurementOrigin);
  const onTargetChangeRef = useRef(onTargetChange);
  const onTargetToGreenCenterRef = useRef(onTargetToGreenCenter);
  const onTeeChangeRef = useRef(onTeeChange);
  const onUserPositionChangeRef = useRef(onUserPositionChange);
  const onEditFieldSelectRef = useRef(onEditFieldSelect);
  const onEditPointChangeRef = useRef(onEditPointChange);
  const onCameraChangeRef = useRef(onCameraChange);
  const onCameraInteractionRef = useRef(onCameraInteraction);
  const applyingCameraRef = useRef(false);
  const cameraInteractionReadyRef = useRef(false);
  const editModeEnabledRef = useRef(editModeEnabled);
  const selectedEditFieldRef = useRef<GpsPrototypeEditField>(selectedEditField);
  const useDerivedCameraRef = useRef(useDerivedCamera);
  const configRef = useRef(config);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [initCount, setInitCount] = useState(0);
  const [cameraDebug, setCameraDebug] = useState('heading: -- | tilt: -- | rendering: --');
  const [vectorStatus, setVectorStatus] = useState('Vector preflight pending.');
  const [derivedCameraDebug, setDerivedCameraDebug] = useState(
    'derived: not run | bearing -- | heading -- | points 0 | applied no',
  );

  const editableTargets = routeTargets;
  const visibleTargets = isGreenLockPath(targetPath, config.greenCenter)
    ? [config.greenCenter]
    : editableTargets;

  function updatePointFromMarker(
    field: GpsPrototypeEditField,
    marker: GoogleMarker,
  ) {
    if (!editModeEnabledRef.current) return;

    const position = marker.getPosition();
    if (!position) return;

    onEditPointChangeRef.current(field, fromGooglePosition(position));
  }

  function addMapListener(
    target: GoogleMap,
    eventName: string,
    handler: GoogleMapsEventHandler,
  ) {
    const listener = target.addListener(eventName, handler);
    mapListenerRefs.current.push(listener);
    return listener;
  }

  function addMarkerListener(
    marker: GoogleMarker,
    eventName: string,
    handler: GoogleMapsEventHandler,
  ) {
    const listener = marker.addListener(eventName, handler);
    const listeners = markerListenerRefs.current.get(marker) ?? [];
    listeners.push(listener);
    markerListenerRefs.current.set(marker, listeners);
    return listener;
  }

  function clearMarkerListeners(marker: GoogleMarker | null) {
    if (!marker) return;
    const listeners = markerListenerRefs.current.get(marker);
    listeners?.forEach((listener) => listener.remove());
    markerListenerRefs.current.delete(marker);
  }

  function clearAllTrackedListeners() {
    mapListenerRefs.current.forEach((listener) => listener.remove());
    mapListenerRefs.current = [];
    markerListenerRefs.current.forEach((listeners) => {
      listeners.forEach((listener) => listener.remove());
    });
    markerListenerRefs.current.clear();
  }

  function attachEditableMarker(
    marker: GoogleMarker,
    field: GpsPrototypeEditField,
  ) {
    marker.setDraggable(editModeEnabledRef.current);
    addMarkerListener(marker, 'click', () => {
      if (!editModeEnabledRef.current) return;
      onEditFieldSelectRef.current(field);
    });
    addMarkerListener(marker, 'drag', () => updatePointFromMarker(field, marker));
    addMarkerListener(marker, 'dragend', () => updatePointFromMarker(field, marker));
  }

  function updateLiveTeeFromMarker(marker: GoogleMarker) {
    if (editModeEnabledRef.current || !onTeeChangeRef.current) return;

    const position = marker.getPosition();
    if (!position) return;

    onTeeChangeRef.current(fromGooglePosition(position));
  }

  function updateTestUserPositionFromMarker(marker: GoogleMarker) {
    if (!onUserPositionChangeRef.current) return;

    const position = marker.getPosition();
    if (!position) return;

    onUserPositionChangeRef.current(fromGooglePosition(position));
  }

  function removeExtraTargetMarkers(count: number) {
    targetMarkerRefs.current.slice(count).forEach((marker) => {
      clearMarkerListeners(marker);
      marker.setMap(null);
    });
    targetMarkerRefs.current = targetMarkerRefs.current.slice(0, count);
  }

  function removeExtraRecommendedTargetMarkers(count: number) {
    recommendedTargetMarkerRefs.current.slice(count).forEach((marker) => {
      clearMarkerListeners(marker);
      marker.setMap(null);
    });
    recommendedTargetMarkerRefs.current = recommendedTargetMarkerRefs.current.slice(0, count);
  }

  function removeExtraDistanceLabels(count: number) {
    distanceLabelRefs.current.slice(count).forEach((marker) => marker.setMap(null));
    distanceLabelRefs.current = distanceLabelRefs.current.slice(0, count);
  }

  function updateDerivedCameraDebug(args: {
    available: boolean;
    bearing: number | null;
    pointCount: number;
    currentHeading: number | null;
    headingApplied: boolean;
    reason: string;
  }) {
    setDerivedCameraDebug(
      `derived: ${args.available ? 'available' : 'unavailable'} | bearing ${
        args.bearing == null ? '--' : args.bearing.toFixed(1)
      } | heading ${args.currentHeading == null ? '--' : args.currentHeading.toFixed(1)} | points ${
        args.pointCount
      } | applied ${args.headingApplied ? 'yes' : 'no'} | ${args.reason}`,
    );
  }

  function cameraDiffersFromDefault(map: GoogleMap) {
    const mapElement = containerRef.current;
    const currentCamera = readMapCamera(map);
    if (!mapElement || !currentCamera) return false;

    const googleMaps = getGoogleMaps();
    const vectorActive = map.getRenderingType?.() === googleMaps?.RenderingType.VECTOR;
    const derivedCamera = useDerivedCameraRef.current
      ? derivedCameraForConfig(
        configRef.current,
        mapElement.getBoundingClientRect().width,
        mapElement.getBoundingClientRect().height,
        variant,
      )
      : null;
    const expectedCenter = derivedCamera?.available && derivedCamera.center
      ? derivedCamera.center
      : configRef.current.mapCenter;
    const expectedZoom = derivedCamera?.available && derivedCamera.zoom != null
      ? derivedCamera.zoom
      : clampZoom(configRef.current.mapZoom);
    const expectedHeading = vectorActive
      ? normalizeHeading(
        derivedCamera?.available && derivedCamera.bearing != null
          ? derivedCamera.bearing
          : configRef.current.mapBearing,
      )
      : 0;
    const expectedTilt = vectorActive && !derivedCamera?.available
      ? configRef.current.mapTilt ?? 0
      : 0;

    return (
      distanceYards(currentCamera.center, expectedCenter) > CAMERA_CENTER_TOLERANCE_YARDS
      || Math.abs(currentCamera.zoom - expectedZoom) > CAMERA_ZOOM_TOLERANCE
      || angleDelta(currentCamera.heading, expectedHeading) > CAMERA_ANGLE_TOLERANCE_DEGREES
      || Math.abs(currentCamera.tilt - expectedTilt) > CAMERA_ANGLE_TOLERANCE_DEGREES
    );
  }

  function notifyCameraDifference(map: GoogleMap) {
    if (!cameraInteractionReadyRef.current || applyingCameraRef.current) return;
    onCameraInteractionRef.current?.(cameraDiffersFromDefault(map));
  }

  function applyDerivedCamera() {
    const map = mapRef.current;
    const mapElement = containerRef.current;
    const googleMaps = getGoogleMaps();
    if (!map || !mapElement || !googleMaps) return;

    applyingCameraRef.current = true;
    cameraInteractionReadyRef.current = false;

    const mapRect = mapElement.getBoundingClientRect();
    const derivedCamera = derivedCameraForConfig(
      configRef.current,
      mapRect.width,
      mapRect.height,
      variant,
    );
    const vectorActive = map.getRenderingType?.() === googleMaps.RenderingType.VECTOR;

    if (!derivedCamera.available || !derivedCamera.center || derivedCamera.zoom == null) {
      updateDerivedCameraDebug({
        available: false,
        bearing: derivedCamera.bearing,
        pointCount: derivedCamera.pointCount,
        currentHeading: normalizeHeading(map.getHeading()),
        headingApplied: false,
        reason: derivedCamera.reason,
      });
      applyingCameraRef.current = false;
      cameraInteractionReadyRef.current = true;
      return;
    }

    const cameraCenter = toGoogleLatLngLiteral(derivedCamera.center);
    const cameraZoom = derivedCamera.zoom;
    const cameraOptions: GoogleCameraOptions = {
      center: cameraCenter,
      zoom: cameraZoom,
      tilt: 0,
    };

    if (vectorActive && derivedCamera.bearing != null) {
      cameraOptions.heading = derivedCamera.bearing;
    }

    if (typeof map.moveCamera === 'function') {
      map.moveCamera(cameraOptions);
    } else {
      map.setCenter(cameraCenter);
      map.setZoom(cameraZoom);
      map.setTilt(0);
      if (vectorActive && cameraOptions.heading != null) {
        map.setHeading(cameraOptions.heading);
      }
    }

    window.setTimeout(() => {
      const currentMap = mapRef.current;
      if (!currentMap) return;

      if (vectorActive && derivedCamera.bearing != null) {
        currentMap.setTilt(0);
        currentMap.setHeading(derivedCamera.bearing);
      } else {
        currentMap.setTilt(0);
      }

      window.setTimeout(() => {
        const heading = normalizeHeading(currentMap.getHeading());
        updateDerivedCameraDebug({
          available: true,
          bearing: derivedCamera.bearing,
          pointCount: derivedCamera.pointCount,
          currentHeading: heading,
          headingApplied: vectorActive && headingMatches(derivedCamera.bearing, heading),
          reason: vectorActive
            ? 'Anchored camera applied with tee low and green high.'
            : 'Anchored camera applied north-up because vector heading is unavailable.',
        });

        const camera = readMapCamera(currentMap);
        if (camera) {
          onCameraChangeRef.current(camera);
        }
        applyingCameraRef.current = false;
        cameraInteractionReadyRef.current = true;
      }, 0);
    }, 0);
  }

  function updateMeasurementOverlay(nextTargetPath: LatLng[]) {
    const map = mapRef.current;
    const origin = measurementOriginRef.current;
    const googleMaps = getGoogleMaps();
    if (!map || !polylineRef.current || !googleMaps) return;

    const routePoints = normalizeRouteLinePath(origin, nextTargetPath);
    polylineRef.current.setMap(map);
    polylineRef.current.setOptions(ROUTE_LINE_OPTIONS);

    if (routePoints.length < 2) {
      polylineRef.current.setPath([]);
      removeExtraDistanceLabels(0);
      return;
    }

    polylineRef.current.setPath(routePoints.map(toGoogleLatLngLiteral));

    removeExtraDistanceLabels(routePoints.length - 1);

    routePoints.slice(1).forEach((point, index) => {
      const previous = routePoints[index];
      const labelPosition = midpoint(previous, point);

      if (!distanceLabelRefs.current[index]) {
        distanceLabelRefs.current[index] = new googleMaps.Marker({
          map,
          clickable: false,
          icon: distanceLabelIcon(),
          zIndex: 40,
        });
      }

      distanceLabelRefs.current[index].setPosition(toGoogleLatLngLiteral(labelPosition));
      distanceLabelRefs.current[index].setLabel({
        text: formatMapDistanceLabel(previous, point),
        color: '#f8fafc',
        fontSize: '16px',
        fontWeight: '700',
      });
    });
  }

  function setTargetAtIndex(nextTarget: LatLng, targetIndex: number) {
    const nextPath = targetPathRef.current.length > 0
      ? [...targetPathRef.current]
      : [nextTarget, configRef.current.greenCenter];
    const boundedIndex = Math.max(0, Math.min(targetIndex, nextPath.length - 1));

    nextPath[boundedIndex] = nextTarget;
    if (
      boundedIndex === nextPath.length - 1 &&
      distanceYards(nextTarget, configRef.current.greenCenter) > SNAP_TO_GREEN_CENTER_YARDS
    ) {
      nextPath.push(configRef.current.greenCenter);
    }
    targetPathRef.current = nextPath;
    targetMarkerRefs.current[boundedIndex]?.setPosition(toGoogleLatLngLiteral(nextTarget));
    updateMeasurementOverlay(nextPath);
    onTargetChangeRef.current(nextTarget, boundedIndex);
  }

  function setTargetToGreenCenter() {
    const nextPath = [configRef.current.greenCenter];
    targetPathRef.current = nextPath;
    targetMarkerRefs.current[0]?.setPosition(toGoogleLatLngLiteral(configRef.current.greenCenter));
    removeExtraTargetMarkers(1);
    updateMeasurementOverlay(nextPath);
    onTargetToGreenCenterRef.current();
  }

  useEffect(() => {
    targetPathRef.current = targetPath;
  }, [targetPath]);

  useEffect(() => {
    measurementOriginRef.current = measurementOrigin;
  }, [measurementOrigin]);

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);

  useEffect(() => {
    onTargetToGreenCenterRef.current = onTargetToGreenCenter;
  }, [onTargetToGreenCenter]);

  useEffect(() => {
    onTeeChangeRef.current = onTeeChange;
  }, [onTeeChange]);

  useEffect(() => {
    onUserPositionChangeRef.current = onUserPositionChange;
  }, [onUserPositionChange]);

  useEffect(() => {
    onEditFieldSelectRef.current = onEditFieldSelect;
  }, [onEditFieldSelect]);

  useEffect(() => {
    onEditPointChangeRef.current = onEditPointChange;
  }, [onEditPointChange]);

  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
  }, [onCameraChange]);

  useEffect(() => {
    onCameraInteractionRef.current = onCameraInteraction;
  }, [onCameraInteraction]);

  useEffect(() => {
    editModeEnabledRef.current = editModeEnabled;
  }, [editModeEnabled]);

  useEffect(() => {
    selectedEditFieldRef.current = selectedEditField;
  }, [selectedEditField]);

  useEffect(() => {
    useDerivedCameraRef.current = useDerivedCamera;
  }, [useDerivedCamera]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return;

    let disposed = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (disposed || !containerRef.current || mapRef.current) return;
        const googleMaps = getGoogleMaps();
        if (!googleMaps?.Map) {
          setLoadError('Google Maps failed to load.');
          return;
        }

        const canRequestVector = supportsWebGl2();
        setVectorStatus(
          canRequestVector
            ? 'Vector requested for bearing support.'
            : 'WebGL2 unavailable, using north-up raster fallback.',
        );

        const mapOptions: GoogleMapOptions = {
          center: toGoogleLatLngLiteral(configRef.current.mapCenter),
          zoom: clampZoom(configRef.current.mapZoom),
          mapTypeId: 'satellite',
          disableDefaultUI: true,
          cameraControl: false,
          fullscreenControl: false,
          keyboardShortcuts: false,
          mapTypeControl: false,
          rotateControl: false,
          scaleControl: false,
          streetViewControl: false,
          clickableIcons: false,
          disableDoubleClickZoom: true,
          isFractionalZoomEnabled: true,
          minZoom: MIN_MAP_ZOOM,
          maxZoom: MAX_MAP_ZOOM,
        };

        if (canRequestVector) {
          mapOptions.heading = normalizeHeading(configRef.current.mapBearing);
          mapOptions.tilt = configRef.current.mapTilt ?? 0;
          mapOptions.renderingType = googleMaps.RenderingType.VECTOR;
          mapOptions.headingInteractionEnabled = true;
          mapOptions.tiltInteractionEnabled = true;
        }

        const map = new googleMaps.Map(containerRef.current, mapOptions);

        mapRef.current = map;
        setCameraDebug(cameraDebugText(map));
        setInitCount((count) => count + 1);

        addMapListener(map, 'zoom_changed', () => {
          notifyCameraDifference(map);
        });

        addMapListener(map, 'heading_changed', () => {
          notifyCameraDifference(map);
        });

        addMapListener(map, 'dragend', () => {
          notifyCameraDifference(map);
        });

        addMapListener(map, 'idle', () => {
          setCameraDebug(cameraDebugText(map));
          const camera = readMapCamera(map);
          if (camera) {
            onCameraChangeRef.current(camera);
          }
          notifyCameraDifference(map);
          setVectorStatus(
            map.getRenderingType?.() === googleMaps.RenderingType.VECTOR
              ? 'Vector active, bearing can apply.'
              : 'Raster fallback active, bearing is unavailable.',
          );
          setDerivedCameraDebug((current) => {
            if (!current.startsWith('derived:')) return current;
            const mapRect = containerRef.current?.getBoundingClientRect();
            const derivedCamera = derivedCameraForConfig(
              configRef.current,
              mapRect?.width ?? 1,
              mapRect?.height ?? 1,
              variant,
            );
            const heading = normalizeHeading(map.getHeading());
            return `derived: ${
              derivedCamera.available ? 'available' : 'unavailable'
            } | bearing ${derivedCamera.bearing == null ? '--' : derivedCamera.bearing.toFixed(1)} | heading ${
              heading.toFixed(1)
            } | points ${derivedCamera.pointCount} | applied ${
              headingMatches(derivedCamera.bearing, heading) ? 'yes' : 'no'
            } | ${derivedCamera.reason}`;
          });
        });

        teeMarkerRef.current = new googleMaps.Marker({
          map,
          title: 'Tee',
          icon: markerIcon(PLAY_TEE_MARKER_COLOR, PLAY_ENDPOINT_MARKER_SCALE),
        });
        attachEditableMarker(teeMarkerRef.current, 'tee');
        teeMarkerRef.current.setDraggable(
          editModeEnabledRef.current || Boolean(onTeeChangeRef.current),
        );
        addMarkerListener(teeMarkerRef.current, 'drag', () => {
          if (teeMarkerRef.current) updateLiveTeeFromMarker(teeMarkerRef.current);
        });
        addMarkerListener(teeMarkerRef.current, 'dragend', () => {
          if (teeMarkerRef.current) updateLiveTeeFromMarker(teeMarkerRef.current);
        });
        frontMarkerRef.current = new googleMaps.Marker({
          map: editModeEnabledRef.current || isGreenLockPath(targetPathRef.current, configRef.current.greenCenter)
            ? map
            : null,
          title: 'Green front',
          icon: editModeEnabledRef.current
            ? markerIcon(EDIT_MARKER_COLORS.greenFront)
            : playGreenMarkerIcon('outer'),
        });
        attachEditableMarker(frontMarkerRef.current, 'greenFront');
        middleMarkerRef.current = new googleMaps.Marker({
          map,
          title: 'Green middle',
          icon: editModeEnabledRef.current
            ? markerIcon(EDIT_MARKER_COLORS.greenCenter)
            : playGreenMarkerIcon('center'),
        });
        attachEditableMarker(middleMarkerRef.current, 'greenCenter');
        addMarkerListener(middleMarkerRef.current, 'click', () => {
          if (editModeEnabledRef.current) {
            onEditFieldSelectRef.current('greenCenter');
            return;
          }

          setTargetToGreenCenter();
        });
        backMarkerRef.current = new googleMaps.Marker({
          map: editModeEnabledRef.current || isGreenLockPath(targetPathRef.current, configRef.current.greenCenter)
            ? map
            : null,
          title: 'Green back',
          icon: editModeEnabledRef.current
            ? markerIcon(EDIT_MARKER_COLORS.greenBack)
            : playGreenMarkerIcon('outer'),
        });
        attachEditableMarker(backMarkerRef.current, 'greenBack');
        polylineRef.current = new googleMaps.Polyline({
          map,
          ...ROUTE_LINE_OPTIONS,
        });

        mapClickListenerRef.current = addMapListener(map, 'click', (event: GoogleMapMouseEvent) => {
          if (!event.latLng) return;

          if (editModeEnabledRef.current) {
            onEditPointChangeRef.current(selectedEditFieldRef.current, fromGooglePosition(event.latLng));
            return;
          }

          const nextTarget = snapToGreenCenterIfClose(
            fromGooglePosition(event.latLng),
            configRef.current.greenCenter,
          );
          if (nextTarget === configRef.current.greenCenter) {
            setTargetToGreenCenter();
            return;
          }
          setTargetAtIndex(nextTarget, 0);
        });

        setMapReady(true);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setLoadError(error instanceof Error ? error.message : 'Google Maps failed to load.');
      });

    return () => {
      disposed = true;
      mapClickListenerRef.current?.remove();
      mapClickListenerRef.current = null;
      clearAllTrackedListeners();
      clearMarkerListeners(teeMarkerRef.current);
      clearMarkerListeners(frontMarkerRef.current);
      clearMarkerListeners(middleMarkerRef.current);
      clearMarkerListeners(backMarkerRef.current);
      teeMarkerRef.current?.setMap(null);
      frontMarkerRef.current?.setMap(null);
      middleMarkerRef.current?.setMap(null);
      backMarkerRef.current?.setMap(null);
      recommendedTargetMarkerRefs.current.forEach((marker) => marker.setMap(null));
      userMarkerRef.current?.setMap(null);
      targetMarkerRefs.current.forEach((marker) => marker.setMap(null));
      distanceLabelRefs.current.forEach((marker) => marker.setMap(null));
      polylineRef.current?.setMap(null);
      mapRef.current = null;
      applyingCameraRef.current = false;
      cameraInteractionReadyRef.current = false;
      setMapReady(false);
    };
    // This effect owns the map and its listeners. Its callbacks read changing values from refs;
    // render-local helper identities must not tear down and reconstruct the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, loadAttempt, variant]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = getGoogleMaps();
    if (!map || !mapReady || !googleMaps) return;

    const showOuterGreenMarkers =
      editModeEnabled || isGreenLockPath(targetPath, config.greenCenter);

    teeMarkerRef.current?.setPosition(toGoogleLatLngLiteral(config.tee));
    frontMarkerRef.current?.setPosition(toGoogleLatLngLiteral(config.greenFront));
    frontMarkerRef.current?.setMap(showOuterGreenMarkers ? map : null);
    middleMarkerRef.current?.setPosition(toGoogleLatLngLiteral(config.greenCenter));
    middleMarkerRef.current?.setMap(map);
    backMarkerRef.current?.setPosition(toGoogleLatLngLiteral(config.greenBack));
    backMarkerRef.current?.setMap(showOuterGreenMarkers ? map : null);

    removeExtraRecommendedTargetMarkers(config.recommendedTargets?.length ?? 0);
    config.recommendedTargets?.forEach((target, index) => {
      if (!recommendedTargetMarkerRefs.current[index]) {
        const field: GpsPrototypeEditField = index === 0 ? 'recommendedTarget1' : 'recommendedTarget2';
        const marker = new googleMaps.Marker({
          map: editModeEnabled ? map : null,
          draggable: editModeEnabled,
          title: target.label,
          icon: editMarkerIcon(field),
          zIndex: 29,
        });
        attachEditableMarker(marker, field);
        recommendedTargetMarkerRefs.current[index] = marker;
      }

      recommendedTargetMarkerRefs.current[index].setPosition(toGoogleLatLngLiteral(target.point));
      recommendedTargetMarkerRefs.current[index].setMap(editModeEnabled ? map : null);
      recommendedTargetMarkerRefs.current[index].setDraggable(editModeEnabled);
    });
    // Marker helpers operate on tracked refs. Depending on their render-local identities would
    // rerun this synchronization on every render and risk duplicate marker listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, editModeEnabled, mapReady, targetPath]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = getGoogleMaps();
    if (!map || !mapReady || !googleMaps) return;

    if (useDerivedCamera) {
      applyDerivedCamera();
      return;
    }

    const currentConfig = configRef.current;
    map.setCenter(toGoogleLatLngLiteral(currentConfig.mapCenter));
    map.setZoom(clampZoom(currentConfig.mapZoom));
    window.setTimeout(() => {
      if (map.getZoom() != null && map.getZoom() !== clampZoom(map.getZoom())) {
        map.setZoom(clampZoom(map.getZoom()));
      }
      if (map.getRenderingType?.() === googleMaps.RenderingType.VECTOR) {
        map.setTilt(currentConfig.mapTilt ?? 0);
        map.setHeading(normalizeHeading(currentConfig.mapBearing));
      }
      setCameraDebug(cameraDebugText(map));
      setVectorStatus(
        map.getRenderingType?.() === googleMaps.RenderingType.VECTOR
          ? 'Vector active, bearing can apply.'
          : 'Raster fallback active, bearing is unavailable.',
      );
    }, 0);
    // Camera config is read from configRef so this effect fits only on hole or camera-mode changes.
    // applyDerivedCamera is intentionally render-local and must not make GPS updates refit the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHoleIndex, mapReady, useDerivedCamera]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || autoFitRequest === 0) return;

    applyDerivedCamera();
    // Auto-fit is request-driven; adding the render-local helper would refit after unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHoleIndex, autoFitRequest, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const editableMarkers = [
      [teeMarkerRef.current, 'tee'],
      [frontMarkerRef.current, 'greenFront'],
      [middleMarkerRef.current, 'greenCenter'],
      [backMarkerRef.current, 'greenBack'],
    ] as const;

    editableMarkers.forEach(([marker, field]) => {
      if (!marker) return;
      marker.setDraggable(editModeEnabled);
      if (!editModeEnabled && field === 'tee') {
        marker.setDraggable(Boolean(onTeeChangeRef.current));
        marker.setIcon(markerIcon(PLAY_TEE_MARKER_COLOR, PLAY_ENDPOINT_MARKER_SCALE));
        return;
      }
      if (!editModeEnabled && field === 'greenCenter') {
        marker.setIcon(playGreenMarkerIcon('center'));
        return;
      }
      if (!editModeEnabled && (field === 'greenFront' || field === 'greenBack')) {
        marker.setIcon(playGreenMarkerIcon('outer'));
        return;
      }
      marker.setIcon(markerIcon(EDIT_MARKER_COLORS[field]));
    });

    recommendedTargetMarkerRefs.current.forEach((marker) => {
      marker.setMap(editModeEnabled ? map : null);
      marker.setDraggable(editModeEnabled);
    });
    targetMarkerRefs.current.forEach((marker) => {
      marker.setDraggable(!editModeEnabled);
    });
  }, [editModeEnabled, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = getGoogleMaps();
    if (!map || !mapReady || !googleMaps) return;

    removeExtraTargetMarkers(visibleTargets.length);

    visibleTargets.forEach((target, index) => {
      if (!targetMarkerRefs.current[index]) {
        const marker = new googleMaps.Marker({
          map,
          draggable: true,
          title: `Target ${index + 1}`,
          icon: targetIcon(),
          zIndex: 45,
        });

        const updateTargetFromMarker = () => {
          const position = marker.getPosition();
          if (!position) return;

          const nextTarget = snapToGreenCenterIfClose(
            fromGooglePosition(position),
            configRef.current.greenCenter,
          );
          if (nextTarget === configRef.current.greenCenter) {
            setTargetToGreenCenter();
            return;
          }
          setTargetAtIndex(nextTarget, index);
        };

        addMarkerListener(marker, 'drag', updateTargetFromMarker);
        addMarkerListener(marker, 'dragend', updateTargetFromMarker);
        targetMarkerRefs.current[index] = marker;
      }

      targetMarkerRefs.current[index].setPosition(toGoogleLatLngLiteral(target));
      targetMarkerRefs.current[index].setDraggable(!editModeEnabled);
      targetMarkerRefs.current[index].setZIndex(isGreenLockPath(targetPath, config.greenCenter) ? 46 : 45);
    });
    // Target helpers read the latest route/callback data from refs. Their identities are excluded
    // so marker synchronization cannot accumulate drag listeners on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.greenCenter, editModeEnabled, mapReady, targetPath, visibleTargets]);

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = getGoogleMaps();
    if (!map || !mapReady || !googleMaps) return;

    if (!currentLocation.position) {
      clearMarkerListeners(userMarkerRef.current);
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
      return;
    }

    if (!userMarkerRef.current) {
      userMarkerRef.current = new googleMaps.Marker({
        map,
        title: 'Current location',
        icon: markerIcon('#60a5fa'),
        zIndex: onUserPositionChangeRef.current
          ? googleMaps.Marker.MAX_ZINDEX + 1
          : 35,
        draggable: Boolean(onUserPositionChangeRef.current),
      });
      addMarkerListener(userMarkerRef.current, 'drag', () => {
        if (userMarkerRef.current) {
          updateTestUserPositionFromMarker(userMarkerRef.current);
        }
      });
      addMarkerListener(userMarkerRef.current, 'dragend', () => {
        if (userMarkerRef.current) {
          updateTestUserPositionFromMarker(userMarkerRef.current);
        }
      });
    }

    userMarkerRef.current.setDraggable(Boolean(onUserPositionChangeRef.current));
    userMarkerRef.current.setPosition(toGoogleLatLngLiteral(currentLocation.position));
  }, [currentLocation.position, mapReady, onUserPositionChange]);

  useEffect(() => {
    if (!mapReady) return;
    updateMeasurementOverlay(targetPath);
    // The overlay helper mutates the single owned polyline and label refs. Depending on its
    // render-local identity would update overlays after every render instead of route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, measurementOrigin, targetPath]);

  if (!apiKey) {
    return (
      <div
        className={variant === 'live' ? 'live-round-gps-unavailable' : 'gps-map-missing-key'}
        role="status"
      >
        {variant === 'live'
          ? 'GPS unavailable for this hole.'
          : 'Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to compare Google satellite imagery.'}
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className={variant === 'live' ? 'live-round-gps-unavailable' : 'gps-map-missing-key'}
      >
        <span role="status">
          {variant === 'live' ? 'GPS unavailable for this hole.' : loadError}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setLoadError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          Retry Map
        </button>
      </div>
    );
  }

  const greenDistanceOverlay = (
    <div className="gps-green-distance-overlay" aria-label="Green distances">
      <div>
        <span>Back</span>
        <strong>{formatYardNumber(greenDistances.back)}</strong>
      </div>
      <div>
        <span>Mid</span>
        <strong>{formatYardNumber(greenDistances.middle)}</strong>
      </div>
      <div>
        <span>Front</span>
        <strong>{formatYardNumber(greenDistances.front)}</strong>
      </div>
    </div>
  );

  if (variant === 'live') {
    return (
      <div className="live-round-gps-map-shell">
        <div className="live-round-gps-map-frame">
          <div
            ref={containerRef}
            className="live-round-gps-map"
            aria-label={`Google satellite map for physical hole ${config.holeNumber}`}
          />
          {greenDistanceOverlay}
        </div>
      </div>
    );
  }

  return (
    <div className="gps-google-map-shell">
      <div className="gps-google-map-frame">
        <div ref={containerRef} className="gps-map" aria-label="Google MacGregor GPS-lite map" />
        {editModeEnabled && (
          <>
            <div className="gps-map-center-guide gps-map-center-guide-safe-top" aria-hidden="true" />
            <div className="gps-map-center-guide gps-map-center-guide-horizontal" aria-hidden="true" />
            <div className="gps-map-center-guide gps-map-center-guide-safe-bottom" aria-hidden="true" />
            <div className="gps-map-center-guide gps-map-center-guide-vertical" aria-hidden="true" />
          </>
        )}
        {greenDistanceOverlay}
      </div>
      <div className="gps-map-debug" aria-live="polite">
        Google map init count: {initCount} | {cameraDebug} | {vectorStatus} | {derivedCameraDebug}
      </div>
    </div>
  );
}
