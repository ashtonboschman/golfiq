import { buildMyBagPreset, MY_BAG_PROFILES } from '@/lib/clubs/presets';

const SEVEN_IRON_TEST_INDEX = 6;

describe('My Bag presets', () => {
  it.each(MY_BAG_PROFILES)('builds a complete descending $label bag', (profile) => {
    const clubs = buildMyBagPreset(profile.sevenIronCarry);

    expect(clubs).toHaveLength(13);
    expect(new Set(clubs.map((club) => club.definitionKey)).size).toBe(13);
    expect(clubs.find((club) => club.definitionKey === 'IRON_7')?.carryYards)
      .toBe(profile.sevenIronCarry);
    expect(clubs.map((club) => club.carryYards)).toEqual(
      [...clubs].map((club) => club.carryYards).sort((a, b) => b - a),
    );
  });

  it('uses useful carry gaps for the short-hitter profile', () => {
    expect(buildMyBagPreset(120).map((club) => club.carryYards)).toEqual([
      190, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60,
    ]);
  });

  it('preserves the medium- and long-hitter carry profiles', () => {
    expect(buildMyBagPreset(150).map((club) => club.carryYards)).toEqual([
      235, 215, 200, 185, 170, 160, 150, 140, 130, 120, 105, 95, 85,
    ]);
    expect(buildMyBagPreset(175).map((club) => club.carryYards)).toEqual([
      275, 250, 235, 215, 200, 185, 175, 165, 150, 140, 125, 110, 95,
    ]);
  });

  it('interpolates custom carries smoothly between the reviewed profiles', () => {
    expect(buildMyBagPreset(145).map((club) => club.carryYards)).toEqual([
      230, 210, 195, 180, 165, 155, 145, 135, 125, 115, 100, 90, 80,
    ]);
  });

  it('keeps every allowed custom bag valid and strictly descending', () => {
    for (let sevenIronCarry = 60; sevenIronCarry <= 250; sevenIronCarry += 1) {
      const carries = buildMyBagPreset(sevenIronCarry).map((club) => club.carryYards);

      expect(carries[SEVEN_IRON_TEST_INDEX]).toBe(sevenIronCarry);
      expect(carries.every((carry) => Number.isInteger(carry) && carry >= 1 && carry <= 399)).toBe(true);
      expect(carries.every((carry, index) => index === 0 || carries[index - 1] > carry)).toBe(true);
    }
  });

  it.each([119, 120, 121, 149, 150, 151, 174, 175, 176])(
    'does not jump unexpectedly around the %d-yard profile boundary',
    (sevenIronCarry) => {
      const previous = buildMyBagPreset(sevenIronCarry - 1).map((club) => club.carryYards);
      const current = buildMyBagPreset(sevenIronCarry).map((club) => club.carryYards);

      expect(current.every((carry, index) => Math.abs(carry - previous[index]) <= 5)).toBe(true);
    },
  );

  it('rejects an implausible custom 7-Iron carry', () => {
    expect(() => buildMyBagPreset(59)).toThrow('Invalid 7-Iron carry distance.');
    expect(() => buildMyBagPreset(251)).toThrow('Invalid 7-Iron carry distance.');
  });
});
