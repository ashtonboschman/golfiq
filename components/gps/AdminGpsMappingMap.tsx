'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GpsMappedHoleDraft,
  GpsMappingEditField,
} from '@/lib/gps/adminMappingTypes';
import { deriveAnchoredGpsCamera, normalizeDegrees } from '@/lib/gps/derivedCamera';
import { distanceYards, formatYards } from '@/lib/gps/distance';
import type { LatLng } from '@/lib/gps/types';

type AdminGpsMappingMapProps = {
  apiKey: string | undefined;
  hole: GpsMappedHoleDraft;
  selectedField: GpsMappingEditField;
  courseBounds: CourseBounds | null;
  showCourseBounds: boolean;
  fallbackCenter: LatLng;
  derivedCameraRequest: number;
  onFieldSelect: (field: GpsMappingEditField) => void;
  onPointChange: (field: GpsMappingEditField, point: LatLng) => void;
};

type CourseBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

declare global {
  interface Window {
    __golfiqGoogleMapsPromise?: Promise<void>;
    __golfiqGoogleMapsLoaded?: () => void;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = 'golfiq-google-maps-js';
const DEFAULT_ZOOM = 17;
const MIN_MAP_ZOOM = 16;
const MAX_MAP_ZOOM = 19;
const GREEN_DISTANCE_BADGE_DIAMETER_PX = 50;
const GREEN_DISTANCE_CLUSTER_RADIUS_PX = 55;
const ROUTE_LINE_STROKE_WEIGHT = 3;
const ROUTE_LINE_STROKE_OPACITY = 0.92;
const ROUTE_LINE_COLOR = '#f8fafc';

const FIELD_COLORS: Record<GpsMappingEditField, string> = {
  tee: '#38bdf8',
  target1: '#f97316',
  target2: '#a855f7',
  greenFront: '#f8fafc',
  greenCenter: '#22c55e',
  greenBack: '#f8fafc',
};

const FIELD_LABELS: Record<GpsMappingEditField, string> = {
  tee: 'Tee',
  target1: 'Target 1',
  target2: 'Target 2',
  greenFront: 'Green Front',
  greenCenter: 'Green Center',
  greenBack: 'Green Back',
};

type MarkerField = GpsMappingEditField;

type DerivedCameraDebug = {
  available: boolean;
  bearing: number | null;
  pointCount: number;
  currentHeading: number | null;
  headingApplied: boolean;
  reason: string;
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

function markerIcon(field: GpsMappingEditField): google.maps.Symbol {
  const isOuterGreen = field === 'greenFront' || field === 'greenBack';

  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: FIELD_COLORS[field],
    fillOpacity: 0.98,
    scale: isOuterGreen ? 5 : 7,
    strokeColor: '#ffffff',
    strokeOpacity: isOuterGreen ? 0.2 : 0.95,
    strokeWeight: isOuterGreen ? 1 : 2,
  };
}

function targetIcon(field: 'target1' | 'target2'): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: FIELD_COLORS[field],
    fillOpacity: 1,
    scale: 8,
    strokeColor: '#ffffff',
    strokeOpacity: 0.95,
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

function normalizeHeading(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 0;
  return normalizeDegrees(value);
}

function metersPerPixel(latitude: number, zoom: number) {
  return (156543.03392 * Math.cos(toRadians(latitude))) / (2 ** zoom);
}

function screenVectorToBearing(x: number, y: number, heading: number) {
  return normalizeHeading(heading + toDegrees(Math.atan2(x, -y)));
}

function formatMapDistanceLabel(from: LatLng, to: LatLng) {
  return `${Math.round(distanceYards(from, to))}y`;
}

function pointForField(hole: GpsMappedHoleDraft, field: GpsMappingEditField): LatLng | null {
  switch (field) {
    case 'tee':
      return hole.teeLat == null || hole.teeLng == null ? null : { lat: hole.teeLat, lng: hole.teeLng };
    case 'target1':
      return hole.target1Lat == null || hole.target1Lng == null ? null : { lat: hole.target1Lat, lng: hole.target1Lng };
    case 'target2':
      return hole.target2Lat == null || hole.target2Lng == null ? null : { lat: hole.target2Lat, lng: hole.target2Lng };
    case 'greenFront':
      return hole.greenFrontLat == null || hole.greenFrontLng == null ? null : { lat: hole.greenFrontLat, lng: hole.greenFrontLng };
    case 'greenCenter':
      return hole.greenCenterLat == null || hole.greenCenterLng == null ? null : { lat: hole.greenCenterLat, lng: hole.greenCenterLng };
    case 'greenBack':
      return hole.greenBackLat == null || hole.greenBackLng == null ? null : { lat: hole.greenBackLat, lng: hole.greenBackLng };
  }
}

function target1Point(hole: GpsMappedHoleDraft): LatLng | null {
  return hole.target1Lat == null || hole.target1Lng == null
    ? null
    : { lat: hole.target1Lat, lng: hole.target1Lng };
}

function target2Point(hole: GpsMappedHoleDraft): LatLng | null {
  return hole.target2Lat == null || hole.target2Lng == null
    ? null
    : { lat: hole.target2Lat, lng: hole.target2Lng };
}

function derivedCameraForHole(hole: GpsMappedHoleDraft, viewportWidth: number, viewportHeight: number) {
  return deriveAnchoredGpsCamera(
    {
      tee: pointForField(hole, 'tee'),
      target1: target1Point(hole),
      target2: target2Point(hole),
      greenFront: pointForField(hole, 'greenFront'),
      greenCenter: pointForField(hole, 'greenCenter'),
      greenBack: pointForField(hole, 'greenBack'),
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

export default function AdminGpsMappingMap({
  apiKey,
  hole,
  selectedField,
  courseBounds,
  showCourseBounds,
  fallbackCenter,
  derivedCameraRequest,
  onFieldSelect,
  onPointChange,
}: AdminGpsMappingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRefs = useRef(new Map<MarkerField, google.maps.Marker>());
  const listenerRefs = useRef<google.maps.MapsEventListener[]>([]);
  const routePolylineRefs = useRef<google.maps.Polyline[]>([]);
  const courseBoundsRectangleRef = useRef<google.maps.Rectangle | null>(null);
  const distanceLabelRefs = useRef<google.maps.Marker[]>([]);
  const greenDistanceMarkerRefs = useRef<google.maps.Marker[]>([]);
  const holeRef = useRef(hole);
  const routeLinesVisibleRef = useRef(true);
  const selectedFieldRef = useRef(selectedField);
  const onFieldSelectRef = useRef(onFieldSelect);
  const onPointChangeRef = useRef(onPointChange);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initCount, setInitCount] = useState(0);
  const [derivedCameraDebug, setDerivedCameraDebug] = useState<DerivedCameraDebug>({
    available: false,
    bearing: null,
    pointCount: 0,
    currentHeading: null,
    headingApplied: false,
    reason: 'Derived camera has not run yet.',
  });

  const initialCenter = useMemo(() => {
    return pointForField(hole, 'greenCenter') ?? pointForField(hole, 'tee') ?? fallbackCenter;
  }, [fallbackCenter, hole]);
  const initialCenterRef = useRef(initialCenter);

  useEffect(() => {
    holeRef.current = hole;
  }, [hole]);

  useEffect(() => {
    selectedFieldRef.current = selectedField;
  }, [selectedField]);

  useEffect(() => {
    onFieldSelectRef.current = onFieldSelect;
  }, [onFieldSelect]);

  useEffect(() => {
    onPointChangeRef.current = onPointChange;
  }, [onPointChange]);

  function addListener(listener: google.maps.MapsEventListener) {
    listenerRefs.current.push(listener);
  }

  function updatePointFromMarker(field: GpsMappingEditField, marker: google.maps.Marker) {
    const position = marker.getPosition();
    if (!position) return;
    onPointChangeRef.current(field, fromGooglePosition(position));
  }

  function removeExtraDistanceLabels(count: number) {
    distanceLabelRefs.current.slice(count).forEach((marker) => marker.setMap(null));
    distanceLabelRefs.current = distanceLabelRefs.current.slice(0, count);
  }

  function removeExtraRoutePolylines(count: number) {
    routePolylineRefs.current.slice(count).forEach((polyline) => polyline.setMap(null));
    routePolylineRefs.current = routePolylineRefs.current.slice(0, count);
  }

  function routeLineOptions(): google.maps.PolylineOptions {
    return {
      clickable: false,
      geodesic: false,
      strokeColor: ROUTE_LINE_COLOR,
      strokeOpacity: ROUTE_LINE_STROKE_OPACITY,
      strokeWeight: ROUTE_LINE_STROKE_WEIGHT,
      visible: routeLinesVisibleRef.current,
      zIndex: 34,
    };
  }

  function setRoutePolylinesVisible(visible: boolean) {
    routeLinesVisibleRef.current = visible;
    routePolylineRefs.current.forEach((polyline) => {
      polyline.setVisible(visible);
      polyline.setOptions(routeLineOptions());
    });
  }

  function removeExtraGreenDistanceMarkers(count: number) {
    greenDistanceMarkerRefs.current.slice(count).forEach((marker) => marker.setMap(null));
    greenDistanceMarkerRefs.current = greenDistanceMarkerRefs.current.slice(0, count);
  }

  function routePathForHole(mappedHole: GpsMappedHoleDraft) {
    return [
      pointForField(mappedHole, 'tee'),
      pointForField(mappedHole, 'target1'),
      pointForField(mappedHole, 'target2'),
      pointForField(mappedHole, 'greenCenter'),
    ].filter((point): point is LatLng => point != null);
  }

  function updateRouteDistanceLabels(path: LatLng[]) {
    const map = mapRef.current;
    if (!map || path.length < 2) {
      removeExtraDistanceLabels(0);
      return;
    }

    removeExtraDistanceLabels(path.length - 1);

    path.slice(1).forEach((point, index) => {
      const previous = path[index];
      const labelPosition = midpoint(previous, point);

      if (!distanceLabelRefs.current[index]) {
        distanceLabelRefs.current[index] = new google.maps.Marker({
          map,
          clickable: false,
          icon: distanceLabelIcon(),
          zIndex: 40,
        });
      }

      distanceLabelRefs.current[index].setMap(map);
      distanceLabelRefs.current[index].setPosition(toGoogleLatLngLiteral(labelPosition));
      distanceLabelRefs.current[index].setLabel({
        text: formatMapDistanceLabel(previous, point),
        color: '#f8fafc',
        fontSize: '14px',
        fontWeight: '700',
      });
    });
  }

  function updateRoutePolylines(path: LatLng[]) {
    const map = mapRef.current;
    if (!map || path.length < 2) {
      removeExtraRoutePolylines(0);
      return;
    }

    const segmentCount = path.length - 1;
    removeExtraRoutePolylines(segmentCount);

    path.slice(1).forEach((point, index) => {
      const previous = path[index];
      if (!routePolylineRefs.current[index]) {
        routePolylineRefs.current[index] = new google.maps.Polyline({
          map,
          ...routeLineOptions(),
        });
      }

      routePolylineRefs.current[index].setMap(map);
      routePolylineRefs.current[index].setOptions(routeLineOptions());
      routePolylineRefs.current[index].setPath([
        toGoogleLatLngLiteral(previous),
        toGoogleLatLngLiteral(point),
      ]);
    });
  }

  function greenDistanceBadgePositions(greenCenter: LatLng) {
    const map = mapRef.current;
    const zoom = map?.getZoom() ?? DEFAULT_ZOOM;
    const heading = normalizeHeading(map?.getHeading());
    const radiusMeters = GREEN_DISTANCE_CLUSTER_RADIUS_PX * metersPerPixel(greenCenter.lat, zoom);
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
        greenCenter,
        radiusMeters,
        screenVectorToBearing(vectors.middle.x, vectors.middle.y, heading),
      ),
      front: offsetLatLng(
        greenCenter,
        radiusMeters,
        screenVectorToBearing(vectors.front.x, vectors.front.y, heading),
      ),
      back: offsetLatLng(
        greenCenter,
        radiusMeters,
        screenVectorToBearing(vectors.back.x, vectors.back.y, heading),
      ),
    };
  }

  function updateGreenDistanceMarkers(mappedHole: GpsMappedHoleDraft) {
    const map = mapRef.current;
    const tee = pointForField(mappedHole, 'tee');
    const greenFront = pointForField(mappedHole, 'greenFront');
    const greenCenter = pointForField(mappedHole, 'greenCenter');
    const greenBack = pointForField(mappedHole, 'greenBack');

    if (!map || !tee || !greenFront || !greenCenter || !greenBack) {
      removeExtraGreenDistanceMarkers(0);
      return;
    }

    const positions = greenDistanceBadgePositions(greenCenter);
    const badges = [
      {
        point: positions.back,
        distanceText: formatYards(distanceYards(tee, greenBack)).replace(' yd', 'y'),
        label: 'Back',
      },
      {
        point: positions.middle,
        distanceText: formatYards(distanceYards(tee, greenCenter)).replace(' yd', 'y'),
        label: 'Mid',
      },
      {
        point: positions.front,
        distanceText: formatYards(distanceYards(tee, greenFront)).replace(' yd', 'y'),
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

  function updateDistanceOverlays(mappedHole = holeRef.current) {
    const path = routePathForHole(mappedHole);
    updateRoutePolylines(path);
    updateRouteDistanceLabels(path);
    updateGreenDistanceMarkers(mappedHole);
  }

  function updateCourseBoundsOverlay() {
    const map = mapRef.current;
    if (!map || !showCourseBounds || !courseBounds) {
      courseBoundsRectangleRef.current?.setMap(null);
      return;
    }

    const bounds = {
      north: courseBounds.north,
      south: courseBounds.south,
      east: courseBounds.east,
      west: courseBounds.west,
    };

    if (!courseBoundsRectangleRef.current) {
      courseBoundsRectangleRef.current = new google.maps.Rectangle({
        clickable: false,
        fillColor: '#ef4444',
        fillOpacity: 0.06,
        strokeColor: '#ef4444',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        zIndex: 20,
      });
    }

    courseBoundsRectangleRef.current.setOptions({ bounds });
    courseBoundsRectangleRef.current.setMap(map);
  }

  function ensureMarker(field: MarkerField, map: google.maps.Map) {
    const existing = markerRefs.current.get(field);
    if (existing) return existing;

    const marker = new google.maps.Marker({
      map,
      draggable: true,
      title: FIELD_LABELS[field],
      icon: field === 'target1' || field === 'target2' ? targetIcon(field) : markerIcon(field),
      zIndex: 30,
    });

    addListener(marker.addListener('click', () => onFieldSelectRef.current(field)));
    addListener(marker.addListener('drag', () => updatePointFromMarker(field, marker)));
    addListener(marker.addListener('dragend', () => updatePointFromMarker(field, marker)));
    markerRefs.current.set(field, marker);
    return marker;
  }

  function updateMarkers() {
    const map = mapRef.current;
    if (!map) return;
    holeRef.current = hole;

    (Object.keys(FIELD_LABELS) as MarkerField[]).forEach((field) => {
      const point = pointForField(hole, field);
      const marker = markerRefs.current.get(field) ?? (point ? ensureMarker(field, map) : null);
      if (!marker) return;

      marker.setIcon(field === 'target1' || field === 'target2' ? targetIcon(field) : markerIcon(field));
      marker.setPosition(point ? toGoogleLatLngLiteral(point) : null);
      marker.setMap(point ? map : null);
    });

    updateDistanceOverlays(hole);
  }

  function applyDerivedCamera(mappedHole = holeRef.current) {
    const map = mapRef.current;
    const mapElement = containerRef.current;
    if (!map || !mapElement) return;
    holeRef.current = mappedHole;

    const mapRect = mapElement.getBoundingClientRect();
    const derivedCamera = derivedCameraForHole(mappedHole, mapRect.width, mapRect.height);
    const vectorActive = map.getRenderingType?.() === google.maps.RenderingType.VECTOR;

    if (!derivedCamera.available || !derivedCamera.center || derivedCamera.zoom == null) {
      setDerivedCameraDebug({
        available: false,
        bearing: derivedCamera.bearing,
        pointCount: derivedCamera.pointCount,
        currentHeading: normalizeHeading(map.getHeading()),
        headingApplied: false,
        reason: derivedCamera.reason,
      });
      updateDistanceOverlays(mappedHole);
      return;
    }

    setRoutePolylinesVisible(false);

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
    updateDistanceOverlays(mappedHole);

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
        setRoutePolylinesVisible(true);
        updateDistanceOverlays(mappedHole);
        setDerivedCameraDebug({
          available: true,
          bearing: derivedCamera.bearing,
          pointCount: derivedCamera.pointCount,
          currentHeading: heading,
          headingApplied: vectorActive && headingMatches(derivedCamera.bearing, heading),
          reason: vectorActive
            ? 'Anchored camera applied with tee low and green high.'
            : 'Anchored camera applied north-up because vector heading is unavailable.',
        });

      }, 0);
    }, 0);
  }

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return;

    let disposed = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (disposed || !containerRef.current || mapRef.current) return;

        const map = new google.maps.Map(containerRef.current, {
          center: toGoogleLatLngLiteral(initialCenterRef.current),
          zoom: DEFAULT_ZOOM,
          mapTypeId: 'satellite',
          disableDefaultUI: true,
          clickableIcons: false,
          disableDoubleClickZoom: true,
          isFractionalZoomEnabled: true,
          minZoom: MIN_MAP_ZOOM,
          maxZoom: MAX_MAP_ZOOM,
          heading: 0,
          tilt: 0,
          renderingType: google.maps.RenderingType.VECTOR,
          headingInteractionEnabled: true,
          tiltInteractionEnabled: true,
        });

        mapRef.current = map;
        addListener(map.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (!event.latLng) return;
          onPointChangeRef.current(selectedFieldRef.current, fromGooglePosition(event.latLng));
        }));

        addListener(map.addListener('idle', () => {
          setRoutePolylinesVisible(true);
          updateDistanceOverlays();
          setDerivedCameraDebug((current) => ({
            ...current,
            currentHeading: normalizeHeading(map.getHeading()),
            headingApplied: headingMatches(current.bearing, normalizeHeading(map.getHeading())),
          }));
        }));

        addListener(map.addListener('zoom_changed', () => {
          setRoutePolylinesVisible(false);
          updateGreenDistanceMarkers(holeRef.current);
        }));

        addListener(map.addListener('heading_changed', () => {
          setRoutePolylinesVisible(false);
          updateGreenDistanceMarkers(holeRef.current);
        }));

        addListener(map.addListener('bounds_changed', () => {
          updateGreenDistanceMarkers(holeRef.current);
        }));

        setInitCount((count) => count + 1);
        setMapReady(true);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setLoadError(error instanceof Error ? error.message : 'Google Maps failed to load.');
      });

    return () => {
      disposed = true;
      listenerRefs.current.forEach((listener) => listener.remove());
      listenerRefs.current = [];
      markerRefs.current.forEach((marker) => marker.setMap(null));
      markerRefs.current.clear();
      routePolylineRefs.current.forEach((polyline) => polyline.setMap(null));
      routePolylineRefs.current = [];
      distanceLabelRefs.current.forEach((marker) => marker.setMap(null));
      distanceLabelRefs.current = [];
      greenDistanceMarkerRefs.current.forEach((marker) => marker.setMap(null));
      greenDistanceMarkerRefs.current = [];
      courseBoundsRectangleRef.current?.setMap(null);
      courseBoundsRectangleRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey]);

  useEffect(() => {
    if (!mapReady) return;
    holeRef.current = hole;
    updateMarkers();
  }, [hole, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    holeRef.current = hole;
    updateMarkers();
    applyDerivedCamera(hole);
    window.setTimeout(() => {
      holeRef.current = hole;
      updateMarkers();
      updateDistanceOverlays(hole);
    }, 0);
  }, [hole.holeNumber, mapReady]);

  useEffect(() => {
    if (!mapReady || derivedCameraRequest === 0) return;
    applyDerivedCamera(holeRef.current);
  }, [derivedCameraRequest, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    updateCourseBoundsOverlay();
  }, [courseBounds, showCourseBounds, mapReady]);

  if (!apiKey) {
    return (
      <div className="gps-map-missing-key" role="status">
        Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to use Google satellite mapping.
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
    <div className="gps-admin-map-shell">
      <div className="gps-admin-map-frame">
        <div ref={containerRef} className="gps-map gps-admin-map" aria-label="Admin GPS mapping map" />
        <div className="gps-map-center-guide gps-map-center-guide-safe-top" aria-hidden="true" />
        <div className="gps-map-center-guide gps-map-center-guide-horizontal" aria-hidden="true" />
        <div className="gps-map-center-guide gps-map-center-guide-safe-bottom" aria-hidden="true" />
        <div className="gps-map-center-guide gps-map-center-guide-vertical" aria-hidden="true" />
      </div>
      <div className="gps-admin-map-debug" aria-live="polite">
        <span>Google map init count: {initCount}</span>
        <span>
          Derived camera: {derivedCameraDebug.available ? 'available' : 'unavailable'} | bearing{' '}
          {derivedCameraDebug.bearing == null ? '--' : derivedCameraDebug.bearing.toFixed(1)} | current heading{' '}
          {derivedCameraDebug.currentHeading == null ? '--' : derivedCameraDebug.currentHeading.toFixed(1)} | points{' '}
          {derivedCameraDebug.pointCount} | heading applied {derivedCameraDebug.headingApplied ? 'yes' : 'no'}
        </span>
        <span>{derivedCameraDebug.reason}</span>
      </div>
    </div>
  );
}
