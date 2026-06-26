'use client';

import { useEffect, useRef, useState } from 'react';
import { distanceYards, formatYards } from '@/lib/gps/distance';
import { deriveAnchoredGpsCamera, normalizeDegrees } from '@/lib/gps/derivedCamera';
import type {
  CurrentLocationState,
  GpsHolePrototypeConfig,
  GpsPrototypeEditField,
  LatLng,
} from '@/lib/gps/types';

type GoogleGpsHoleMapProps = {
  config: GpsHolePrototypeConfig;
  activeHoleIndex: number;
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
  useDerivedCamera: boolean;
  autoFitRequest: number;
};

declare global {
  interface Window {
    __golfiqGoogleMapsPromise?: Promise<void>;
    __golfiqGoogleMapsLoaded?: () => void;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = 'golfiq-google-maps-js';
const SNAP_TO_GREEN_CENTER_YARDS = 10;
const MIN_MAP_ZOOM = 16;
const MAX_MAP_ZOOM = 19;
const GREEN_DISTANCE_BADGE_DIAMETER_PX = 50;
const GREEN_DISTANCE_CLUSTER_RADIUS_PX = 55;
const EDIT_MARKER_COLORS: Record<GpsPrototypeEditField, string> = {
  tee: '#38bdf8',
  greenFront: '#d9f99d',
  greenCenter: '#22c55e',
  greenBack: '#14532d',
  recommendedTarget1: '#c084fc',
  recommendedTarget2: '#a78bfa',
  mapCenter: '#f472b6',
};

function toGoogleLatLngLiteral(point: LatLng): google.maps.LatLngLiteral {
  return { lat: point.lat, lng: point.lng };
}

function fromGooglePosition(position: google.maps.LatLng): LatLng {
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

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function offsetLatLng(point: LatLng, distanceMeters: number, bearing: number): LatLng {
  const angularDistance = distanceMeters / 6371008.8;
  const bearingRadians = toRadians(bearing);
  const latRadians = toRadians(point.lat);
  const lngRadians = toRadians(point.lng);

  const nextLat = Math.asin(
    Math.sin(latRadians) * Math.cos(angularDistance) +
    Math.cos(latRadians) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const nextLng =
    lngRadians +
    Math.atan2(
      Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latRadians),
      Math.cos(angularDistance) - Math.sin(latRadians) * Math.sin(nextLat),
    );

  return {
    lat: toDegrees(nextLat),
    lng: toDegrees(nextLng),
  };
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve();
  }

  if (window.__golfiqGoogleMapsPromise) {
    return window.__golfiqGoogleMapsPromise;
  }

  window.__golfiqGoogleMapsPromise = new Promise((resolve, reject) => {
    window.__golfiqGoogleMapsLoaded = () => resolve();

    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('error', () => reject(new Error('Google Maps failed to load.')));
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      '&v=weekly&loading=async&callback=__golfiqGoogleMapsLoaded';
    script.onerror = () => reject(new Error('Google Maps failed to load.'));
    document.head.appendChild(script);
  });

  return window.__golfiqGoogleMapsPromise;
}

function markerIcon(color: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    scale: 7,
    strokeColor: '#ffffff',
    strokeOpacity: 0.95,
    strokeWeight: 2,
  };
}

function playGreenMarkerIcon(size: 'center' | 'outer'): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: size === 'center' ? EDIT_MARKER_COLORS.greenCenter : '#f8fafc',
    fillOpacity: 0.98,
    scale: size === 'center' ? 7 : 4.75,
    strokeColor: size === 'center' ? '#ffffff' : '#f8fafc',
    strokeOpacity: size === 'center' ? 0.95 : 0,
    strokeWeight: size === 'center' ? 2 : 0,
  };
}

function targetIcon(): google.maps.Icon {
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
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(center, center),
  };
}

function editMarkerIcon(field: GpsPrototypeEditField): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: EDIT_MARKER_COLORS[field],
    fillOpacity: 1,
    scale: field === 'mapCenter' ? 6 : 8,
    strokeColor: '#111827',
    strokeOpacity: 0.9,
    strokeWeight: 2,
  };
}

function distanceLabelIcon(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#161616',
    fillOpacity: 0.92,
    scale: 24,
    strokeColor: '#f8fafc',
    strokeOpacity: 0.16,
    strokeWeight: 1,
  };
}

function greenDistanceBadgeIcon(distanceText: string, label: string): google.maps.Icon {
  const size = GREEN_DISTANCE_BADGE_DIAMETER_PX;
  const center = size / 2;
  const radius = center - 1.5;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${center}" cy="${center}" r="${radius}" fill="rgba(22,22,22,0.92)" stroke="rgba(248,250,252,0.18)" stroke-width="1.1" />
      <text
        x="${center}"
        y="${center - 3.5}"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="#f8fafc"
        font-family="Arial, sans-serif"
        font-size="13.5"
        font-weight="700"
      >${distanceText}</text>
      <text
        x="${center}"
        y="${center + 9.5}"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="rgba(248,250,252,0.82)"
        font-family="Arial, sans-serif"
        font-size="8.5"
        font-weight="600"
      >${label}</text>
    </svg>
  `.trim();

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(center, center),
  };
}

function formatMapDistanceLabel(from: LatLng, to: LatLng) {
  return `${Math.round(distanceYards(from, to))}y`;
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

function metersPerPixel(latitude: number, zoom: number) {
  return (156543.03392 * Math.cos(toRadians(latitude))) / (2 ** zoom);
}

function screenVectorToBearing(x: number, y: number, heading: number) {
  return normalizeHeading(heading + toDegrees(Math.atan2(x, -y)));
}

function isGreenLockPath(targetPath: LatLng[], greenCenter: LatLng) {
  return (
    targetPath.length === 1 &&
    distanceYards(targetPath[0], greenCenter) <= SNAP_TO_GREEN_CENTER_YARDS
  );
}

function cameraDebugText(map: google.maps.Map | null) {
  if (!map) return 'heading: -- | tilt: -- | rendering: --';

  const heading = map.getHeading();
  const tilt = map.getTilt();
  const renderingType = typeof map.getRenderingType === 'function'
    ? map.getRenderingType()
    : undefined;

  return `heading: ${Math.round(heading ?? 0)} | tilt: ${Math.round(tilt ?? 0)} | rendering: ${renderingType ?? 'unknown'}`;
}

function readMapCamera(map: google.maps.Map) {
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
    },
  );
}

function headingMatches(expected: number | null, actual: number | null) {
  if (expected == null || actual == null) return false;
  const delta = Math.abs(normalizeHeading(expected) - normalizeHeading(actual));
  return Math.min(delta, 360 - delta) < 1;
}

export default function GoogleGpsHoleMap({
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
  editModeEnabled,
  selectedEditField,
  onEditFieldSelect,
  onEditPointChange,
  onCameraChange,
  useDerivedCamera,
  autoFitRequest,
}: GoogleGpsHoleMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const teeMarkerRef = useRef<google.maps.Marker | null>(null);
  const frontMarkerRef = useRef<google.maps.Marker | null>(null);
  const middleMarkerRef = useRef<google.maps.Marker | null>(null);
  const backMarkerRef = useRef<google.maps.Marker | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const recommendedTargetMarkerRefs = useRef<google.maps.Marker[]>([]);
  const targetMarkerRefs = useRef<google.maps.Marker[]>([]);
  const distanceLabelRefs = useRef<google.maps.Marker[]>([]);
  const greenDistanceMarkerRefs = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapListenerRefs = useRef<google.maps.MapsEventListener[]>([]);
  const markerListenerRefs = useRef(new Map<google.maps.Marker, google.maps.MapsEventListener[]>());
  const targetPathRef = useRef<LatLng[]>(targetPath);
  const measurementOriginRef = useRef<LatLng | null>(measurementOrigin);
  const greenDistancesRef = useRef(greenDistances);
  const onTargetChangeRef = useRef(onTargetChange);
  const onTargetToGreenCenterRef = useRef(onTargetToGreenCenter);
  const onEditFieldSelectRef = useRef(onEditFieldSelect);
  const onEditPointChangeRef = useRef(onEditPointChange);
  const onCameraChangeRef = useRef(onCameraChange);
  const editModeEnabledRef = useRef(editModeEnabled);
  const selectedEditFieldRef = useRef<GpsPrototypeEditField>(selectedEditField);
  const configRef = useRef(config);
  const mapZoomLevelRef = useRef(clampZoom(config.mapZoom));
  const mapHeadingLevelRef = useRef(normalizeHeading(config.mapBearing));
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    marker: google.maps.Marker,
  ) {
    if (!editModeEnabledRef.current) return;

    const position = marker.getPosition();
    if (!position) return;

    onEditPointChangeRef.current(field, fromGooglePosition(position));
  }

  function addMapListener(
    target: google.maps.Map,
    eventName: string,
    handler: (...args: any[]) => void,
  ) {
    const listener = target.addListener(eventName, handler);
    mapListenerRefs.current.push(listener);
    return listener;
  }

  function addMarkerListener(
    marker: google.maps.Marker,
    eventName: string,
    handler: (...args: any[]) => void,
  ) {
    const listener = marker.addListener(eventName, handler);
    const listeners = markerListenerRefs.current.get(marker) ?? [];
    listeners.push(listener);
    markerListenerRefs.current.set(marker, listeners);
    return listener;
  }

  function clearMarkerListeners(marker: google.maps.Marker | null) {
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
    marker: google.maps.Marker,
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

  function removeExtraGreenDistanceMarkers(count: number) {
    greenDistanceMarkerRefs.current.slice(count).forEach((marker) => marker.setMap(null));
    greenDistanceMarkerRefs.current = greenDistanceMarkerRefs.current.slice(0, count);
  }

  function greenDistanceBadgePositions() {
    const radiusMeters =
      GREEN_DISTANCE_CLUSTER_RADIUS_PX *
      metersPerPixel(configRef.current.greenCenter.lat, mapZoomLevelRef.current);
    const viewerHeading = mapHeadingLevelRef.current;
    const vectors = {
      middle: { x: 1, y: 0 },
      front: {
        x: Math.cos((120 * Math.PI) / 180),
        y: Math.sin((120 * Math.PI) / 180),
      },
      back: {
        x: Math.cos((240 * Math.PI) / 180),
        y: Math.sin((240 * Math.PI) / 180),
      },
    } as const;

    return {
      middle: offsetLatLng(
        configRef.current.greenCenter,
        radiusMeters,
        screenVectorToBearing(vectors.middle.x, vectors.middle.y, viewerHeading),
      ),
      front: offsetLatLng(
        configRef.current.greenCenter,
        radiusMeters,
        screenVectorToBearing(vectors.front.x, vectors.front.y, viewerHeading),
      ),
      back: offsetLatLng(
        configRef.current.greenCenter,
        radiusMeters,
        screenVectorToBearing(vectors.back.x, vectors.back.y, viewerHeading),
      ),
    };
  }

  function updateGreenDistanceMarkers() {
    const map = mapRef.current;
    if (!map) return;

    const greenLockEnabled =
      measurementOriginRef.current != null &&
      targetPathRef.current.length === 1 &&
      distanceYards(targetPathRef.current[0], configRef.current.greenCenter) <= SNAP_TO_GREEN_CENTER_YARDS;

    if (!greenLockEnabled) {
      removeExtraGreenDistanceMarkers(0);
      return;
    }

    const positions = greenDistanceBadgePositions();
    const distances = greenDistancesRef.current;
    const badges = [
      {
        point: positions.back,
        distanceText: formatYards(distances.back).replace(' yd', 'y'),
        label: 'Back',
      },
      {
        point: positions.middle,
        distanceText: formatYards(distances.middle).replace(' yd', 'y'),
        label: 'Mid',
      },
      {
        point: positions.front,
        distanceText: formatYards(distances.front).replace(' yd', 'y'),
        label: 'Front',
      },
    ] as const;

    removeExtraGreenDistanceMarkers(badges.length);

    badges.forEach((badge, index) => {
      if (!greenDistanceMarkerRefs.current[index]) {
        greenDistanceMarkerRefs.current[index] = new google.maps.Marker({
          map,
          clickable: false,
          zIndex: 38,
        });
      }

      greenDistanceMarkerRefs.current[index].setMap(map);
      greenDistanceMarkerRefs.current[index].setPosition(toGoogleLatLngLiteral(badge.point));
      greenDistanceMarkerRefs.current[index].setIcon(
        greenDistanceBadgeIcon(badge.distanceText, badge.label),
      );
    });
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

  function applyDerivedCamera() {
    const map = mapRef.current;
    const mapElement = containerRef.current;
    if (!map || !mapElement) return;

    const mapRect = mapElement.getBoundingClientRect();
    const derivedCamera = derivedCameraForConfig(
      configRef.current,
      mapRect.width,
      mapRect.height,
    );
    const vectorActive = map.getRenderingType?.() === google.maps.RenderingType.VECTOR;

    if (!derivedCamera.available || !derivedCamera.center || derivedCamera.zoom == null) {
      updateDerivedCameraDebug({
        available: false,
        bearing: derivedCamera.bearing,
        pointCount: derivedCamera.pointCount,
        currentHeading: normalizeHeading(map.getHeading()),
        headingApplied: false,
        reason: derivedCamera.reason,
      });
      return;
    }

    const cameraCenter = toGoogleLatLngLiteral(derivedCamera.center);
    const cameraZoom = derivedCamera.zoom;
    const cameraOptions: google.maps.CameraOptions = {
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
      }, 0);
    }, 0);
  }

  function updateMeasurementOverlay(nextTargetPath: LatLng[]) {
    const map = mapRef.current;
    const origin = measurementOriginRef.current;
    if (!map || !polylineRef.current) return;

    if (!origin) {
      polylineRef.current.setPath([]);
      removeExtraDistanceLabels(0);
      return;
    }

    const greenLockActive =
      nextTargetPath.length === 1 &&
      distanceYards(nextTargetPath[0], configRef.current.greenCenter) <= SNAP_TO_GREEN_CENTER_YARDS;

    const routePoints = [origin, ...nextTargetPath];
    polylineRef.current.setPath(routePoints.map(toGoogleLatLngLiteral));
    if (greenLockActive) {
      removeExtraDistanceLabels(0);
      return;
    }

    removeExtraDistanceLabels(routePoints.length - 1);

    routePoints.slice(1).forEach((point, index) => {
      const previous = routePoints[index];
      const labelPosition = midpoint(previous, point);

      if (!distanceLabelRefs.current[index]) {
        distanceLabelRefs.current[index] = new google.maps.Marker({
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
        fontSize: '14px',
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
    greenDistancesRef.current = greenDistances;
  }, [greenDistances]);

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);

  useEffect(() => {
    onTargetToGreenCenterRef.current = onTargetToGreenCenter;
  }, [onTargetToGreenCenter]);

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
    editModeEnabledRef.current = editModeEnabled;
  }, [editModeEnabled]);

  useEffect(() => {
    selectedEditFieldRef.current = selectedEditField;
  }, [selectedEditField]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return;

    let disposed = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (disposed || !containerRef.current || mapRef.current) return;

        const canRequestVector = supportsWebGl2();
        setVectorStatus(
          canRequestVector
            ? 'Vector requested for bearing support.'
            : 'WebGL2 unavailable, using north-up raster fallback.',
        );

        const mapOptions: google.maps.MapOptions = {
          center: toGoogleLatLngLiteral(configRef.current.mapCenter),
          zoom: clampZoom(configRef.current.mapZoom),
          mapTypeId: 'satellite',
          disableDefaultUI: true,
          keyboardShortcuts: false,
          clickableIcons: false,
          disableDoubleClickZoom: true,
          isFractionalZoomEnabled: true,
          minZoom: MIN_MAP_ZOOM,
          maxZoom: MAX_MAP_ZOOM,
        };

        if (canRequestVector) {
          mapOptions.heading = normalizeHeading(configRef.current.mapBearing);
          mapOptions.tilt = configRef.current.mapTilt ?? 0;
          mapOptions.renderingType = google.maps.RenderingType.VECTOR;
          mapOptions.headingInteractionEnabled = true;
          mapOptions.tiltInteractionEnabled = true;
        }

        const map = new google.maps.Map(containerRef.current, mapOptions);

        mapRef.current = map;
        setCameraDebug(cameraDebugText(map));
        const initialZoom = map.getZoom() ?? clampZoom(configRef.current.mapZoom);
        const initialHeading = normalizeHeading(map.getHeading());
        mapZoomLevelRef.current = initialZoom;
        mapHeadingLevelRef.current = initialHeading;
        setInitCount((count) => count + 1);
        console.count('Google GPS map initialized');

        addMapListener(map, 'zoom_changed', () => {
          const zoom = map.getZoom() ?? clampZoom(configRef.current.mapZoom);
          mapZoomLevelRef.current = zoom;
          updateGreenDistanceMarkers();
        });

        addMapListener(map, 'heading_changed', () => {
          const heading = normalizeHeading(map.getHeading());
          mapHeadingLevelRef.current = heading;
          updateGreenDistanceMarkers();
        });

        addMapListener(map, 'bounds_changed', () => {
          updateGreenDistanceMarkers();
        });

        addMapListener(map, 'idle', () => {
          setCameraDebug(cameraDebugText(map));
          const zoom = map.getZoom() ?? clampZoom(configRef.current.mapZoom);
          const heading = normalizeHeading(map.getHeading());
          mapZoomLevelRef.current = zoom;
          mapHeadingLevelRef.current = heading;
          const camera = readMapCamera(map);
          if (camera) {
            onCameraChangeRef.current(camera);
          }
          updateGreenDistanceMarkers();
          setVectorStatus(
            map.getRenderingType?.() === google.maps.RenderingType.VECTOR
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

        teeMarkerRef.current = new google.maps.Marker({
          map,
          title: 'Tee',
          icon: markerIcon('#38bdf8'),
        });
        attachEditableMarker(teeMarkerRef.current, 'tee');
        frontMarkerRef.current = new google.maps.Marker({
          map: editModeEnabledRef.current || isGreenLockPath(targetPathRef.current, configRef.current.greenCenter)
            ? map
            : null,
          title: 'Green front',
          icon: editModeEnabledRef.current
            ? markerIcon(EDIT_MARKER_COLORS.greenFront)
            : playGreenMarkerIcon('outer'),
        });
        attachEditableMarker(frontMarkerRef.current, 'greenFront');
        middleMarkerRef.current = new google.maps.Marker({
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
        backMarkerRef.current = new google.maps.Marker({
          map: editModeEnabledRef.current || isGreenLockPath(targetPathRef.current, configRef.current.greenCenter)
            ? map
            : null,
          title: 'Green back',
          icon: editModeEnabledRef.current
            ? markerIcon(EDIT_MARKER_COLORS.greenBack)
            : playGreenMarkerIcon('outer'),
        });
        attachEditableMarker(backMarkerRef.current, 'greenBack');
        polylineRef.current = new google.maps.Polyline({
          map,
          clickable: false,
          geodesic: true,
          strokeColor: '#f8fafc',
          strokeOpacity: 0.9,
          strokeWeight: 3,
        });

        mapClickListenerRef.current = addMapListener(map, 'click', (event: google.maps.MapMouseEvent) => {
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
      greenDistanceMarkerRefs.current.forEach((marker) => marker.setMap(null));
      polylineRef.current?.setMap(null);
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

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
        const marker = new google.maps.Marker({
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
  }, [config, editModeEnabled, mapReady, targetPath]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (useDerivedCamera) {
      applyDerivedCamera();
      return;
    }

    map.setCenter(toGoogleLatLngLiteral(config.mapCenter));
    map.setZoom(clampZoom(config.mapZoom));
    window.setTimeout(() => {
      if (map.getZoom() != null && map.getZoom() !== clampZoom(map.getZoom())) {
        map.setZoom(clampZoom(map.getZoom()));
      }
      if (map.getRenderingType?.() === google.maps.RenderingType.VECTOR) {
        map.setTilt(config.mapTilt ?? 0);
        map.setHeading(normalizeHeading(config.mapBearing));
      }
      setCameraDebug(cameraDebugText(map));
      setVectorStatus(
        map.getRenderingType?.() === google.maps.RenderingType.VECTOR
          ? 'Vector active, bearing can apply.'
          : 'Raster fallback active, bearing is unavailable.',
      );
    }, 0);
  }, [activeHoleIndex, mapReady, useDerivedCamera]);

  useEffect(() => {
    if (!mapReady) return;
    const zoom = clampZoom(config.mapZoom);
    const heading = normalizeHeading(config.mapBearing);
    mapZoomLevelRef.current = zoom;
    mapHeadingLevelRef.current = heading;
    updateGreenDistanceMarkers();
  }, [config.mapBearing, config.mapZoom, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || autoFitRequest === 0) return;

    applyDerivedCamera();
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
    if (!map || !mapReady) return;

    removeExtraTargetMarkers(visibleTargets.length);

    visibleTargets.forEach((target, index) => {
      if (!targetMarkerRefs.current[index]) {
        const marker = new google.maps.Marker({
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
  }, [config.greenCenter, editModeEnabled, mapReady, targetPath, visibleTargets]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!currentLocation.position) {
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
      return;
    }

    if (!userMarkerRef.current) {
      userMarkerRef.current = new google.maps.Marker({
        map,
        title: 'Current location',
        icon: markerIcon('#60a5fa'),
        zIndex: 35,
      });
    }

    userMarkerRef.current.setPosition(toGoogleLatLngLiteral(currentLocation.position));
  }, [currentLocation.position, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    updateMeasurementOverlay(targetPath);
  }, [mapReady, measurementOrigin, targetPath]);

  useEffect(() => {
    if (!mapReady) return;
    updateGreenDistanceMarkers();
  }, [config, greenDistances, mapReady, measurementOrigin, targetPath]);

  if (!apiKey) {
    return (
      <div className="gps-map-missing-key" role="status">
        Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to compare Google satellite imagery.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="gps-map-missing-key" role="status">
        {loadError}
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
        <div className="gps-green-distance-overlay" aria-label="Green distances">
          <div>
            <span>Back</span>
            <strong>{formatYards(greenDistances.back)}</strong>
          </div>
          <div>
            <span>Mid</span>
            <strong>{formatYards(greenDistances.middle)}</strong>
          </div>
          <div>
            <span>Front</span>
            <strong>{formatYards(greenDistances.front)}</strong>
          </div>
        </div>
      </div>
      <div className="gps-map-debug" aria-live="polite">
        Google map init count: {initCount} | {cameraDebug} | {vectorStatus} | {derivedCameraDebug}
      </div>
    </div>
  );
}
