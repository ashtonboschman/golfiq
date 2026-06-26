'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { isAdminUserId } from '@/lib/admin';
import { distanceYards, formatYards, metersToYards } from '@/lib/gps/distance';
import {
  MACGREGOR_PROTOTYPE_HOLE,
  MACGREGOR_PROTOTYPE_HOLES,
} from '@/lib/gps/macgregorPrototypeHole';
import { useCurrentLocation } from '@/lib/gps/useCurrentLocation';
import type { GpsHolePrototypeConfig, GpsPrototypeEditField, LatLng } from '@/lib/gps/types';
import GoogleGpsHoleMap from '@/components/gps/GoogleGpsHoleMap';

const OFF_COURSE_FALLBACK_YARDS = 1800;
const BEHIND_TEE_FALLBACK_YARDS = 35;
const LOW_ACCURACY_FALLBACK_YARDS = 500;

type EditFieldOption = {
  value: GpsPrototypeEditField;
  label: string;
};

type GpsMapCamera = {
  center: LatLng;
  zoom: number;
  heading: number;
  tilt: number;
};

const BASE_EDIT_FIELD_OPTIONS: EditFieldOption[] = [
  { value: 'tee', label: 'Tee' },
  { value: 'greenFront', label: 'Green Front' },
  { value: 'greenCenter', label: 'Green Center' },
  { value: 'greenBack', label: 'Green Back' },
  { value: 'mapCenter', label: 'Map Center' },
];

function targetCountForPar(par: number) {
  if (par <= 3) return 0;
  if (par === 4) return 1;
  return 2;
}

function normalizeRecommendedTargets(hole: GpsHolePrototypeConfig) {
  const targetCount = targetCountForPar(hole.par);
  const fallbackProgress = hole.par === 4 ? [0.55] : [0.4, 0.72];

  return Array.from({ length: targetCount }, (_, index) => {
    const target = hole.recommendedTargets?.[index];
    const fallbackPoint = interpolateLatLng(
      hole.tee,
      hole.greenCenter,
      fallbackProgress[index] ?? 0.55,
    );

    return {
      label: target?.label || `Position Target ${index + 1}`,
      point: target?.point ? { ...target.point } : fallbackPoint,
    };
  });
}

function deriveDefaultTarget(hole: GpsHolePrototypeConfig, recommendedTargets = normalizeRecommendedTargets(hole)) {
  if (hole.par <= 3) {
    return { ...hole.greenCenter };
  }

  return recommendedTargets[0]?.point ? { ...recommendedTargets[0].point } : { ...hole.greenCenter };
}

function normalizePrototypeHole(hole: GpsHolePrototypeConfig): GpsHolePrototypeConfig {
  const recommendedTargets = normalizeRecommendedTargets(hole);

  return {
    ...hole,
    defaultTarget: deriveDefaultTarget(hole, recommendedTargets),
    recommendedTargets,
  };
}

function clonePrototypeHole(hole: GpsHolePrototypeConfig): GpsHolePrototypeConfig {
  return normalizePrototypeHole({
    ...hole,
    tee: { ...hole.tee },
    greenFront: { ...hole.greenFront },
    greenCenter: { ...hole.greenCenter },
    greenBack: { ...hole.greenBack },
    defaultTarget: { ...hole.defaultTarget },
    recommendedTargets: hole.recommendedTargets?.map((target) => ({
      ...target,
      point: { ...target.point },
    })),
    mapCenter: { ...hole.mapCenter },
  });
}

function clonePrototypeHoles(holes: GpsHolePrototypeConfig[]) {
  return holes.map(clonePrototypeHole);
}

function quoteTsString(value: string) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function formatPoint(point: LatLng) {
  return `{ lat: ${point.lat}, lng: ${point.lng} }`;
}

function roundNumber(value: number, decimals: number) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function formatRecommendedTargets(targets: GpsHolePrototypeConfig['recommendedTargets'], indent: string) {
  if (!targets?.length) return '[]';

  const itemIndent = `${indent}  `;
  const fieldIndent = `${indent}    `;

  return [
    '[',
    ...targets.flatMap((target) => [
      `${itemIndent}{`,
      `${fieldIndent}label: ${quoteTsString(target.label)},`,
      `${fieldIndent}point: ${formatPoint(target.point)},`,
      `${itemIndent}},`,
    ]),
    `${indent}]`,
  ].join('\n');
}

function formatHoleConfig(hole: GpsHolePrototypeConfig, options?: { spreadBase?: boolean }) {
  const normalizedHole = normalizePrototypeHole(hole);
  const lines: string[] = [options?.spreadBase ? '  {' : '{'];

  if (options?.spreadBase) {
    lines.push('    ...MACGREGOR_PROTOTYPE_HOLE,');
  } else {
    lines.push(`  courseName: ${quoteTsString(normalizedHole.courseName)},`);
  }

  const indent = options?.spreadBase ? '    ' : '  ';
  lines.push(`${indent}holeNumber: ${normalizedHole.holeNumber},`);
  lines.push(`${indent}par: ${normalizedHole.par},`);
  lines.push(`${indent}scorecardYardage: ${normalizedHole.scorecardYardage ?? 'null'},`);
  lines.push(`${indent}tee: ${formatPoint(normalizedHole.tee)},`);
  lines.push(`${indent}greenFront: ${formatPoint(normalizedHole.greenFront)},`);
  lines.push(`${indent}greenCenter: ${formatPoint(normalizedHole.greenCenter)},`);
  lines.push(`${indent}greenBack: ${formatPoint(normalizedHole.greenBack)},`);
  lines.push(`${indent}defaultTarget: ${formatPoint(normalizedHole.defaultTarget)},`);
  lines.push(`${indent}recommendedTargets: ${formatRecommendedTargets(normalizedHole.recommendedTargets, indent)},`);
  lines.push(`${indent}mapCenter: ${formatPoint(normalizedHole.mapCenter)},`);
  lines.push(`${indent}mapZoom: ${normalizedHole.mapZoom},`);
  lines.push(`${indent}mapBearing: ${normalizedHole.mapBearing ?? 0},`);
  lines.push(`${indent}mapTilt: ${normalizedHole.mapTilt ?? 0},`);
  lines.push(options?.spreadBase ? '  }' : '}');

  return lines.join('\n');
}

function formatActiveHoleFields(hole: GpsHolePrototypeConfig) {
  const normalizedHole = normalizePrototypeHole(hole);
  const indent = '    ';

  return [
    `holeNumber: ${normalizedHole.holeNumber},`,
    `${indent}par: ${normalizedHole.par},`,
    `${indent}scorecardYardage: ${normalizedHole.scorecardYardage ?? 'null'},`,
    `${indent}tee: ${formatPoint(normalizedHole.tee)},`,
    `${indent}greenFront: ${formatPoint(normalizedHole.greenFront)},`,
    `${indent}greenCenter: ${formatPoint(normalizedHole.greenCenter)},`,
    `${indent}greenBack: ${formatPoint(normalizedHole.greenBack)},`,
    `${indent}defaultTarget: ${formatPoint(normalizedHole.defaultTarget)},`,
    `${indent}recommendedTargets: ${formatRecommendedTargets(normalizedHole.recommendedTargets, indent)},`,
    `${indent}mapCenter: ${formatPoint(normalizedHole.mapCenter)},`,
    `${indent}mapZoom: ${normalizedHole.mapZoom},`,
    `${indent}mapBearing: ${normalizedHole.mapBearing ?? 0},`,
    `${indent}mapTilt: ${normalizedHole.mapTilt ?? 0},`,
  ].join('\n');
}

function formatPrototypeHolesSource(holes: GpsHolePrototypeConfig[]) {
  const [firstHole, ...remainingHoles] = holes;
  const baseHole = firstHole ?? MACGREGOR_PROTOTYPE_HOLE;

  return [
    "import type { GpsHolePrototypeConfig } from '@/lib/gps/types';",
    '',
    'export const MACGREGOR_PROTOTYPE_HOLE: GpsHolePrototypeConfig = ' +
      `${formatHoleConfig(baseHole)};`,
    '',
    'export const MACGREGOR_PROTOTYPE_HOLES: GpsHolePrototypeConfig[] = [',
    '  MACGREGOR_PROTOTYPE_HOLE,',
    ...remainingHoles.map((hole) => `${formatHoleConfig(hole, { spreadBase: true })},`),
    '];',
    '',
  ].join('\n');
}

function getEditFieldOptions(config: GpsHolePrototypeConfig): EditFieldOption[] {
  const recommendedTargets = config.recommendedTargets ?? [];
  const options = BASE_EDIT_FIELD_OPTIONS.slice(0, 4);

  if (recommendedTargets[0]) {
    options.push({ value: 'recommendedTarget1', label: 'Recommended Target 1' });
  }

  if (recommendedTargets[1]) {
    options.push({ value: 'recommendedTarget2', label: 'Recommended Target 2' });
  }

  options.push({ value: 'mapCenter', label: 'Map Center' });

  return options;
}

function updateHolePoint(
  hole: GpsHolePrototypeConfig,
  field: GpsPrototypeEditField,
  point: LatLng,
): GpsHolePrototypeConfig {
  if (field === 'recommendedTarget1' || field === 'recommendedTarget2') {
    const targetIndex = field === 'recommendedTarget1' ? 0 : 1;
    const recommendedTargets = [...(hole.recommendedTargets ?? [])];

    if (!recommendedTargets[targetIndex]) {
      return hole;
    }

    recommendedTargets[targetIndex] = {
      ...recommendedTargets[targetIndex],
      point,
    };

    return normalizePrototypeHole({
      ...hole,
      recommendedTargets,
    });
  }

  return normalizePrototypeHole({
    ...hole,
    [field]: point,
  });
}

function updateHoleCamera(hole: GpsHolePrototypeConfig, camera: GpsMapCamera): GpsHolePrototypeConfig {
  const nextCenter = {
    lat: roundNumber(camera.center.lat, 10),
    lng: roundNumber(camera.center.lng, 10),
  };
  const nextZoom = roundNumber(camera.zoom, 2);
  const nextBearing = roundNumber(camera.heading, 1);
  const nextTilt = roundNumber(camera.tilt, 1);

  if (
    hole.mapCenter.lat === nextCenter.lat &&
    hole.mapCenter.lng === nextCenter.lng &&
    hole.mapZoom === nextZoom &&
    (hole.mapBearing ?? 0) === nextBearing &&
    (hole.mapTilt ?? 0) === nextTilt
  ) {
    return hole;
  }

  return {
    ...hole,
    mapCenter: nextCenter,
    mapZoom: nextZoom,
    mapBearing: nextBearing,
    mapTilt: nextTilt,
  };
}

function coordinateText(point: LatLng) {
  return `${point.lat.toFixed(7)}, ${point.lng.toFixed(7)}`;
}

function interpolateLatLng(from: LatLng, to: LatLng, progress: number): LatLng {
  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lng: from.lng + (to.lng - from.lng) * progress,
  };
}

function routeTargetOrFallback(target: LatLng | undefined, fallback: LatLng, greenCenter: LatLng): LatLng {
  if (!target) return fallback;

  return distanceYards(target, greenCenter) > 20 ? target : fallback;
}

function getDefaultRouteTargets(config: GpsHolePrototypeConfig): LatLng[] {
  const recommendedTargets = (config.recommendedTargets ?? []).map((target) => target.point);

  if (config.par <= 3) {
    return [];
  }

  if (config.par === 4) {
    return [
      routeTargetOrFallback(
        recommendedTargets[0] ?? config.defaultTarget,
        interpolateLatLng(config.tee, config.greenCenter, 0.55),
        config.greenCenter,
      ),
    ];
  }

  return [
    routeTargetOrFallback(
      recommendedTargets[0] ?? config.defaultTarget,
      interpolateLatLng(config.tee, config.greenCenter, 0.4),
      config.greenCenter,
    ),
    routeTargetOrFallback(
      recommendedTargets[1],
      interpolateLatLng(config.tee, config.greenCenter, 0.72),
      config.greenCenter,
    ),
  ];
}

function sumPathYards(points: LatLng[]): number | null {
  if (points.length === 1) return 0;
  if (points.length < 2) return null;

  return points.reduce((sum, point, index) => {
    if (index === 0) return sum;
    return sum + distanceYards(points[index - 1], point);
  }, 0);
}

function toLocalYards(origin: LatLng, point: LatLng) {
  const metersPerDegree = 111320;
  const averageLat = ((origin.lat + point.lat) / 2) * (Math.PI / 180);
  return {
    x: metersToYards((point.lng - origin.lng) * metersPerDegree * Math.cos(averageLat)),
    y: metersToYards((point.lat - origin.lat) * metersPerDegree),
  };
}

function resolveMeasurementOrigin(args: {
  position: LatLng | null;
  accuracyMeters: number | null;
  tee: LatLng;
  greenCenter: LatLng;
  mapCenter: LatLng;
}): {
  position: LatLng | null;
  label: string;
  reason: string;
  usingTeeFallback: boolean;
} {
  const { position, accuracyMeters, tee, greenCenter, mapCenter } = args;

  if (!position) {
    return {
      position: null,
      label: 'No GPS',
      reason: 'Distances from your location are hidden until GPS is available.',
      usingTeeFallback: false,
    };
  }

  const distanceFromCourse = distanceYards(position, mapCenter);
  if (distanceFromCourse > OFF_COURSE_FALLBACK_YARDS) {
    return {
      position: tee,
      label: 'Tee Box',
      reason: `GPS looks off-course (${Math.round(distanceFromCourse)} yd away), so distances are measured from the tee.`,
      usingTeeFallback: true,
    };
  }

  const accuracyYards = accuracyMeters != null ? metersToYards(accuracyMeters) : null;
  if (accuracyYards != null && accuracyYards > LOW_ACCURACY_FALLBACK_YARDS) {
    return {
      position: tee,
      label: 'Tee Box',
      reason: `GPS accuracy is low (${Math.round(accuracyYards)} yd), so distances are measured from the tee.`,
      usingTeeFallback: true,
    };
  }

  const holeVector = toLocalYards(tee, greenCenter);
  const userVector = toLocalYards(tee, position);
  const holeLength = Math.hypot(holeVector.x, holeVector.y);
  const alongHoleYards =
    holeLength > 0
      ? (userVector.x * holeVector.x + userVector.y * holeVector.y) / holeLength
      : 0;

  if (alongHoleYards < -BEHIND_TEE_FALLBACK_YARDS) {
    return {
      position: tee,
      label: 'Tee Box',
      reason: 'GPS appears behind the tee, so distances are measured from the tee.',
      usingTeeFallback: true,
    };
  }

  return {
    position,
    label: 'GPS Location',
    reason: 'Distances are measured from your current GPS position.',
    usingTeeFallback: false,
  };
}

export default function GpsHolePrototype() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [editableHoles, setEditableHoles] = useState(() =>
    clonePrototypeHoles(MACGREGOR_PROTOTYPE_HOLES),
  );
  const [activeHoleIndex, setActiveHoleIndex] = useState(0);
  const config = editableHoles[activeHoleIndex] ?? editableHoles[0];
  const [customRouteTargets, setCustomRouteTargets] = useState<LatLng[] | null>(null);
  const [editModeEnabled, setEditModeEnabled] = useState(false);
  const [selectedEditField, setSelectedEditField] = useState<GpsPrototypeEditField>('tee');
  const [useDerivedCamera, setUseDerivedCamera] = useState(true);
  const [autoFitRequest, setAutoFitRequest] = useState(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const isAdmin = status === 'authenticated' && isAdminUserId(session?.user?.id);
  const currentLocation = useCurrentLocation(isAdmin);
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const editFieldOptions = useMemo(() => getEditFieldOptions(config), [config]);
  const defaultRouteTargets = useMemo(() => getDefaultRouteTargets(config), [config]);
  const routeTargets = customRouteTargets ?? defaultRouteTargets;
  const targetPath = useMemo(
    () => (routeTargets.length > 0 ? [...routeTargets, config.greenCenter] : [config.greenCenter]),
    [config.greenCenter, routeTargets],
  );
  const activeTarget = targetPath[0] ?? config.greenCenter;
  const hasCustomTarget = customRouteTargets != null;
  const isGreenCenterTarget = customRouteTargets?.length === 0;
  const measurementOrigin = useMemo(
    () =>
      resolveMeasurementOrigin({
        position: currentLocation.position,
        accuracyMeters: currentLocation.accuracyMeters,
        tee: config.tee,
        greenCenter: config.greenCenter,
        mapCenter: config.mapCenter,
      }),
    [
      config.greenCenter,
      config.mapCenter,
      config.tee,
      currentLocation.accuracyMeters,
      currentLocation.position,
    ],
  );

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/');
      return;
    }

    if (status === 'authenticated' && !isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, router, status]);

  useEffect(() => {
    setCustomRouteTargets(null);
    setCopyStatus(null);
  }, [activeHoleIndex]);

  useEffect(() => {
    if (!editFieldOptions.some((option) => option.value === selectedEditField)) {
      setSelectedEditField('tee');
    }
  }, [editFieldOptions, selectedEditField]);

  const handleTargetChange = useCallback((nextTarget: LatLng, targetIndex = 0) => {
    setCustomRouteTargets((current) => {
      const baseTargets = current ?? defaultRouteTargets;
      const nextTargets = baseTargets.length > 0 ? [...baseTargets] : [config.greenCenter];
      const boundedIndex = Math.max(0, Math.min(targetIndex, nextTargets.length - 1));
      nextTargets[boundedIndex] = nextTarget;
      return nextTargets;
    });
  }, [config.greenCenter, defaultRouteTargets]);

  const handleResetTarget = useCallback(() => {
    setCustomRouteTargets(null);
  }, []);

  const handleTargetToGreenCenter = useCallback(() => {
    setCustomRouteTargets([]);
  }, []);

  const handleEditPointChange = useCallback(
    (field: GpsPrototypeEditField, point: LatLng) => {
      setEditableHoles((currentHoles) =>
        currentHoles.map((hole, index) =>
          index === activeHoleIndex ? updateHolePoint(hole, field, point) : hole,
        ),
      );
      setCopyStatus(`${getEditFieldOptions(config).find((option) => option.value === field)?.label ?? 'Point'} updated.`);
    },
    [activeHoleIndex, config],
  );

  const handleCameraChange = useCallback((camera: GpsMapCamera) => {
    setEditableHoles((currentHoles) =>
      currentHoles.map((hole, index) =>
        index === activeHoleIndex ? updateHoleCamera(hole, camera) : hole,
      ),
    );
  }, [activeHoleIndex]);

  const copySource = useCallback(async (source: string, label: string) => {
    try {
      await navigator.clipboard.writeText(source);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus(`Copy failed. Select and copy the ${label.toLowerCase()} manually from devtools.`);
    }
  }, []);

  const handleResetActiveHole = useCallback(() => {
    setEditableHoles((currentHoles) =>
      currentHoles.map((hole, index) =>
        index === activeHoleIndex ? clonePrototypeHole(MACGREGOR_PROTOTYPE_HOLES[index] ?? hole) : hole,
      ),
    );
    setCustomRouteTargets(null);
    setCopyStatus('Active hole reset to hardcoded defaults.');
  }, [activeHoleIndex]);

  const handleResetAllHoles = useCallback(() => {
    setEditableHoles(clonePrototypeHoles(MACGREGOR_PROTOTYPE_HOLES));
    setCustomRouteTargets(null);
    setCopyStatus('All prototype holes reset to hardcoded defaults.');
  }, []);

  const distances = useMemo(() => {
    const origin = measurementOrigin.position;

    return {
      userToFront: origin ? distanceYards(origin, config.greenFront) : null,
      userToMiddle: origin ? distanceYards(origin, config.greenCenter) : null,
      userToBack: origin ? distanceYards(origin, config.greenBack) : null,
      userToTarget: origin ? distanceYards(origin, activeTarget) : null,
      targetRouteToMiddle: sumPathYards(targetPath),
    };
  }, [
    activeTarget,
    config.greenBack,
    config.greenCenter,
    config.greenFront,
    measurementOrigin.position,
    targetPath,
  ]);

  if (status === 'loading') {
    return <div className="gps-prototype-shell">Loading GPS prototype...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  const accuracyYards =
    currentLocation.accuracyMeters != null
      ? Math.round(metersToYards(currentLocation.accuracyMeters))
      : null;

  return (
    <div className="gps-prototype-shell">
      <section className="gps-prototype-header">
        <div>
          <p className="gps-prototype-kicker">Hidden GPS-Lite Prototype</p>
          <h1>{config.courseName}</h1>
          <p>
            Hole {config.holeNumber} | Par {config.par} |{' '}
            {config.scorecardYardage ? `${config.scorecardYardage} yd` : 'Yardage placeholder'}
          </p>
        </div>
        <div className="gps-prototype-status" data-status={currentLocation.status}>
          <span>GPS</span>
          <strong>{currentLocation.status}</strong>
        </div>
      </section>

      {currentLocation.message && (
        <section className="gps-prototype-fallback" role="status">
          {currentLocation.message}
        </section>
      )}

      <GoogleGpsHoleMap
        config={config}
        activeHoleIndex={activeHoleIndex}
        routeTargets={routeTargets}
        targetPath={targetPath}
        currentLocation={currentLocation}
        measurementOrigin={measurementOrigin.position}
        greenDistances={{
          front: distances.userToFront,
          middle: distances.userToMiddle,
          back: distances.userToBack,
        }}
        apiKey={googleMapsKey}
        onTargetChange={handleTargetChange}
        onTargetToGreenCenter={handleTargetToGreenCenter}
        editModeEnabled={editModeEnabled}
        selectedEditField={selectedEditField}
        onEditFieldSelect={setSelectedEditField}
        onEditPointChange={handleEditPointChange}
        onCameraChange={handleCameraChange}
        useDerivedCamera={useDerivedCamera}
        autoFitRequest={autoFitRequest}
      />

      <section className="gps-edit-panel" aria-label="GPS coordinate edit mode">
        <div className="gps-edit-panel-header">
          <div>
            <span>Edit Mode</span>
            <strong>{editModeEnabled ? 'On' : 'Off'}</strong>
          </div>
          <label className="gps-edit-toggle">
            <input
              type="checkbox"
              checked={editModeEnabled}
              onChange={(event) => setEditModeEnabled(event.target.checked)}
            />
            <span>Enable Editing</span>
          </label>
        </div>
        <div className="gps-edit-controls">
          <label htmlFor="gps-edit-field">Coordinate Field</label>
          <select
            id="gps-edit-field"
            value={selectedEditField}
            onChange={(event) => setSelectedEditField(event.target.value as GpsPrototypeEditField)}
            disabled={!editModeEnabled}
          >
            {editFieldOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p>
            {editModeEnabled
              ? 'Click the map to move the selected coordinate. Drag tee, green, recommended target, or map center markers to fine tune.'
              : 'Enable editing to adjust hardcoded prototype coordinates in local browser state only.'}
          </p>
          <label className="gps-admin-derived-toggle">
            <input
              type="checkbox"
              checked={useDerivedCamera}
              onChange={(event) => setUseDerivedCamera(event.target.checked)}
            />
            <span>Use Derived Camera</span>
          </label>
          <div className="gps-edit-legend" aria-label="Edit marker colors">
            <span>
              <i className="gps-edit-dot gps-edit-dot-tee" aria-hidden="true" />
              Tee
            </span>
            <span>
              <i className="gps-edit-dot gps-edit-dot-green-front" aria-hidden="true" />
              Front
            </span>
            <span>
              <i className="gps-edit-dot gps-edit-dot-green-middle" aria-hidden="true" />
              Middle
            </span>
            <span>
              <i className="gps-edit-dot gps-edit-dot-green-back" aria-hidden="true" />
              Back
            </span>
            <span>
              <i className="gps-edit-dot gps-edit-dot-recommended-target" aria-hidden="true" />
              Recommended Target
            </span>
            <span>
              <i className="gps-edit-dot gps-edit-dot-map-center" aria-hidden="true" />
              Map Center
            </span>
          </div>
        </div>
        <div className="gps-edit-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setAutoFitRequest((current) => current + 1);
              setCopyStatus('Fit Hole applied from tee, target, and green markers.');
            }}
          >
            Fit Hole
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => copySource(formatActiveHoleFields(config), 'Active hole fields')}
          >
            Copy Active Hole Fields
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => copySource(formatPrototypeHolesSource(editableHoles), 'Prototype holes TypeScript')}
          >
            Copy All Prototype Holes TS
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleResetActiveHole}>
            Reset Active Hole
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleResetAllHoles}>
            Reset All Holes
          </button>
        </div>
        {copyStatus && <p className="gps-edit-status" role="status">{copyStatus}</p>}
      </section>

      <section
        className={`gps-origin-note ${measurementOrigin.usingTeeFallback ? 'gps-origin-note-fallback' : ''}`}
        role="status"
      >
        <span>Distance Origin</span>
        <strong>{measurementOrigin.label}</strong>
        <p>{measurementOrigin.reason}</p>
      </section>

      <section className="gps-distance-grid" aria-label="GPS-lite distances">
        <div className="gps-distance-card gps-hole-selector-card">
          <label htmlFor="gps-active-hole">Active Hole</label>
          <select
            id="gps-active-hole"
            value={activeHoleIndex}
            onChange={(event) => setActiveHoleIndex(Number(event.target.value))}
          >
            {MACGREGOR_PROTOTYPE_HOLES.map((hole, index) => (
              <option key={hole.holeNumber} value={index}>
                Hole {editableHoles[index]?.holeNumber ?? hole.holeNumber} | Par{' '}
                {editableHoles[index]?.par ?? hole.par}
              </option>
            ))}
          </select>
          <p>Switch holes to verify map overlays update without recreating the Google map.</p>
        </div>
        <div className="gps-distance-card gps-shot-plan-card">
          <div>
            <span>Shot Plan</span>
            <strong>
              {hasCustomTarget
                ? isGreenCenterTarget
                  ? 'Green Center'
                  : 'Custom Target'
                : config.par <= 3
                  ? 'Green Center'
                  : `Recommended ${targetPath.length}-Leg Route`}
            </strong>
          </div>
          <button
            type="button"
            className="btn btn-secondary gps-reset-target-btn"
            onClick={handleResetTarget}
            disabled={!hasCustomTarget}
          >
            {config.par <= 3 ? 'Reset to Green' : 'Reset Route'}
          </button>
        </div>
        <div className="gps-distance-card">
          <span>To Front</span>
          <strong>{formatYards(distances.userToFront)}</strong>
        </div>
        <div className="gps-distance-card">
          <span>To Middle</span>
          <strong>{formatYards(distances.userToMiddle)}</strong>
        </div>
        <div className="gps-distance-card">
          <span>To Back</span>
          <strong>{formatYards(distances.userToBack)}</strong>
        </div>
        <div className="gps-distance-card">
          <span>To Target</span>
          <strong>{formatYards(distances.userToTarget)}</strong>
        </div>
        <div className="gps-distance-card">
          <span>Route To Middle</span>
          <strong>{formatYards(distances.targetRouteToMiddle)}</strong>
        </div>
        <div className="gps-distance-card">
          <span>GPS Accuracy</span>
          <strong>{accuracyYards != null ? `${accuracyYards} yd` : '--'}</strong>
        </div>
      </section>

      <section className="gps-coordinate-panel">
        <h2>Prototype Coordinates</h2>
        <dl>
          <div>
            <dt>Tee</dt>
            <dd>{coordinateText(config.tee)}</dd>
          </div>
          <div>
            <dt>Green Front</dt>
            <dd>{coordinateText(config.greenFront)}</dd>
          </div>
          <div>
            <dt>Green Middle</dt>
            <dd>{coordinateText(config.greenCenter)}</dd>
          </div>
          <div>
            <dt>Green Back</dt>
            <dd>{coordinateText(config.greenBack)}</dd>
          </div>
          <div>
            <dt>Active Target</dt>
            <dd>{coordinateText(activeTarget)}</dd>
          </div>
          <div>
            <dt>Derived Default</dt>
            <dd>{coordinateText(config.defaultTarget)}</dd>
          </div>
          {config.recommendedTargets?.map((target, index) => (
            <div key={`${target.label}-${index}`}>
              <dt>{target.label}</dt>
              <dd>{coordinateText(target.point)}</dd>
            </div>
          ))}
          {routeTargets.slice(1).map((point, index) => (
            <div key={`${point.lat}-${point.lng}-${index}`}>
              <dt>{`Route Target ${index + 2}`}</dt>
              <dd>{coordinateText(point)}</dd>
            </div>
          ))}
          <div>
            <dt>Green Target</dt>
            <dd>{coordinateText(config.greenCenter)}</dd>
          </div>
          <div>
            <dt>Map Center</dt>
            <dd>{coordinateText(config.mapCenter)}</dd>
          </div>
          <div>
            <dt>Map Zoom</dt>
            <dd>{config.mapZoom}</dd>
          </div>
          <div>
            <dt>Map Bearing</dt>
            <dd>{config.mapBearing ?? 0}</dd>
          </div>
          <div>
            <dt>Map Tilt</dt>
            <dd>{config.mapTilt ?? 0}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
