export type LatLng = {
  lat: number;
  lng: number;
};

export type GpsHolePrototypeConfig = {
  courseName: string;
  holeNumber: number;
  par: number;
  scorecardYardage: number | null;
  tee: LatLng;
  greenFront: LatLng;
  greenCenter: LatLng;
  greenBack: LatLng;
  defaultTarget: LatLng;
  recommendedTargets?: Array<{
    label: string;
    point: LatLng;
  }>;
  mapCenter: LatLng;
  mapZoom: number;
  mapBearing?: number;
  mapTilt?: number;
};

export type GpsPrototypeEditField =
  | 'tee'
  | 'greenFront'
  | 'greenCenter'
  | 'greenBack'
  | 'recommendedTarget1'
  | 'recommendedTarget2'
  | 'mapCenter';

export type CurrentLocationState = {
  status: 'idle' | 'watching' | 'granted' | 'stale' | 'denied' | 'unavailable' | 'error';
  position: LatLng | null;
  accuracyMeters: number | null;
  timestamp?: number | null;
  message: string | null;
};

export type AcceptedGpsFix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: number;
};
