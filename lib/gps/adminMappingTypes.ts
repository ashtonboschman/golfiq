export type GpsMappingStatusValue = 'DRAFT' | 'READY' | 'VERIFIED' | 'DISABLED';
export type GpsMappingSourceValue =
  | 'MANUAL_ADMIN_GOOGLE'
  | 'ON_COURSE_VERIFIED'
  | 'IMPORTED'
  | 'UNKNOWN';

export type SerializedMappedCourse = {
  id: string;
  courseId: string;
  boundsNorth: number | null;
  boundsSouth: number | null;
  boundsEast: number | null;
  boundsWest: number | null;
  minZoom: number | null;
  maxZoom: number | null;
  mappingStatus: GpsMappingStatusValue;
  source: GpsMappingSourceValue;
  createdAt: string;
  updatedAt: string;
};

export type SerializedMappedHole = {
  id: string;
  mappedCourseId: string;
  holeNumber: number;
  teeLat: number | null;
  teeLng: number | null;
  target1Lat: number | null;
  target1Lng: number | null;
  target1Label: string | null;
  target2Lat: number | null;
  target2Lng: number | null;
  target2Label: string | null;
  greenFrontLat: number | null;
  greenFrontLng: number | null;
  greenCenterLat: number | null;
  greenCenterLng: number | null;
  greenBackLat: number | null;
  greenBackLng: number | null;
  mappingStatus: GpsMappingStatusValue;
  source: GpsMappingSourceValue;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GpsScorecardHole = {
  holeNumber: number;
  par: number | null;
  yardage: number | null;
  handicap: number | null;
};

export type GpsMappedCourseSummary = SerializedMappedCourse & {
  holes: SerializedMappedHole[];
};

export type GpsCourseMappingCourse = {
  id: string;
  clubName: string;
  courseName: string;
  location: {
    city: string | null;
    state: string | null;
    country: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  tees: Array<{
    id: string;
    teeName: string;
    gender: string;
    numberOfHoles: number | null;
    totalYards: number | null;
    parTotal: number | null;
    holes: Array<{
      id: string;
      holeNumber: number;
      par: number;
      yardage: number | null;
      handicap: number | null;
    }>;
  }>;
};

export type GpsMappedCoursePayload = {
  course: GpsCourseMappingCourse;
  mappedCourse: GpsMappedCourseSummary | null;
};

export type GpsMappingEditField =
  | 'tee'
  | 'target1'
  | 'target2'
  | 'greenFront'
  | 'greenCenter'
  | 'greenBack';

export type GpsMappedHoleDraft = {
  id: string | null;
  mappedCourseId: string;
  holeNumber: number;
  teeLat: number | null;
  teeLng: number | null;
  target1Lat: number | null;
  target1Lng: number | null;
  target1Label: string | null;
  target2Lat: number | null;
  target2Lng: number | null;
  target2Label: string | null;
  greenFrontLat: number | null;
  greenFrontLng: number | null;
  greenCenterLat: number | null;
  greenCenterLng: number | null;
  greenBackLat: number | null;
  greenBackLng: number | null;
  mappingStatus: GpsMappingStatusValue;
  source: GpsMappingSourceValue;
  verifiedAt: string | null;
};

export type SaveGpsMappedHoleDraftPayload = {
  mappedCourseId: string;
  holeNumber: number;
  teeLat: number | null;
  teeLng: number | null;
  target1Lat: number | null;
  target1Lng: number | null;
  target1Label: string | null;
  target2Lat: number | null;
  target2Lng: number | null;
  target2Label: string | null;
  greenFrontLat: number | null;
  greenFrontLng: number | null;
  greenCenterLat: number | null;
  greenCenterLng: number | null;
  greenBackLat: number | null;
  greenBackLng: number | null;
};
