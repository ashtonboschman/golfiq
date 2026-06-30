import 'server-only';

import { GpsMappingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  LiveGpsAvailability,
  LiveGpsMappedHole,
  LiveGpsMapping,
  LiveGpsPoint,
} from '@/lib/gps/liveMappingTypes';

export type {
  LiveGpsAvailability,
  LiveGpsMappedHole,
  LiveGpsMapping,
  LiveGpsPoint,
} from '@/lib/gps/liveMappingTypes';

type CourseIdInput = bigint | number | string;

export class LiveGpsMappingError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'LiveGpsMappingError';
    this.status = status;
    this.code = code;
  }
}

const liveGpsCourseSelect = {
  tees: {
    select: {
      holes: {
        select: { holeNumber: true },
      },
    },
  },
  mappedCourse: {
    select: {
      mappingStatus: true,
      holes: {
        where: {
          mappingStatus: {
            in: [GpsMappingStatus.READY, GpsMappingStatus.VERIFIED],
          },
        },
        select: {
          holeNumber: true,
          mappingStatus: true,
          teeLat: true,
          teeLng: true,
          target1Lat: true,
          target1Lng: true,
          target1Label: true,
          target2Lat: true,
          target2Lng: true,
          target2Label: true,
          greenFrontLat: true,
          greenFrontLng: true,
          greenCenterLat: true,
          greenCenterLng: true,
          greenBackLat: true,
          greenBackLng: true,
        },
        orderBy: { holeNumber: 'asc' as const },
      },
    },
  },
} satisfies Prisma.CourseSelect;

type LiveGpsCourseRow = Prisma.CourseGetPayload<{
  select: typeof liveGpsCourseSelect;
}>;

type LiveGpsMappedHoleRow = NonNullable<LiveGpsCourseRow['mappedCourse']>['holes'][number];

function parseCourseId(value: CourseIdInput) {
  try {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error('invalid number');
    }

    if (typeof value === 'string' && !/^[1-9]\d*$/.test(value.trim())) {
      throw new Error('invalid string');
    }

    const parsed = BigInt(typeof value === 'string' ? value.trim() : value);
    if (parsed <= BigInt(0)) throw new Error('not positive');
    return parsed;
  } catch {
    throw new LiveGpsMappingError('Invalid course id', 400, 'invalid_course_id');
  }
}

function decimalToFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    parsed = Number(value);
  } else if (
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof value.toNumber === 'function'
  ) {
    parsed = value.toNumber();
  } else {
    return null;
  }

  return Number.isFinite(parsed) ? parsed : null;
}

function toPoint(latValue: unknown, lngValue: unknown): LiveGpsPoint | null {
  const lat = decimalToFiniteNumber(latValue);
  const lng = decimalToFiniteNumber(lngValue);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function targetLabel(value: string | null, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function serializeUsableHole(hole: LiveGpsMappedHoleRow): LiveGpsMappedHole | null {
  const tee = toPoint(hole.teeLat, hole.teeLng);
  const greenFront = toPoint(hole.greenFrontLat, hole.greenFrontLng);
  const greenCenter = toPoint(hole.greenCenterLat, hole.greenCenterLng);
  const greenBack = toPoint(hole.greenBackLat, hole.greenBackLng);

  if (!tee || !greenFront || !greenCenter || !greenBack) return null;

  const targets: LiveGpsMappedHole['targets'] = [];
  const target1 = toPoint(hole.target1Lat, hole.target1Lng);
  const target2 = toPoint(hole.target2Lat, hole.target2Lng);

  if (target1) {
    targets.push({
      label: targetLabel(hole.target1Label, 'Target 1'),
      point: target1,
    });
  }

  if (target2) {
    targets.push({
      label: targetLabel(hole.target2Label, 'Target 2'),
      point: target2,
    });
  }

  return {
    holeNumber: hole.holeNumber,
    tee,
    green: {
      front: greenFront,
      center: greenCenter,
      back: greenBack,
    },
    targets,
  };
}

function expectedHoleNumbers(course: LiveGpsCourseRow | null) {
  if (!course) return [];

  return Array.from(
    new Set(course.tees.flatMap((tee) => tee.holes.map((hole) => hole.holeNumber))),
  ).sort((a, b) => a - b);
}

function unavailableMapping(courseId: bigint, expected: number[]): LiveGpsMapping {
  return {
    availability: {
      courseId: courseId.toString(),
      available: false,
      coverage: 'none',
      expectedHoleNumbers: expected,
      availableHoleNumbers: [],
      unavailableHoleNumbers: expected,
      reason: 'not_published',
    },
    holes: [],
  };
}

async function buildLiveGpsMapping(courseIdInput: CourseIdInput): Promise<LiveGpsMapping> {
  const courseId = parseCourseId(courseIdInput);
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: liveGpsCourseSelect,
  });
  const expected = expectedHoleNumbers(course);
  const published = course?.mappedCourse && (
    course.mappedCourse.mappingStatus === GpsMappingStatus.READY ||
    course.mappedCourse.mappingStatus === GpsMappingStatus.VERIFIED
  );

  if (!course?.mappedCourse || !published) {
    return unavailableMapping(courseId, expected);
  }

  const expectedSet = new Set(expected);
  const holes = course.mappedCourse.holes
    .filter((hole) => (
      expectedSet.has(hole.holeNumber) &&
      (hole.mappingStatus === GpsMappingStatus.READY ||
        hole.mappingStatus === GpsMappingStatus.VERIFIED)
    ))
    .map(serializeUsableHole)
    .filter((hole): hole is LiveGpsMappedHole => hole !== null);
  const availableHoleNumbers = holes.map((hole) => hole.holeNumber);
  const availableSet = new Set(availableHoleNumbers);
  const unavailableHoleNumbers = expected.filter((holeNumber) => !availableSet.has(holeNumber));
  const coverage = availableHoleNumbers.length === 0
    ? 'none'
    : unavailableHoleNumbers.length === 0 && expected.length > 0
      ? 'full'
      : 'partial';
  const available = coverage === 'full';

  return {
    availability: {
      courseId: courseId.toString(),
      available,
      coverage,
      expectedHoleNumbers: expected,
      availableHoleNumbers,
      unavailableHoleNumbers,
      reason: available ? 'available' : 'incomplete_mapping',
    },
    holes,
  };
}

export async function getLiveGpsAvailabilityForCourse(
  courseId: CourseIdInput,
): Promise<LiveGpsAvailability> {
  const mapping = await buildLiveGpsMapping(courseId);
  return mapping.availability;
}

export async function getLiveGpsMappingForCourse(
  courseId: CourseIdInput,
): Promise<LiveGpsMapping> {
  return buildLiveGpsMapping(courseId);
}
