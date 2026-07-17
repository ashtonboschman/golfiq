'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GpsMappedHoleDraft,
  GpsMappingEditField,
} from '@/lib/gps/adminMappingTypes';
import { deriveAnchoredGpsCamera, normalizeDegrees } from '@/lib/gps/derivedCamera';
import { distanceYards, formatYardNumber } from '@/lib/gps/distance';
import { loadGoogleMaps } from '@/lib/gps/googleMapsLoader';
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

const DEFAULT_ZOOM = 17;
const MIN_MAP_ZOOM = 16;
const MAX_MAP_ZOOM = 19;
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

function normalizeHeading(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 0;
  return normalizeDegrees(value);
}

function formatMapDistanceLabel(from: LatLng, to: LatLng) {
  return formatYardNumber(distanceYards(from, to));
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
  const holeRef = useRef(hole);
  const routeLinesVisibleRef = useRef(true);
  const selectedFieldRef = useRef(selectedField);
  const onFieldSelectRef = useRef(onFieldSelect);
  const onPointChangeRef = useRef(onPointChange);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
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
  const greenDistances = useMemo(() => {
    const tee = pointForField(hole, 'tee');
    const front = pointForField(hole, 'greenFront');
    const middle = pointForField(hole, 'greenCenter');
    const back = pointForField(hole, 'greenBack');

    return {
      front: tee && front ? distanceYards(tee, front) : null,
      middle: tee && middle ? distanceYards(tee, middle) : null,
      back: tee && back ? distanceYards(tee, back) : null,
    };
  }, [hole]);

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
        fontSize: '16px',
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

  function updateDistanceOverlays(mappedHole = holeRef.current) {
    const path = routePathForHole(mappedHole);
    updateRoutePolylines(path);
    updateRouteDistanceLabels(path);
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
        }));

        addListener(map.addListener('heading_changed', () => {
          setRoutePolylinesVisible(false);
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
      courseBoundsRectangleRef.current?.setMap(null);
      courseBoundsRectangleRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey, loadAttempt]);

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
      <div className="gps-map-missing-key">
        <span role="status">{loadError}</span>
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

  return (
    <div className="gps-admin-map-shell">
      <div className="gps-admin-map-frame">
        <div ref={containerRef} className="gps-map gps-admin-map" aria-label="Admin GPS mapping map" />
        <div className="gps-distance-stack-overlay">
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
        </div>
      </div>
      <details className="gps-admin-map-debug">
        <summary>Map Diagnostics</summary>
        <div className="gps-admin-map-debug-content" aria-live="polite">
          <span>Google map init count: {initCount}</span>
          <span>
            Derived camera: {derivedCameraDebug.available ? 'available' : 'unavailable'} | bearing{' '}
            {derivedCameraDebug.bearing == null ? '--' : derivedCameraDebug.bearing.toFixed(1)} | current heading{' '}
            {derivedCameraDebug.currentHeading == null ? '--' : derivedCameraDebug.currentHeading.toFixed(1)} | points{' '}
            {derivedCameraDebug.pointCount} | heading applied {derivedCameraDebug.headingApplied ? 'yes' : 'no'}
          </span>
          <span>{derivedCameraDebug.reason}</span>
        </div>
      </details>
    </div>
  );
}
