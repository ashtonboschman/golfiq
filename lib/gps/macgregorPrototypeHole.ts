import type { GpsHolePrototypeConfig } from '@/lib/gps/types';

export const MACGREGOR_PROTOTYPE_HOLE: GpsHolePrototypeConfig = {
  courseName: 'MacGregor Golf Course',
  holeNumber: 1,
    par: 4,
    scorecardYardage: null,
    tee: { lat: 49.9729071, lng: -98.7679781 },
    greenFront: { lat: 49.97072407115416, lng: -98.77004108427134 },
    greenCenter: { lat: 49.970541003225335, lng: -98.7699386518102 },
    greenBack: { lat: 49.97037142511407, lng: -98.76980460982915 },
    defaultTarget: { lat: 49.972007, lng: -98.7697405 },
    recommendedTargets: [
      {
        label: 'Position Target 1',
        point: { lat: 49.972007, lng: -98.7697405 },
      },
    ],
    mapCenter: { lat: 49.9717437326, lng: -98.7689454418 },
    mapZoom: 17.16,
    mapBearing: 208,
    mapTilt: 0.3,
};


export const MACGREGOR_PROTOTYPE_HOLES: GpsHolePrototypeConfig[] = [
  MACGREGOR_PROTOTYPE_HOLE,
  {
    ...MACGREGOR_PROTOTYPE_HOLE,
    holeNumber: 2,
    par: 3,
    scorecardYardage: null,
    tee: { lat: 49.97010107017745, lng: -98.76978553135959 },
    greenFront: { lat: 49.97038807309246, lng: -98.7711469317819 },
    greenCenter: { lat: 49.97042331488963, lng: -98.77130859976063 },
    greenBack: { lat: 49.97045711918021, lng: -98.77147322020876 },
    defaultTarget: { lat: 49.97042331488963, lng: -98.77130859976063 },
    recommendedTargets: [],
    mapCenter: { lat: 49.9702790039, lng: -98.7706223974 },
    mapZoom: 18.44,
    mapBearing: 288.2,
    mapTilt: 0,
  },
  {
    ...MACGREGOR_PROTOTYPE_HOLE,
  holeNumber: 3,
    par: 4,
    scorecardYardage: null,
    tee: { lat: 49.97031293415892, lng: -98.77181376621725 },
    greenFront: { lat: 49.97225681647094, lng: -98.77038209104636 },
    greenCenter: { lat: 49.97234843717169, lng: -98.77031812305277 },
    greenBack: { lat: 49.97244084458044, lng: -98.77025133302493 },
    defaultTarget: { lat: 49.97168129849679, lng: -98.77078894309538 },
    recommendedTargets: [
      {
        label: 'Position Target 1',
        point: { lat: 49.97168129849679, lng: -98.77078894309538 },
      },
    ],
    mapCenter: { lat: 49.9713544362, lng: -98.7710486541 },
    mapZoom: 17.47,
    mapBearing: 25.2,
    mapTilt: 0,
  },
];
