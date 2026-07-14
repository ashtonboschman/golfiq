export type ClubSuggestionClub = {
  clubDefinitionId: string;
  shortLabel: string;
  carryYards: number;
  catalogueOrder: number;
};

export type ClubSuggestionInput = {
  targetYards: number;
  clubs: ClubSuggestionClub[];
};

export type ClubSuggestion = ClubSuggestionClub & {
  differenceYards: number;
};

function isValidTarget(targetYards: number) {
  return Number.isFinite(targetYards) && Number.isInteger(targetYards) && targetYards >= 0;
}

function toSuggestion(club: ClubSuggestionClub, targetYards: number): ClubSuggestion {
  return {
    ...club,
    differenceYards: Math.abs(club.carryYards - targetYards),
  };
}

function compareSuggestions(a: ClubSuggestion, b: ClubSuggestion) {
  return (
    a.differenceYards - b.differenceYards ||
    b.carryYards - a.carryYards ||
    a.catalogueOrder - b.catalogueOrder
  );
}

export function resolveClubSuggestion(input: ClubSuggestionInput): ClubSuggestion | null {
  if (!isValidTarget(input.targetYards) || input.clubs.length === 0) return null;

  return input.clubs
    .map((club) => toSuggestion(club, input.targetYards))
    .sort(compareSuggestions)[0] ?? null;
}
