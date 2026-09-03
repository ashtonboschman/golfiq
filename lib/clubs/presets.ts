export const MIN_PRESET_SEVEN_IRON_YARDS = 60;
export const MAX_PRESET_SEVEN_IRON_YARDS = 250;

export const MY_BAG_PROFILES = [
  { key: 'short', label: 'Short', sevenIronCarry: 120 },
  { key: 'medium', label: 'Medium', sevenIronCarry: 150 },
  { key: 'long', label: 'Long', sevenIronCarry: 175 },
] as const;

export type MyBagProfileKey = (typeof MY_BAG_PROFILES)[number]['key'] | 'custom';

const PRESET_CLUBS = [
  { definitionKey: 'DRIVER', label: 'Driver', shortLabel: 'DR' },
  { definitionKey: 'WOOD_3', label: '3 Wood', shortLabel: '3W' },
  { definitionKey: 'WOOD_5', label: '5 Wood', shortLabel: '5W' },
  { definitionKey: 'HYBRID_4', label: '4 Hybrid', shortLabel: '4H' },
  { definitionKey: 'IRON_5', label: '5 Iron', shortLabel: '5I' },
  { definitionKey: 'IRON_6', label: '6 Iron', shortLabel: '6I' },
  { definitionKey: 'IRON_7', label: '7 Iron', shortLabel: '7I' },
  { definitionKey: 'IRON_8', label: '8 Iron', shortLabel: '8I' },
  { definitionKey: 'IRON_9', label: '9 Iron', shortLabel: '9I' },
  { definitionKey: 'PITCHING_WEDGE', label: 'Pitching Wedge', shortLabel: 'PW' },
  { definitionKey: 'GAP_WEDGE', label: 'Gap Wedge', shortLabel: 'GW' },
  { definitionKey: 'SAND_WEDGE', label: 'Sand Wedge', shortLabel: 'SW' },
  { definitionKey: 'LOB_WEDGE', label: 'Lob Wedge', shortLabel: 'LW' },
] as const;

const SHORT_PROFILE_CARRY_YARDS = [190, 170, 160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60] as const;
const MEDIUM_PROFILE_CARRY_YARDS = [235, 215, 200, 185, 170, 160, 150, 140, 130, 120, 105, 95, 85] as const;
const LONG_PROFILE_CARRY_YARDS = [275, 250, 235, 215, 200, 185, 175, 165, 150, 140, 125, 110, 95] as const;

const SEVEN_IRON_INDEX = PRESET_CLUBS.findIndex((club) => club.definitionKey === 'IRON_7');

function roundToNearestFive(value: number) {
  return Math.round(value / 5) * 5;
}

function scaleCarryYards(reference: readonly number[], referenceSevenIronCarry: number, sevenIronCarry: number) {
  const scale = sevenIronCarry / referenceSevenIronCarry;
  return reference.map((carry, index) => (
    index === SEVEN_IRON_INDEX ? sevenIronCarry : roundToNearestFive(carry * scale)
  ));
}

function interpolateCarryYards(
  lower: readonly number[],
  lowerSevenIronCarry: number,
  upper: readonly number[],
  upperSevenIronCarry: number,
  sevenIronCarry: number,
) {
  const progress = (sevenIronCarry - lowerSevenIronCarry) / (upperSevenIronCarry - lowerSevenIronCarry);
  return lower.map((carry, index) => (
    index === SEVEN_IRON_INDEX
      ? sevenIronCarry
      : roundToNearestFive(carry + ((upper[index] - carry) * progress))
  ));
}

function buildCarryYards(sevenIronCarry: number) {
  if (sevenIronCarry < 120) {
    return scaleCarryYards(SHORT_PROFILE_CARRY_YARDS, 120, sevenIronCarry);
  }
  if (sevenIronCarry <= 150) {
    return interpolateCarryYards(
      SHORT_PROFILE_CARRY_YARDS,
      120,
      MEDIUM_PROFILE_CARRY_YARDS,
      150,
      sevenIronCarry,
    );
  }
  if (sevenIronCarry <= 175) {
    return interpolateCarryYards(
      MEDIUM_PROFILE_CARRY_YARDS,
      150,
      LONG_PROFILE_CARRY_YARDS,
      175,
      sevenIronCarry,
    );
  }
  return scaleCarryYards(LONG_PROFILE_CARRY_YARDS, 175, sevenIronCarry);
}

export function isValidPresetSevenIronCarry(value: number) {
  return Number.isInteger(value)
    && value >= MIN_PRESET_SEVEN_IRON_YARDS
    && value <= MAX_PRESET_SEVEN_IRON_YARDS;
}

export function buildMyBagPreset(sevenIronCarry: number) {
  if (!isValidPresetSevenIronCarry(sevenIronCarry)) {
    throw new Error('Invalid 7-Iron carry distance.');
  }

  const carryYards = buildCarryYards(sevenIronCarry);

  return PRESET_CLUBS.map((club, index) => ({
    ...club,
    carryYards: carryYards[index],
  }));
}
