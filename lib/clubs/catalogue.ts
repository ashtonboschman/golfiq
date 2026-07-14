export const MY_BAG_MAX_CLUBS = 13;
export const MIN_CARRY_YARDS = 1;
export const MAX_CARRY_YARDS = 399;

export const CLUB_CATEGORY_LABELS = {
  WOOD: 'Woods',
  HYBRID: 'Hybrids',
  UTILITY_IRON: 'Utility Irons',
  IRON: 'Irons',
  NAMED_WEDGE: 'Named Wedges',
  LOFTED_WEDGE: 'Lofted Wedges',
} as const;

export type ClubCategoryKey = keyof typeof CLUB_CATEGORY_LABELS;

export type ClubCatalogueSeed = {
  key: string;
  name: string;
  shortLabel: string;
  category: ClubCategoryKey;
  catalogueOrder: number;
};

const woodDefinitions: ClubCatalogueSeed[] = [
  { key: 'DRIVER', name: 'Driver', shortLabel: 'DR', category: 'WOOD', catalogueOrder: 10 },
  { key: 'MINI_DRIVER', name: 'Mini Driver', shortLabel: 'MD', category: 'WOOD', catalogueOrder: 20 },
  { key: 'WOOD_2', name: '2 Wood', shortLabel: '2W', category: 'WOOD', catalogueOrder: 30 },
  { key: 'WOOD_3', name: '3 Wood', shortLabel: '3W', category: 'WOOD', catalogueOrder: 40 },
  { key: 'WOOD_4', name: '4 Wood', shortLabel: '4W', category: 'WOOD', catalogueOrder: 50 },
  { key: 'WOOD_5', name: '5 Wood', shortLabel: '5W', category: 'WOOD', catalogueOrder: 60 },
  { key: 'WOOD_7', name: '7 Wood', shortLabel: '7W', category: 'WOOD', catalogueOrder: 70 },
  { key: 'WOOD_9', name: '9 Wood', shortLabel: '9W', category: 'WOOD', catalogueOrder: 80 },
  { key: 'WOOD_11', name: '11 Wood', shortLabel: '11W', category: 'WOOD', catalogueOrder: 90 },
];

const rangeDefinitions = (
  start: number,
  end: number,
  build: (value: number, index: number) => ClubCatalogueSeed,
) => Array.from({ length: end - start + 1 }, (_, index) => build(start + index, index));

export const CLUB_CATALOGUE: ClubCatalogueSeed[] = [
  ...woodDefinitions,
  ...rangeDefinitions(2, 8, (number, index) => ({
    key: `HYBRID_${number}`,
    name: `${number} Hybrid`,
    shortLabel: `${number}H`,
    category: 'HYBRID',
    catalogueOrder: 100 + index * 10,
  })),
  ...rangeDefinitions(2, 6, (number, index) => ({
    key: `UTILITY_${number}`,
    name: `${number} Utility`,
    shortLabel: `${number}U`,
    category: 'UTILITY_IRON',
    catalogueOrder: 170 + index * 10,
  })),
  ...rangeDefinitions(1, 9, (number, index) => ({
    key: `IRON_${number}`,
    name: `${number} Iron`,
    shortLabel: `${number}I`,
    category: 'IRON',
    catalogueOrder: 220 + index * 10,
  })),
  { key: 'PITCHING_WEDGE', name: 'Pitching Wedge', shortLabel: 'PW', category: 'NAMED_WEDGE', catalogueOrder: 310 },
  { key: 'APPROACH_WEDGE', name: 'Approach Wedge', shortLabel: 'AW', category: 'NAMED_WEDGE', catalogueOrder: 320 },
  { key: 'GAP_WEDGE', name: 'Gap Wedge', shortLabel: 'GW', category: 'NAMED_WEDGE', catalogueOrder: 330 },
  { key: 'SAND_WEDGE', name: 'Sand Wedge', shortLabel: 'SW', category: 'NAMED_WEDGE', catalogueOrder: 340 },
  { key: 'LOB_WEDGE', name: 'Lob Wedge', shortLabel: 'LW', category: 'NAMED_WEDGE', catalogueOrder: 350 },
  ...rangeDefinitions(44, 65, (loft, index) => ({
    key: `WEDGE_${loft}`,
    name: `${loft}° Wedge`,
    shortLabel: `${loft}°`,
    category: 'LOFTED_WEDGE',
    catalogueOrder: 360 + index * 10,
  })),
];

export function sortUserClubsByCarry<T extends { carryYards: number; clubDefinition: { catalogueOrder: number } }>(clubs: T[]) {
  return [...clubs].sort((a, b) => (
    b.carryYards - a.carryYards ||
    a.clubDefinition.catalogueOrder - b.clubDefinition.catalogueOrder
  ));
}
