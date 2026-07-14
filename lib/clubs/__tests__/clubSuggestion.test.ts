import {
  resolveClubSuggestion,
  type ClubSuggestionClub,
} from '@/lib/clubs/clubSuggestion';

const clubs: ClubSuggestionClub[] = [
  { clubDefinitionId: 'driver', shortLabel: 'DR', carryYards: 250, catalogueOrder: 10 },
  { clubDefinitionId: 'iron-7', shortLabel: '7I', carryYards: 160, catalogueOrder: 280 },
  { clubDefinitionId: 'iron-8', shortLabel: '8I', carryYards: 150, catalogueOrder: 290 },
  { clubDefinitionId: 'iron-9', shortLabel: '9I', carryYards: 140, catalogueOrder: 300 },
];

describe('club suggestions', () => {
  it('returns null without a usable target or bag', () => {
    expect(resolveClubSuggestion({ targetYards: Number.NaN, clubs })).toBeNull();
    expect(resolveClubSuggestion({ targetYards: 150.5, clubs })).toBeNull();
    expect(resolveClubSuggestion({ targetYards: 150, clubs: [] })).toBeNull();
  });

  it('chooses the closest carry distance', () => {
    expect(resolveClubSuggestion({ targetYards: 158, clubs })?.shortLabel).toBe('7I');
    expect(resolveClubSuggestion({ targetYards: 145, clubs })?.shortLabel).toBe('8I');
    expect(resolveClubSuggestion({ targetYards: 245, clubs })?.shortLabel).toBe('DR');
  });

  it('breaks equal-distance ties toward the longer club', () => {
    const suggestion = resolveClubSuggestion({ targetYards: 155, clubs });

    expect(suggestion).toMatchObject({
      clubDefinitionId: 'iron-7',
      shortLabel: '7I',
      carryYards: 160,
      differenceYards: 5,
    });
  });

  it('switches deterministically at adjacent whole-yard boundaries', () => {
    const boundaryClubs: ClubSuggestionClub[] = [
      { clubDefinitionId: 'iron-8', shortLabel: '8I', carryYards: 170, catalogueOrder: 290 },
      { clubDefinitionId: 'iron-9', shortLabel: '9I', carryYards: 160, catalogueOrder: 300 },
    ];

    expect(resolveClubSuggestion({ targetYards: 164, clubs: boundaryClubs })?.shortLabel).toBe('9I');
    expect(resolveClubSuggestion({ targetYards: 165, clubs: boundaryClubs })?.shortLabel).toBe('8I');
  });
});
