'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AdminGpsMappingMap from '@/components/gps/AdminGpsMappingMap';
import type {
  GpsCourseMappingCourse,
  GpsMappedCourseSummary,
  GpsMappedHoleDraft,
  GpsMappingEditField,
  GpsScorecardHole,
  SaveGpsMappedHoleDraftPayload,
  SerializedMappedCourse,
  SerializedMappedHole,
} from '@/lib/gps/adminMappingTypes';
import type { LatLng } from '@/lib/gps/types';

type ReadyHoleResult = {
  ok: boolean;
  missingFields: string[];
  mappedHole: SerializedMappedHole;
};

type ReadyCourseResult = {
  ok: boolean;
  missingHoles: number[];
  notReadyHoles: number[];
  message?: string;
};

type BoundsResult = {
  ok: boolean;
  message?: string;
  pointCount: number;
  mappedCourse?: SerializedMappedCourse | null;
};

type DuplicateResult = {
  created: number[];
  updated: number[];
  skipped: number[];
  missingSource: number[];
  mappedHoles: SerializedMappedHole[];
};

type AdminGpsMappingCourseClientProps = {
  course: GpsCourseMappingCourse;
  mappedCourse: GpsMappedCourseSummary;
  scorecardHoles: GpsScorecardHole[];
  googleMapsKey: string | undefined;
  actions: {
    saveDraft: (input: SaveGpsMappedHoleDraftPayload) => Promise<{ mappedHole: SerializedMappedHole }>;
    markHoleReady: (mappedHoleId: string) => Promise<ReadyHoleResult>;
    markCourseReady: (mappedCourseId: string) => Promise<ReadyCourseResult>;
    recalculateBounds: (mappedCourseId: string) => Promise<BoundsResult>;
    duplicateFrontNine: (mappedCourseId: string, options?: { overwrite?: boolean }) => Promise<DuplicateResult>;
  };
};

const REQUIRED_POINTS = [
  { label: 'Tee', latKey: 'teeLat', lngKey: 'teeLng' },
  { label: 'Green Front', latKey: 'greenFrontLat', lngKey: 'greenFrontLng' },
  { label: 'Green Center', latKey: 'greenCenterLat', lngKey: 'greenCenterLng' },
  { label: 'Green Back', latKey: 'greenBackLat', lngKey: 'greenBackLng' },
] as const;

const FIELD_LABELS: Record<GpsMappingEditField, string> = {
  tee: 'Tee',
  target1: 'Target 1',
  target2: 'Target 2',
  greenFront: 'Green Front',
  greenCenter: 'Green Center',
  greenBack: 'Green Back',
};

const FIELD_COORDS: Record<GpsMappingEditField, Array<keyof GpsMappedHoleDraft>> = {
  tee: ['teeLat', 'teeLng'],
  target1: ['target1Lat', 'target1Lng'],
  target2: ['target2Lat', 'target2Lng'],
  greenFront: ['greenFrontLat', 'greenFrontLng'],
  greenCenter: ['greenCenterLat', 'greenCenterLng'],
  greenBack: ['greenBackLat', 'greenBackLng'],
};

type CourseBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

function scorecardHoleLabel(hole: GpsScorecardHole) {
  const parts = [`Hole ${hole.holeNumber}`];
  if (hole.par != null) parts.push(`Par ${hole.par}`);
  if (hole.yardage != null) parts.push(`${hole.yardage} yd`);
  return parts.join(' | ');
}

function normalizeMappedHole(
  mappedCourseId: string,
  holeNumber: number,
  source?: SerializedMappedHole,
): GpsMappedHoleDraft {
  return {
    id: source?.id ?? null,
    mappedCourseId,
    holeNumber,
    teeLat: source?.teeLat ?? null,
    teeLng: source?.teeLng ?? null,
    target1Lat: source?.target1Lat ?? null,
    target1Lng: source?.target1Lng ?? null,
    target1Label: source?.target1Label ?? 'Target 1',
    target2Lat: source?.target2Lat ?? null,
    target2Lng: source?.target2Lng ?? null,
    target2Label: source?.target2Label ?? 'Target 2',
    greenFrontLat: source?.greenFrontLat ?? null,
    greenFrontLng: source?.greenFrontLng ?? null,
    greenCenterLat: source?.greenCenterLat ?? null,
    greenCenterLng: source?.greenCenterLng ?? null,
    greenBackLat: source?.greenBackLat ?? null,
    greenBackLng: source?.greenBackLng ?? null,
    mappingStatus: source?.mappingStatus ?? 'DRAFT',
    source: source?.source ?? 'MANUAL_ADMIN_GOOGLE',
    verifiedAt: source?.verifiedAt ?? null,
  };
}

function missingRequiredPoints(hole: GpsMappedHoleDraft) {
  return REQUIRED_POINTS
    .filter(({ latKey, lngKey }) => hole[latKey] == null || hole[lngKey] == null)
    .map(({ label }) => label);
}

function completionSummary(hole: GpsMappedHoleDraft) {
  const missing = missingRequiredPoints(hole);
  return {
    complete: REQUIRED_POINTS.length - missing.length,
    total: REQUIRED_POINTS.length,
    missing,
  };
}

function fieldOptionsForPar(par: number | null): GpsMappingEditField[] {
  if (par != null && par <= 3) {
    return ['tee', 'greenFront', 'greenCenter', 'greenBack'];
  }

  if (par === 4) {
    return ['tee', 'target1', 'greenFront', 'greenCenter', 'greenBack'];
  }

  return ['tee', 'target1', 'target2', 'greenFront', 'greenCenter', 'greenBack'];
}

function formatCoord(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return '--';
  return `${lat.toFixed(7)}, ${lng.toFixed(7)}`;
}

function holeToSavePayload(hole: GpsMappedHoleDraft): SaveGpsMappedHoleDraftPayload {
  return {
    mappedCourseId: hole.mappedCourseId,
    holeNumber: hole.holeNumber,
    teeLat: hole.teeLat,
    teeLng: hole.teeLng,
    target1Lat: hole.target1Lat,
    target1Lng: hole.target1Lng,
    target1Label: hole.target1Label,
    target2Lat: hole.target2Lat,
    target2Lng: hole.target2Lng,
    target2Label: hole.target2Label,
    greenFrontLat: hole.greenFrontLat,
    greenFrontLng: hole.greenFrontLng,
    greenCenterLat: hole.greenCenterLat,
    greenCenterLng: hole.greenCenterLng,
    greenBackLat: hole.greenBackLat,
    greenBackLng: hole.greenBackLng,
  };
}

function fallbackMapCenter(course: GpsCourseMappingCourse): LatLng {
  const lat = course.location?.latitude;
  const lng = course.location?.longitude;
  if (lat != null && lng != null) return { lat, lng };
  return { lat: 49.9718444, lng: -98.7693684 };
}

function boundsFromMappedCourse(course: SerializedMappedCourse): CourseBounds | null {
  if (
    course.boundsNorth == null ||
    course.boundsSouth == null ||
    course.boundsEast == null ||
    course.boundsWest == null
  ) {
    return null;
  }

  return {
    north: course.boundsNorth,
    south: course.boundsSouth,
    east: course.boundsEast,
    west: course.boundsWest,
  };
}

export default function AdminGpsMappingCourseClient({
  course,
  mappedCourse,
  scorecardHoles,
  googleMapsKey,
  actions,
}: AdminGpsMappingCourseClientProps) {
  const router = useRouter();
  const [holesByNumber, setHolesByNumber] = useState(() => {
    const mappedByNumber = new Map(mappedCourse.holes.map((hole) => [hole.holeNumber, hole]));
    return new Map(
      scorecardHoles.map((hole) => [
        hole.holeNumber,
        normalizeMappedHole(mappedCourse.id, hole.holeNumber, mappedByNumber.get(hole.holeNumber)),
      ]),
    );
  });
  const [activeHoleNumber, setActiveHoleNumber] = useState(scorecardHoles[0]?.holeNumber ?? 1);
  const [selectedField, setSelectedField] = useState<GpsMappingEditField>('tee');
  const [derivedCameraRequest, setDerivedCameraRequest] = useState(0);
  const [courseBounds, setCourseBounds] = useState<CourseBounds | null>(() => boundsFromMappedCourse(mappedCourse));
  const [showCourseBounds, setShowCourseBounds] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeScorecardHole = scorecardHoles.find((hole) => hole.holeNumber === activeHoleNumber) ?? null;
  const activeHoleIndex = scorecardHoles.findIndex((hole) => hole.holeNumber === activeHoleNumber);
  const previousHole = activeHoleIndex > 0 ? scorecardHoles[activeHoleIndex - 1] : null;
  const nextHole =
    activeHoleIndex >= 0 && activeHoleIndex < scorecardHoles.length - 1
      ? scorecardHoles[activeHoleIndex + 1]
      : null;
  const activeHole =
    holesByNumber.get(activeHoleNumber) ??
    normalizeMappedHole(mappedCourse.id, activeHoleNumber);
  const fieldOptions = useMemo(
    () => fieldOptionsForPar(activeScorecardHole?.par ?? null),
    [activeScorecardHole?.par],
  );
  const activeCompletion = completionSummary(activeHole);
  const activeHoleReady = activeHole.mappingStatus === 'READY' || activeHole.mappingStatus === 'VERIFIED';
  const courseReady = mappedCourse.mappingStatus === 'READY' || mappedCourse.mappingStatus === 'VERIFIED';

  function patchHole(holeNumber: number, patch: Partial<GpsMappedHoleDraft>) {
    setHolesByNumber((current) => {
      const next = new Map(current);
      const existing = next.get(holeNumber) ?? normalizeMappedHole(mappedCourse.id, holeNumber);
      next.set(holeNumber, { ...existing, ...patch });
      return next;
    });
  }

  function selectHole(holeNumber: number) {
    setActiveHoleNumber(holeNumber);
    setSelectedField('tee');
    setErrorMessage(null);
    setStatusMessage(null);
  }

  function handlePointChange(field: GpsMappingEditField, point: LatLng) {
    const [latKey, lngKey] = FIELD_COORDS[field];
    patchHole(activeHoleNumber, {
      [latKey]: point.lat,
      [lngKey]: point.lng,
    } as Partial<GpsMappedHoleDraft>);
  }

  function handleMarkHoleReady() {
    setErrorMessage(null);
    setStatusMessage(null);

    startTransition(async () => {
      try {
        const saved = await actions.saveDraft(holeToSavePayload(activeHole));
        const result = await actions.markHoleReady(saved.mappedHole.id);
        patchHole(activeHoleNumber, normalizeMappedHole(mappedCourse.id, activeHoleNumber, result.mappedHole));

        if (!result.ok) {
          setErrorMessage(`Missing required fields: ${result.missingFields.join(', ')}`);
          return;
        }

        setStatusMessage(`Hole ${activeHoleNumber} saved and marked ready.`);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to mark mapped hole ready.');
      }
    });
  }

  function mergeMappedHoles(mappedHoles: SerializedMappedHole[]) {
    if (mappedHoles.length === 0) return;

    setHolesByNumber((current) => {
      const next = new Map(current);
      mappedHoles.forEach((mappedHole) => {
        next.set(
          mappedHole.holeNumber,
          normalizeMappedHole(mappedCourse.id, mappedHole.holeNumber, mappedHole),
        );
      });
      return next;
    });
  }

  function handleCourseAction(action: 'bounds' | 'duplicate' | 'sync' | 'ready') {
    setErrorMessage(null);
    setStatusMessage(null);

    startTransition(async () => {
      try {
        if (action === 'bounds') {
          const result = await actions.recalculateBounds(mappedCourse.id);
          if (!result.ok) {
            setErrorMessage(result.message ?? 'Unable to calculate bounds.');
            return;
          }
          if (result.mappedCourse) {
            setCourseBounds(boundsFromMappedCourse(result.mappedCourse));
          }
          setStatusMessage(`Bounds recalculated from ${result.pointCount} mapped points.`);
        }

        if (action === 'duplicate' || action === 'sync') {
          const result = await actions.duplicateFrontNine(mappedCourse.id, {
            overwrite: action === 'sync',
          });
          mergeMappedHoles(result.mappedHoles);
          setStatusMessage(
            `Created ${result.created.length} back-nine holes. Updated ${result.updated.length}. Skipped ${result.skipped.length}. Missing front-nine sources ${result.missingSource.length}.`,
          );
        }

        if (action === 'ready') {
          const result = await actions.markCourseReady(mappedCourse.id);
          if (!result.ok) {
            setErrorMessage(
              result.message ??
                `Missing holes: ${result.missingHoles.join(', ') || 'none'}; not ready: ${result.notReadyHoles.join(', ') || 'none'}.`,
            );
            return;
          }
          setStatusMessage('Course marked ready.');
        }

        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Course action failed.');
      }
    });
  }

  return (
    <div className="gps-admin-layout">
      <details className="gps-admin-course-tools">
        <summary>Course Tools</summary>
        <div className="gps-admin-course-actions">
          <button type="button" className="btn btn-secondary" onClick={() => handleCourseAction('bounds')} disabled={isPending}>
            Recalculate Bounds
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => handleCourseAction('duplicate')} disabled={isPending}>
            Duplicate Front 9
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => handleCourseAction('sync')} disabled={isPending}>
            Sync Back 9
          </button>
          {!courseReady && (
            <button type="button" className="btn btn-primary" onClick={() => handleCourseAction('ready')} disabled={isPending}>
              Mark Course Ready
            </button>
          )}
        </div>
      </details>

      <main className="gps-admin-main">
        <section className="gps-admin-editor-card">
          <div className="gps-admin-editor-header">
            <div>
              <span className="gps-admin-card-label">Active Hole</span>
              <h2>{activeScorecardHole ? scorecardHoleLabel(activeScorecardHole) : `Hole ${activeHoleNumber}`}</h2>
            </div>
            <div className="gps-admin-header-actions">
              <div
                className={`gps-admin-status-pill${activeHoleReady ? ' is-ready' : ''}`}
                title={activeCompletion.missing.length > 0
                  ? `Missing: ${activeCompletion.missing.join(', ')}`
                  : 'All required fields are complete.'}
              >
                {activeCompletion.complete}/{activeCompletion.total}{' '}
                {activeHoleReady ? 'Ready' : 'Complete'}
              </div>
              <div className="gps-admin-hole-nav" aria-label="Hole navigation">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => previousHole && selectHole(previousHole.holeNumber)}
                  disabled={!previousHole}
                >
                  Previous Hole
                </button>
                <span>
                  {activeHoleIndex >= 0 ? activeHoleIndex + 1 : activeHoleNumber}/{scorecardHoles.length}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => nextHole && selectHole(nextHole.holeNumber)}
                  disabled={!nextHole}
                >
                  Next Hole
                </button>
              </div>
            </div>
          </div>

          {(statusMessage || errorMessage) && (
            <div className={`gps-admin-message ${errorMessage ? 'error' : 'success'}`} role="status">
              {errorMessage ?? statusMessage}
            </div>
          )}

          <div className="gps-admin-edit-controls">
            <label htmlFor="gps-admin-field">Coordinate Field</label>
            <select
              id="gps-admin-field"
              value={selectedField}
              onChange={(event) => setSelectedField(event.target.value as GpsMappingEditField)}
            >
              {fieldOptions.map((field) => (
                <option key={field} value={field}>
                  {FIELD_LABELS[field]}
                </option>
              ))}
            </select>
            <p>Click the map or drag a marker to update the selected geometry field.</p>
          </div>

          <AdminGpsMappingMap
            apiKey={googleMapsKey}
            hole={activeHole}
            selectedField={selectedField}
            courseBounds={courseBounds}
            showCourseBounds={showCourseBounds}
            fallbackCenter={fallbackMapCenter(course)}
            derivedCameraRequest={derivedCameraRequest}
            onFieldSelect={setSelectedField}
            onPointChange={handlePointChange}
          />

          <div className="gps-admin-map-toolbar">
            <label
              className="gps-admin-toggle gps-admin-bounds-toggle"
              title={courseBounds
                ? 'Show the saved mapped-course bounds.'
                : 'Recalculate bounds before showing the course box.'}
            >
              <input
                type="checkbox"
                checked={showCourseBounds}
                onChange={(event) => setShowCourseBounds(event.target.checked)}
                disabled={!courseBounds}
              />
              <span>Show Bounds</span>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDerivedCameraRequest((current) => current + 1)}
            >
              Fit Hole
            </button>
            <button type="button" className="btn btn-primary" onClick={handleMarkHoleReady} disabled={isPending}>
              Mark Hole Ready
            </button>
          </div>

          <details className="gps-admin-coordinate-details">
            <summary>View Coordinates</summary>
            <section className="gps-admin-coordinates">
              {(Object.keys(FIELD_LABELS) as GpsMappingEditField[]).map((field) => {
                const [latKey, lngKey] = FIELD_COORDS[field];
                return (
                  <div key={field}>
                    <span>{FIELD_LABELS[field]}</span>
                    <code>{formatCoord(activeHole[latKey] as number | null, activeHole[lngKey] as number | null)}</code>
                  </div>
                );
              })}
            </section>
          </details>
        </section>
      </main>

      <section className="gps-admin-hole-section" aria-label="Mapped holes">
        <div className="gps-admin-hole-section-header">
          <h2>Mapped Holes</h2>
          <span className="gps-admin-count-pill">{scorecardHoles.length} Holes</span>
        </div>
        <div className="gps-admin-hole-list">
          {scorecardHoles.map((scorecardHole) => {
            const mappedHole = holesByNumber.get(scorecardHole.holeNumber);
            const summary = mappedHole ? completionSummary(mappedHole) : null;
            const isReady = mappedHole?.mappingStatus === 'READY'
              || mappedHole?.mappingStatus === 'VERIFIED';
            return (
              <button
                key={scorecardHole.holeNumber}
                type="button"
                className={`gps-admin-hole-row${scorecardHole.holeNumber === activeHoleNumber ? ' active' : ''}${isReady ? ' is-ready' : ''}`}
                onClick={() => selectHole(scorecardHole.holeNumber)}
              >
                <span>{scorecardHoleLabel(scorecardHole)}</span>
                {isReady ? (
                  <strong className="gps-admin-hole-ready-mark" aria-label="Ready">✓</strong>
                ) : (
                  <em>{summary ? `${summary.complete}/${summary.total} points` : '0/4 points'}</em>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
