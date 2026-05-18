type NullableNumber = number | null | undefined;

export type ShortGameRoundInput = {
  shortGameShots: NullableNumber;
};

export type ShortGameHoleInput = {
  par: NullableNumber;
  score: NullableNumber;
  girHit: NullableNumber;
  putts: NullableNumber;
  chips: NullableNumber;
  greensideBunkerShots: NullableNumber;
};

export type ShortGameRate = {
  opportunities: number;
  successes: number;
  percentage: number | null;
};

export type DerivedShortGameMetrics = {
  shortGameShotsAverage: number | null;
  scrambling: ShortGameRate;
  upAndDown: ShortGameRate;
  sandSave: ShortGameRate;
};

function isFiniteNumber(value: NullableNumber): value is number {
  return value != null && Number.isFinite(value);
}

function toRate(successes: number, opportunities: number): ShortGameRate {
  if (opportunities <= 0) {
    return { opportunities: 0, successes: 0, percentage: null };
  }
  return {
    opportunities,
    successes,
    percentage: Number(((successes / opportunities) * 100).toFixed(2)),
  };
}

function deriveShortGameShots(chips: NullableNumber, greensideBunkerShots: NullableNumber): number | null {
  if (chips == null && greensideBunkerShots == null) return null;
  return (chips ?? 0) + (greensideBunkerShots ?? 0);
}

export function deriveShortGameMetrics(input: {
  rounds: ShortGameRoundInput[];
  holes: ShortGameHoleInput[];
}): DerivedShortGameMetrics {
  const trackedRounds = input.rounds.filter((round) => isFiniteNumber(round.shortGameShots));
  const shortGameShotsAverage = trackedRounds.length
    ? Number(
        (
          trackedRounds.reduce((sum, round) => sum + Number(round.shortGameShots), 0) /
          trackedRounds.length
        ).toFixed(2),
      )
    : null;

  let scramblingOpportunities = 0;
  let scramblingSuccesses = 0;
  let upAndDownOpportunities = 0;
  let upAndDownSuccesses = 0;
  let sandSaveOpportunities = 0;
  let sandSaveSuccesses = 0;

  for (const hole of input.holes) {
    const par = isFiniteNumber(hole.par) ? Number(hole.par) : null;
    const score = isFiniteNumber(hole.score) ? Number(hole.score) : null;
    const girHit = isFiniteNumber(hole.girHit) ? Number(hole.girHit) : null;
    const putts = isFiniteNumber(hole.putts) ? Number(hole.putts) : null;
    const chips = isFiniteNumber(hole.chips) ? Number(hole.chips) : null;
    const bunker = isFiniteNumber(hole.greensideBunkerShots) ? Number(hole.greensideBunkerShots) : null;

    const isGirMiss = girHit === 0;
    const hasParAndScore = par != null && score != null;

    if (isGirMiss && hasParAndScore) {
      scramblingOpportunities += 1;
      if (score <= par) scramblingSuccesses += 1;
    }

    const shortGameTracked = chips != null || bunker != null;
    const shortGameShots = deriveShortGameShots(chips, bunker);

    if (isGirMiss && putts != null && shortGameTracked && shortGameShots != null && hasParAndScore) {
      upAndDownOpportunities += 1;
      if (shortGameShots === 1 && putts <= 1 && score <= par) {
        upAndDownSuccesses += 1;
      }
    }

    if (bunker != null && bunker > 0 && hasParAndScore) {
      sandSaveOpportunities += 1;
      if (score <= par) sandSaveSuccesses += 1;
    }
  }

  return {
    shortGameShotsAverage,
    scrambling: toRate(scramblingSuccesses, scramblingOpportunities),
    upAndDown: toRate(upAndDownSuccesses, upAndDownOpportunities),
    sandSave: toRate(sandSaveSuccesses, sandSaveOpportunities),
  };
}
