import { CLUB_CATALOGUE, MY_BAG_MAX_CLUBS } from '@/lib/clubs/catalogue';

describe('club catalogue', () => {
  it('matches the My Bag V1 limit and catalogue size', () => {
    expect(MY_BAG_MAX_CLUBS).toBe(13);
    expect(CLUB_CATALOGUE).toHaveLength(57);
  });

  it('uses unique stable uppercase keys without putter-like entries', () => {
    const keys = CLUB_CATALOGUE.map((club) => club.key);
    const names = CLUB_CATALOGUE.map((club) => club.name.toLowerCase());

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => /^[A-Z0-9_]+$/.test(key))).toBe(true);
    expect(names.some((name) => name.includes('putter'))).toBe(false);
    expect(names.some((name) => name.includes('chipper'))).toBe(false);
  });

  it('includes only the supported wood, hybrid, utility, iron, and wedge definitions', () => {
    expect(CLUB_CATALOGUE.filter((club) => club.category === 'WOOD').map((club) => club.key)).toEqual([
      'DRIVER',
      'MINI_DRIVER',
      'WOOD_2',
      'WOOD_3',
      'WOOD_4',
      'WOOD_5',
      'WOOD_7',
      'WOOD_9',
      'WOOD_11',
    ]);
    expect(CLUB_CATALOGUE.filter((club) => club.category === 'HYBRID').map((club) => club.key)).toEqual(
      ['HYBRID_2', 'HYBRID_3', 'HYBRID_4', 'HYBRID_5', 'HYBRID_6', 'HYBRID_7', 'HYBRID_8'],
    );
    expect(CLUB_CATALOGUE.filter((club) => club.category === 'UTILITY_IRON').map((club) => club.key)).toEqual(
      ['UTILITY_2', 'UTILITY_3', 'UTILITY_4', 'UTILITY_5', 'UTILITY_6'],
    );
    expect(CLUB_CATALOGUE.filter((club) => club.category === 'IRON').map((club) => club.key)).toEqual(
      ['IRON_1', 'IRON_2', 'IRON_3', 'IRON_4', 'IRON_5', 'IRON_6', 'IRON_7', 'IRON_8', 'IRON_9'],
    );
    expect(CLUB_CATALOGUE.filter((club) => club.category === 'NAMED_WEDGE').map((club) => club.shortLabel)).toEqual(
      ['PW', 'AW', 'GW', 'SW', 'LW'],
    );
  });

  it('includes every lofted wedge from 44 to 65 degrees', () => {
    const degree = String.fromCharCode(176);
    const wedges = CLUB_CATALOGUE.filter((club) => club.category === 'LOFTED_WEDGE');

    expect(wedges.map((club) => club.key)).toEqual(
      Array.from({ length: 22 }, (_, index) => `WEDGE_${44 + index}`),
    );
    expect(wedges.map((club) => club.shortLabel)).toEqual(
      Array.from({ length: 22 }, (_, index) => `${44 + index}${degree}`),
    );
  });
});
