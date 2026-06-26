'use server';

import 'server-only';
import { GpsMappingSource, GpsMappingStatus, Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

type IdInput = bigint | number | string;

type NullableNumber = number | null;

type SaveGpsMappedHoleDraftInput = {
  mappedCourseId: IdInput;
  holeNumber: number;
  teeLat?: NullableNumber;
  teeLng?: NullableNumber;
  target1Lat?: NullableNumber;
  target1Lng?: NullableNumber;
  target1Label?: string | null;
  target2Lat?: NullableNumber;
  target2Lng?: NullableNumber;
  target2Label?: string | null;
  greenFrontLat?: NullableNumber;
  greenFrontLng?: NullableNumber;
  greenCenterLat?: NullableNumber;
  greenCenterLng?: NullableNumber;
  greenBackLat?: NullableNumber;
  greenBackLng?: NullableNumber;
  source?: GpsMappingSource;
};

type MappedHoleNumberField = keyof Pick<
  SaveGpsMappedHoleDraftInput,
  | 'teeLat'
  | 'teeLng'
  | 'target1Lat'
  | 'target1Lng'
  | 'target2Lat'
  | 'target2Lng'
  | 'greenFrontLat'
  | 'greenFrontLng'
  | 'greenCenterLat'
  | 'greenCenterLng'
  | 'greenBackLat'
  | 'greenBackLng'
>;

type MappedHoleDraftData = Partial<Record<MappedHoleNumberField, number | null>> & {
  target1Label?: string | null;
  target2Label?: string | null;
  mappingStatus: GpsMappingStatus;
  source: GpsMappingSource;
  verifiedAt: null;
};

const DEFAULT_MIN_ZOOM = 16;
const DEFAULT_MAX_ZOOM = 19;
const BOUNDS_PADDING_DEGREES = 0.0005;

const READY_REQUIRED_FIELDS = [
  'teeLat',
  'teeLng',
  'greenFrontLat',
  'greenFrontLng',
  'greenCenterLat',
  'greenCenterLng',
  'greenBackLat',
  'greenBackLng',
] as const satisfies readonly MappedHoleNumberField[];

const MAPPED_HOLE_NUMBER_FIELDS = [
  'teeLat',
  'teeLng',
  'target1Lat',
  'target1Lng',
  'target2Lat',
  'target2Lng',
  'greenFrontLat',
  'greenFrontLng',
  'greenCenterLat',
  'greenCenterLng',
  'greenBackLat',
  'greenBackLng',
] as const;

function toBigIntId(value: IdInput, label: string) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid ${label}`);
  }
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof value.toNumber === 'function'
  ) {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function nullableNumberForPrisma(value: NullableNumber | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isFinite(value)) {
    throw new Error('GPS mapping values must be finite numbers or null.');
  }
  return value;
}

function hasOwn(input: object, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function setOptionalNumber(
  data: MappedHoleDraftData,
  input: SaveGpsMappedHoleDraftInput,
  key: MappedHoleNumberField,
) {
  if (!hasOwn(input, key)) return;
  data[key] = nullableNumberForPrisma(input[key]) as never;
}

function setOptionalString(
  data: MappedHoleDraftData,
  input: SaveGpsMappedHoleDraftInput,
  key: 'target1Label' | 'target2Label',
) {
  if (!hasOwn(input, key)) return;
  const value = input[key];
  data[key] = value === undefined || value === null ? null : value.trim().slice(0, 100);
}

function buildMappedHoleDraftData(input: SaveGpsMappedHoleDraftInput) {
  const data: MappedHoleDraftData = {
    mappingStatus: GpsMappingStatus.DRAFT,
    source: input.source ?? GpsMappingSource.MANUAL_ADMIN_GOOGLE,
    verifiedAt: null,
  };

  MAPPED_HOLE_NUMBER_FIELDS.forEach((key) => setOptionalNumber(data, input, key));
  setOptionalString(data, input, 'target1Label');
  setOptionalString(data, input, 'target2Label');

  return data;
}

function mappedCourseSelect() {
  return {
    id: true,
    courseId: true,
    boundsNorth: true,
    boundsSouth: true,
    boundsEast: true,
    boundsWest: true,
    minZoom: true,
    maxZoom: true,
    mappingStatus: true,
    source: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.MappedCourseSelect;
}

function mappedHoleSelect() {
  return {
    id: true,
    mappedCourseId: true,
    holeNumber: true,
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
    mappingStatus: true,
    source: true,
    verifiedAt: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.MappedHoleSelect;
}

function serializeMappedCourse(course: Prisma.MappedCourseGetPayload<{ select: ReturnType<typeof mappedCourseSelect> }>) {
  return {
    id: course.id.toString(),
    courseId: course.courseId.toString(),
    boundsNorth: decimalToNumber(course.boundsNorth),
    boundsSouth: decimalToNumber(course.boundsSouth),
    boundsEast: decimalToNumber(course.boundsEast),
    boundsWest: decimalToNumber(course.boundsWest),
    minZoom: decimalToNumber(course.minZoom),
    maxZoom: decimalToNumber(course.maxZoom),
    mappingStatus: course.mappingStatus,
    source: course.source,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

function serializeMappedHole(hole: Prisma.MappedHoleGetPayload<{ select: ReturnType<typeof mappedHoleSelect> }>) {
  return {
    id: hole.id.toString(),
    mappedCourseId: hole.mappedCourseId.toString(),
    holeNumber: hole.holeNumber,
    teeLat: decimalToNumber(hole.teeLat),
    teeLng: decimalToNumber(hole.teeLng),
    target1Lat: decimalToNumber(hole.target1Lat),
    target1Lng: decimalToNumber(hole.target1Lng),
    target1Label: hole.target1Label,
    target2Lat: decimalToNumber(hole.target2Lat),
    target2Lng: decimalToNumber(hole.target2Lng),
    target2Label: hole.target2Label,
    greenFrontLat: decimalToNumber(hole.greenFrontLat),
    greenFrontLng: decimalToNumber(hole.greenFrontLng),
    greenCenterLat: decimalToNumber(hole.greenCenterLat),
    greenCenterLng: decimalToNumber(hole.greenCenterLng),
    greenBackLat: decimalToNumber(hole.greenBackLat),
    greenBackLng: decimalToNumber(hole.greenBackLng),
    mappingStatus: hole.mappingStatus,
    source: hole.source,
    verifiedAt: hole.verifiedAt?.toISOString() ?? null,
    createdAt: hole.createdAt.toISOString(),
    updatedAt: hole.updatedAt.toISOString(),
  };
}

function validateMappedHoleReadyFields(
  hole: Prisma.MappedHoleGetPayload<{ select: ReturnType<typeof mappedHoleSelect> }>,
) {
  return READY_REQUIRED_FIELDS.filter((field) => decimalToNumber(hole[field]) === null);
}

function collectMappedHolePoints(
  hole: Prisma.MappedHoleGetPayload<{ select: ReturnType<typeof mappedHoleSelect> }>,
) {
  const pointPairs = [
    ['teeLat', 'teeLng'],
    ['target1Lat', 'target1Lng'],
    ['target2Lat', 'target2Lng'],
    ['greenFrontLat', 'greenFrontLng'],
    ['greenCenterLat', 'greenCenterLng'],
    ['greenBackLat', 'greenBackLng'],
  ] as const;

  return pointPairs.flatMap(([latKey, lngKey]) => {
    const lat = decimalToNumber(hole[latKey]);
    const lng = decimalToNumber(hole[lngKey]);
    return lat === null || lng === null ? [] : [{ lat, lng }];
  });
}

function calculateBoundsFromPoints(points: Array<{ lat: number; lng: number }>) {
  if (!points.length) return null;

  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latPadding = Math.max((maxLat - minLat) * 0.08, BOUNDS_PADDING_DEGREES);
  const lngPadding = Math.max((maxLng - minLng) * 0.08, BOUNDS_PADDING_DEGREES);

  return {
    boundsNorth: maxLat + latPadding,
    boundsSouth: minLat - latPadding,
    boundsEast: maxLng + lngPadding,
    boundsWest: minLng - lngPadding,
  };
}

async function getExpectedCourseHoleNumbers(courseId: bigint) {
  const tees = await prisma.tee.findMany({
    where: { courseId },
    select: {
      holes: {
        select: { holeNumber: true },
      },
    },
  });

  return Array.from(
    new Set(tees.flatMap((tee) => tee.holes.map((hole) => hole.holeNumber))),
  ).sort((a, b) => a - b);
}

export async function startGpsMappingForCourse(courseIdInput: IdInput) {
  await requireAdmin();

  const courseId = toBigIntId(courseIdInput, 'course id');
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });

  if (!course) {
    throw new Error('Course not found.');
  }

  const mappedCourse = await prisma.mappedCourse.upsert({
    where: { courseId },
    create: {
      courseId,
      mappingStatus: GpsMappingStatus.DRAFT,
      source: GpsMappingSource.MANUAL_ADMIN_GOOGLE,
      minZoom: DEFAULT_MIN_ZOOM,
      maxZoom: DEFAULT_MAX_ZOOM,
    },
    update: {},
    select: mappedCourseSelect(),
  });

  return { mappedCourse: serializeMappedCourse(mappedCourse) };
}

export async function getGpsMappedCourse(courseIdInput: IdInput) {
  await requireAdmin();

  const courseId = toBigIntId(courseIdInput, 'course id');
  const [course, mappedCourse] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        clubName: true,
        courseName: true,
        location: {
          select: {
            city: true,
            state: true,
            country: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        tees: {
          select: {
            id: true,
            teeName: true,
            gender: true,
            numberOfHoles: true,
            totalYards: true,
            parTotal: true,
            holes: {
              select: {
                id: true,
                holeNumber: true,
                par: true,
                yardage: true,
                handicap: true,
              },
              orderBy: { holeNumber: 'asc' },
            },
          },
          orderBy: [{ gender: 'asc' }, { id: 'asc' }],
        },
      },
    }),
    prisma.mappedCourse.findUnique({
      where: { courseId },
      select: {
        ...mappedCourseSelect(),
        holes: {
          select: mappedHoleSelect(),
          orderBy: { holeNumber: 'asc' },
        },
      },
    }),
  ]);

  if (!course) {
    throw new Error('Course not found.');
  }

  return {
    course: {
      id: course.id.toString(),
      clubName: course.clubName,
      courseName: course.courseName,
      location: course.location
        ? {
            city: course.location.city,
            state: course.location.state,
            country: course.location.country,
            address: course.location.address,
            latitude: decimalToNumber(course.location.latitude),
            longitude: decimalToNumber(course.location.longitude),
          }
        : null,
      tees: course.tees.map((tee) => ({
        id: tee.id.toString(),
        teeName: tee.teeName,
        gender: tee.gender,
        numberOfHoles: tee.numberOfHoles,
        totalYards: tee.totalYards,
        parTotal: tee.parTotal,
        holes: tee.holes.map((hole) => ({
          id: hole.id.toString(),
          holeNumber: hole.holeNumber,
          par: hole.par,
          yardage: hole.yardage,
          handicap: hole.handicap,
        })),
      })),
    },
    mappedCourse: mappedCourse
      ? {
          ...serializeMappedCourse(mappedCourse),
          holes: mappedCourse.holes.map(serializeMappedHole),
        }
      : null,
  };
}

export async function getGpsMappedHole(mappedCourseIdInput: IdInput, holeNumber: number) {
  await requireAdmin();

  const mappedCourseId = toBigIntId(mappedCourseIdInput, 'mapped course id');
  const hole = await prisma.mappedHole.findUnique({
    where: {
      mappedCourseId_holeNumber: {
        mappedCourseId,
        holeNumber,
      },
    },
    select: mappedHoleSelect(),
  });

  return { mappedHole: hole ? serializeMappedHole(hole) : null };
}

export async function saveGpsMappedHoleDraft(input: SaveGpsMappedHoleDraftInput) {
  await requireAdmin();

  const mappedCourseId = toBigIntId(input.mappedCourseId, 'mapped course id');
  const mappedCourse = await prisma.mappedCourse.findUnique({
    where: { id: mappedCourseId },
    select: { id: true },
  });

  if (!mappedCourse) {
    throw new Error('Mapped course not found.');
  }

  if (!Number.isInteger(input.holeNumber) || input.holeNumber < 1 || input.holeNumber > 18) {
    throw new Error('Hole number must be between 1 and 18.');
  }

  const draftData = buildMappedHoleDraftData(input);
  const hole = await prisma.mappedHole.upsert({
    where: {
      mappedCourseId_holeNumber: {
        mappedCourseId,
        holeNumber: input.holeNumber,
      },
    },
    create: {
      mappedCourseId,
      holeNumber: input.holeNumber,
      ...draftData,
    },
    update: draftData,
    select: mappedHoleSelect(),
  });

  return { mappedHole: serializeMappedHole(hole) };
}

export async function markGpsMappedHoleReady(mappedHoleIdInput: IdInput) {
  await requireAdmin();

  const mappedHoleId = toBigIntId(mappedHoleIdInput, 'mapped hole id');
  const hole = await prisma.mappedHole.findUnique({
    where: { id: mappedHoleId },
    select: mappedHoleSelect(),
  });

  if (!hole) {
    throw new Error('Mapped hole not found.');
  }

  const missingFields = validateMappedHoleReadyFields(hole);
  if (missingFields.length) {
    return {
      ok: false,
      missingFields,
      mappedHole: serializeMappedHole(hole),
    };
  }

  const updated = await prisma.mappedHole.update({
    where: { id: mappedHoleId },
    data: { mappingStatus: GpsMappingStatus.READY },
    select: mappedHoleSelect(),
  });

  return {
    ok: true,
    missingFields: [],
    mappedHole: serializeMappedHole(updated),
  };
}

export async function markGpsMappedCourseReady(mappedCourseIdInput: IdInput) {
  await requireAdmin();

  const mappedCourseId = toBigIntId(mappedCourseIdInput, 'mapped course id');
  const mappedCourse = await prisma.mappedCourse.findUnique({
    where: { id: mappedCourseId },
    select: {
      ...mappedCourseSelect(),
      holes: {
        select: mappedHoleSelect(),
        orderBy: { holeNumber: 'asc' },
      },
    },
  });

  if (!mappedCourse) {
    throw new Error('Mapped course not found.');
  }

  const expectedHoleNumbers = await getExpectedCourseHoleNumbers(mappedCourse.courseId);
  if (!expectedHoleNumbers.length) {
    return {
      ok: false,
      missingHoles: [],
      notReadyHoles: [],
      message: 'No scorecard holes were found for this course.',
      mappedCourse: serializeMappedCourse(mappedCourse),
    };
  }

  const holeByNumber = new Map(mappedCourse.holes.map((hole) => [hole.holeNumber, hole]));
  const missingHoles = expectedHoleNumbers.filter((holeNumber) => !holeByNumber.has(holeNumber));
  const notReadyHoles = expectedHoleNumbers.filter((holeNumber) => {
    const hole = holeByNumber.get(holeNumber);
    return Boolean(
      hole &&
      hole.mappingStatus !== GpsMappingStatus.READY &&
      hole.mappingStatus !== GpsMappingStatus.VERIFIED
    );
  });

  if (missingHoles.length || notReadyHoles.length) {
    return {
      ok: false,
      missingHoles,
      notReadyHoles,
      message: 'All expected mapped holes must be ready or verified before the course can be ready.',
      mappedCourse: serializeMappedCourse(mappedCourse),
    };
  }

  const updated = await prisma.mappedCourse.update({
    where: { id: mappedCourseId },
    data: { mappingStatus: GpsMappingStatus.READY },
    select: mappedCourseSelect(),
  });

  return {
    ok: true,
    missingHoles: [],
    notReadyHoles: [],
    mappedCourse: serializeMappedCourse(updated),
  };
}

export async function recalculateGpsCourseBounds(mappedCourseIdInput: IdInput) {
  await requireAdmin();

  const mappedCourseId = toBigIntId(mappedCourseIdInput, 'mapped course id');
  const mappedCourse = await prisma.mappedCourse.findUnique({
    where: { id: mappedCourseId },
    select: {
      id: true,
      holes: {
        select: mappedHoleSelect(),
      },
    },
  });

  if (!mappedCourse) {
    throw new Error('Mapped course not found.');
  }

  const points = mappedCourse.holes.flatMap(collectMappedHolePoints);
  const bounds = calculateBoundsFromPoints(points);
  if (!bounds) {
    return {
      ok: false,
      message: 'No mapped hole points are available to calculate bounds.',
      pointCount: 0,
      mappedCourse: null,
    };
  }

  const updated = await prisma.mappedCourse.update({
    where: { id: mappedCourseId },
    data: bounds,
    select: mappedCourseSelect(),
  });

  return {
    ok: true,
    pointCount: points.length,
    mappedCourse: serializeMappedCourse(updated),
  };
}

export async function duplicateGpsFrontNineToBackNine(
  mappedCourseIdInput: IdInput,
  options?: { overwrite?: boolean },
) {
  await requireAdmin();

  const mappedCourseId = toBigIntId(mappedCourseIdInput, 'mapped course id');
  const sourceHoles = await prisma.mappedHole.findMany({
    where: {
      mappedCourseId,
      holeNumber: { gte: 1, lte: 9 },
    },
    select: mappedHoleSelect(),
    orderBy: { holeNumber: 'asc' },
  });

  if (!sourceHoles.length) {
    throw new Error('No front-nine mapped holes found to duplicate.');
  }

  const existingBackNine = await prisma.mappedHole.findMany({
    where: {
      mappedCourseId,
      holeNumber: { gte: 10, lte: 18 },
    },
    select: { holeNumber: true },
  });
  const existingBackNineNumbers = new Set(existingBackNine.map((hole) => hole.holeNumber));
  const created: number[] = [];
  const createdHoles: Prisma.MappedHoleGetPayload<{ select: ReturnType<typeof mappedHoleSelect> }>[] = [];
  const updated: number[] = [];
  const updatedHoles: Prisma.MappedHoleGetPayload<{ select: ReturnType<typeof mappedHoleSelect> }>[] = [];
  const skipped: number[] = [];
  const missingSource: number[] = [];
  const overwrite = options?.overwrite === true;

  for (let sourceHoleNumber = 1; sourceHoleNumber <= 9; sourceHoleNumber++) {
    const destinationHoleNumber = sourceHoleNumber + 9;
    const sourceHole = sourceHoles.find((hole) => hole.holeNumber === sourceHoleNumber);

    if (!sourceHole) {
      missingSource.push(sourceHoleNumber);
      continue;
    }

    const destinationData = {
      teeLat: sourceHole.teeLat,
      teeLng: sourceHole.teeLng,
      target1Lat: sourceHole.target1Lat,
      target1Lng: sourceHole.target1Lng,
      target1Label: sourceHole.target1Label,
      target2Lat: sourceHole.target2Lat,
      target2Lng: sourceHole.target2Lng,
      target2Label: sourceHole.target2Label,
      greenFrontLat: sourceHole.greenFrontLat,
      greenFrontLng: sourceHole.greenFrontLng,
      greenCenterLat: sourceHole.greenCenterLat,
      greenCenterLng: sourceHole.greenCenterLng,
      greenBackLat: sourceHole.greenBackLat,
      greenBackLng: sourceHole.greenBackLng,
      mappingStatus: GpsMappingStatus.DRAFT,
      source: sourceHole.source,
    };

    if (existingBackNineNumbers.has(destinationHoleNumber) && !overwrite) {
      skipped.push(destinationHoleNumber);
      continue;
    }

    if (existingBackNineNumbers.has(destinationHoleNumber)) {
      const updatedHole = await prisma.mappedHole.update({
        where: {
          mappedCourseId_holeNumber: {
            mappedCourseId,
            holeNumber: destinationHoleNumber,
          },
        },
        data: destinationData,
        select: mappedHoleSelect(),
      });
      updated.push(destinationHoleNumber);
      updatedHoles.push(updatedHole);
    } else {
      const createdHole = await prisma.mappedHole.create({
        data: {
          mappedCourseId,
          holeNumber: destinationHoleNumber,
          ...destinationData,
        },
        select: mappedHoleSelect(),
      });
      created.push(destinationHoleNumber);
      createdHoles.push(createdHole);
    }
  }

  return {
    created,
    updated,
    skipped,
    missingSource,
    mappedHoles: [...createdHoles, ...updatedHoles].map(serializeMappedHole),
  };
}
