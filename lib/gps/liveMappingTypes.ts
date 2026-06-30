export type LiveGpsPoint = {
  lat: number;
  lng: number;
};

export type LiveGpsAvailability = {
  courseId: string;
  available: boolean;
  coverage: 'full' | 'partial' | 'none';
  expectedHoleNumbers: number[];
  availableHoleNumbers: number[];
  unavailableHoleNumbers: number[];
  reason: 'available' | 'not_published' | 'incomplete_mapping';
};

export type LiveGpsMappedHole = {
  holeNumber: number;
  tee: LiveGpsPoint;
  green: {
    front: LiveGpsPoint;
    center: LiveGpsPoint;
    back: LiveGpsPoint;
  };
  targets: Array<{
    label: string;
    point: LiveGpsPoint;
  }>;
};

export type LiveGpsMapping = {
  availability: LiveGpsAvailability;
  holes: LiveGpsMappedHole[];
};
