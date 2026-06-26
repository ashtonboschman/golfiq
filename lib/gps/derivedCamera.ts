import type { LatLng } from '@/lib/gps/types';

export type DerivedGpsCameraInput = {
  tee: LatLng | null;
  target1?: LatLng | null;
  target2?: LatLng | null;
  greenFront: LatLng | null;
  greenCenter: LatLng | null;
  greenBack: LatLng | null;
};

export type DerivedGpsCamera = {
  available: boolean;
  bearing: number | null;
  center: LatLng | null;
  zoom: number | null;
  points: LatLng[];
  pointCount: number;
  reason: string;
};

type DerivedGpsCameraOptions = {
  viewportWidth: number;
  viewportHeight: number;
  minZoom: number;
  maxZoom: number;
  topGuideRatio?: number;
  bottomGuideRatio?: number;
  edgePaddingPx?: number;
};

type WorldPoint = {
  x: number;
  y: number;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

export function normalizeDegrees(value: number) {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}

export function bearingDegrees(from: LatLng, to: LatLng) {
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);

  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function latLngToWorld(point: LatLng): WorldPoint {
  const sinLat = Math.sin(toRadians(point.lat));
  const clampedSinLat = clamp(sinLat, -0.9999, 0.9999);

  return {
    x: ((point.lng + 180) / 360) * 256,
    y:
      (0.5 -
        Math.log((1 + clampedSinLat) / (1 - clampedSinLat)) /
          (4 * Math.PI)) *
      256,
  };
}

function worldToLatLng(point: WorldPoint): LatLng {
  const lng = (point.x / 256) * 360 - 180;
  const mercatorY = 0.5 - point.y / 256;
  const lat = toDegrees(Math.atan(Math.sinh(mercatorY * 2 * Math.PI)));

  return { lat, lng };
}

function rotate(point: WorldPoint, degrees: number): WorldPoint {
  const radians = toRadians(degrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

export function deriveAnchoredGpsCamera(
  input: DerivedGpsCameraInput,
  options: DerivedGpsCameraOptions,
): DerivedGpsCamera {
  const physicalPoints = [
    input.tee,
    input.target1,
    input.target2,
    input.greenFront,
    input.greenCenter,
    input.greenBack,
  ].filter((point): point is LatLng => point != null);

  if (!input.tee || !input.greenCenter) {
    return {
      available: false,
      bearing: null,
      center: null,
      zoom: null,
      points: physicalPoints,
      pointCount: physicalPoints.length,
      reason: 'Tee and green center are required for derived camera.',
    };
  }

  const viewportWidth = Math.max(1, options.viewportWidth);
  const viewportHeight = Math.max(1, options.viewportHeight);
  const topGuideRatio = options.topGuideRatio ?? 0.16;
  const bottomGuideRatio = options.bottomGuideRatio ?? 0.84;
  const edgePaddingPx = options.edgePaddingPx ?? 40;
  const topY = viewportHeight * topGuideRatio;
  const bottomY = viewportHeight * bottomGuideRatio;
  const desiredSpanPx = Math.max(1, bottomY - topY);
  const bearing = bearingDegrees(input.tee, input.greenCenter);
  const teeWorld = latLngToWorld(input.tee);
  const greenWorld = latLngToWorld(input.greenCenter);
  const greenDelta = rotate(
    {
      x: greenWorld.x - teeWorld.x,
      y: greenWorld.y - teeWorld.y,
    },
    -bearing,
  );

  const verticalWorldSpan = Math.abs(greenDelta.y);
  if (!Number.isFinite(verticalWorldSpan) || verticalWorldSpan <= 0) {
    return {
      available: false,
      bearing,
      center: null,
      zoom: null,
      points: physicalPoints,
      pointCount: physicalPoints.length,
      reason: 'Tee and green center are too close to derive a camera.',
    };
  }

  const preferredZoom = Math.log2(desiredSpanPx / verticalWorldSpan);
  const rotatedOffsets = physicalPoints.map((point) => {
    const worldPoint = latLngToWorld(point);
    return rotate(
      {
        x: worldPoint.x - teeWorld.x,
        y: worldPoint.y - teeWorld.y,
      },
      -bearing,
    );
  });
  const maxHorizontalScale = rotatedOffsets.reduce((maxScale, offset) => {
    const horizontalSpan = Math.abs(offset.x);
    if (horizontalSpan <= 0) return maxScale;
    return Math.min(maxScale, Math.max(1, viewportWidth / 2 - edgePaddingPx) / horizontalSpan);
  }, Number.POSITIVE_INFINITY);
  const maxVerticalScale = rotatedOffsets.reduce((maxScale, offset) => {
    if (offset.y < 0) {
      return Math.min(maxScale, Math.max(1, bottomY - edgePaddingPx) / Math.abs(offset.y));
    }

    if (offset.y > 0) {
      return Math.min(maxScale, Math.max(1, viewportHeight - edgePaddingPx - bottomY) / offset.y);
    }

    return maxScale;
  }, Number.POSITIVE_INFINITY);
  const maxFitZoom = Math.log2(Math.min(maxHorizontalScale, maxVerticalScale));
  const zoom = clamp(
    Math.min(preferredZoom, Number.isFinite(maxFitZoom) ? maxFitZoom : preferredZoom),
    options.minZoom,
    options.maxZoom,
  );
  const scale = 2 ** zoom;
  const teeYOffsetFromCenter = bottomY - viewportHeight / 2;
  const centerOffsetFromTee = rotate(
    {
      x: 0,
      y: teeYOffsetFromCenter / scale,
    },
    bearing,
  );
  const center = worldToLatLng({
    x: teeWorld.x - centerOffsetFromTee.x,
    y: teeWorld.y - centerOffsetFromTee.y,
  });

  return {
    available: true,
    bearing,
    center,
    zoom,
    points: physicalPoints,
    pointCount: physicalPoints.length,
    reason: 'Anchored tee near lower guide and green center near upper guide.',
  };
}

export function deriveGpsCamera(input: DerivedGpsCameraInput): DerivedGpsCamera {
  const physicalPoints = [
    input.tee,
    input.target1,
    input.target2,
    input.greenFront,
    input.greenCenter,
    input.greenBack,
  ].filter((point): point is LatLng => point != null);

  if (!input.tee || !input.greenCenter) {
    return {
      available: false,
      bearing: null,
      center: null,
      zoom: null,
      points: physicalPoints,
      pointCount: physicalPoints.length,
      reason: 'Tee and green center are required for derived camera.',
    };
  }

  if (physicalPoints.length < 2) {
    return {
      available: false,
      bearing: null,
      center: null,
      zoom: null,
      points: physicalPoints,
      pointCount: physicalPoints.length,
      reason: 'At least two physical points are required for derived camera.',
    };
  }

  return {
    available: true,
    bearing: bearingDegrees(input.tee, input.greenCenter),
    center: null,
    zoom: null,
    points: physicalPoints,
    pointCount: physicalPoints.length,
    reason: 'Derived from tee, targets, and green points.',
  };
}
