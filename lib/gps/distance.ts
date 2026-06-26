import type { LatLng } from '@/lib/gps/types';

const EARTH_RADIUS_METERS = 6371008.8;
const METERS_TO_YARDS = 1.0936132983;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(from: LatLng, to: LatLng): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

export function metersToYards(meters: number): number {
  return meters * METERS_TO_YARDS;
}

export function distanceYards(from: LatLng, to: LatLng): number {
  return metersToYards(distanceMeters(from, to));
}

export function formatYards(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value)} yd`;
}
