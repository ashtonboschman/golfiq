import {
  ROUND_IDENTITY_V1_VERSION,
  type RoundIdentity,
  type RoundIdentityPrimaryKey,
} from '@/lib/insights/roundIdentity/types';
import {
  extractLatestRoundFocus,
  getRoundIdentityFocusContract,
  mapRoundIdentityPrimaryKeyToFocusCategory,
} from '../latestRoundFocus';

function makeIdentity(overrides: Partial<RoundIdentity> = {}): RoundIdentity {
  return {
    version: ROUND_IDENTITY_V1_VERSION,
    inputHash: 'current-hash',
    primaryKey: 'approach_leak',
    title: 'Approach Leak',
    summary: 'Approach shaped the round.',
    shapedBy: ['Approach'],
    leak: { label: 'Approach', detail: 'Approach cost strokes.' },
    nextRoundFocus: 'Legacy-looking stored focus that must never be read by the adapter.',
    modifiers: [],
    evidenceLevel: 'aggregate_stats',
    confidence: 'strong',
    sampleContext: 'established',
    tone: 'fix',
    overallTone: 'warning',
    entryMode: 'post_round',
    statCompletenessScore: 80,
    ...overrides,
  };
}

function extract(overrides: Partial<Parameters<typeof extractLatestRoundFocus>[0]> = {}) {
  return extractLatestRoundFocus({
    identity: makeIdentity(),
    sourceRoundId: '42',
    isCurrent: true,
    canonicalRecommendation: 'Next round: Make approach the first area to tighten.',
    ...overrides,
  });
}

describe('extractLatestRoundFocus', () => {
  it.each(['moderate', 'strong'] as const)(
    'returns an available candidate for current canonical %s-confidence evidence',
    (confidence) => {
      expect(extract({ identity: makeIdentity({ confidence }) })).toEqual({
      kind: 'available',
      sourceRoundId: '42',
      category: 'approach',
      polarity: 'weakness',
      confidence,
      recommendation: 'Next round: Make approach the first area to tighten.',
      primaryKey: 'approach_leak',
      evidenceLevel: 'aggregate_stats',
      identityTone: 'fix',
      overallTone: 'warning',
      });
    },
  );

  it('rejects an old identity version', () => {
    expect(extract({ identity: makeIdentity({ version: 'round_identity_v1.5.0' }) })).toEqual({
      kind: 'unavailable',
      reason: 'stale_identity',
    });
  });

  it('rejects an identity whose hash was not confirmed current', () => {
    expect(extract({ isCurrent: false })).toEqual({
      kind: 'unavailable',
      reason: 'stale_identity',
    });
  });

  it('rejects a malformed identity with no input hash', () => {
    expect(extract({ identity: makeIdentity({ inputHash: '' }) })).toEqual({
      kind: 'unavailable',
      reason: 'malformed',
    });
  });

  it('rejects a missing identity', () => {
    expect(extract({ identity: null })).toEqual({
      kind: 'unavailable',
      reason: 'missing_identity',
    });
  });

  it('rejects a missing canonical M3 recommendation', () => {
    expect(extract({ canonicalRecommendation: null })).toEqual({
      kind: 'unavailable',
      reason: 'missing_m3',
    });
  });

  it('rejects an empty canonical M3 recommendation as malformed', () => {
    expect(extract({ canonicalRecommendation: '   ' })).toEqual({
      kind: 'unavailable',
      reason: 'malformed',
    });
  });

  it.each([
    ['building', 'building'],
    ['unknown string', 'invalid'],
    ['empty string', ''],
    ['null', null],
    ['missing', undefined],
    ['number', 1],
    ['object', { value: 'strong' }],
    ['array', ['strong']],
  ] as const)('rejects %s confidence at runtime', (_label, confidence) => {
    const identity = makeIdentity() as unknown as Record<string, unknown>;
    if (confidence === undefined) {
      delete identity.confidence;
    } else {
      identity.confidence = confidence;
    }

    expect(extract({ identity: identity as unknown as RoundIdentity })).toEqual({
      kind: 'unavailable',
      reason: 'insufficient_confidence',
    });
    expect(extract({ identity: identity as unknown as RoundIdentity }).kind).not.toBe('available');
  });

  it.each([
    ['penalty_damaged', 'penalties', 'weakness'],
    ['score_only_baseline', 'scoring_control', 'neutral'],
    ['big_number', 'big_numbers', 'weakness'],
    ['volatile_scoring', 'volatility', 'weakness'],
  ] as const)('preserves supported non-trend category %s as %s', (primaryKey, category, polarity) => {
    expect(extract({ identity: makeIdentity({ primaryKey }) })).toMatchObject({
      kind: 'available',
      category,
      polarity,
      primaryKey,
    });
  });

  it.each([
    ['approach_leak', 'approach'],
    ['approach_carried', 'approach'],
    ['putting_leak', 'putting'],
    ['putting_saved', 'putting'],
    ['scoring_chance_missed', 'putting'],
    ['tee_trouble', 'off_the_tee'],
    ['tee_controlled', 'off_the_tee'],
    ['short_game_pressure', 'short_game'],
    ['short_game_rescue', 'short_game'],
  ] as const)('normalizes canonical alias %s to %s', (primaryKey, category) => {
    expect(mapRoundIdentityPrimaryKeyToFocusCategory(primaryKey)).toBe(category);
  });

  it.each([
    ['score_only_baseline', 'scoring_control', 'neutral'],
    ['no_clear_separator', 'scoring_control', 'neutral'],
    ['breakthrough', 'scoring_control', 'strength'],
    ['clean_control', 'scoring_control', 'strength'],
    ['all_around_strong', 'all_around', 'strength'],
    ['approach_carried', 'approach', 'strength'],
    ['tee_controlled', 'off_the_tee', 'strength'],
    ['putting_saved', 'putting', 'strength'],
    ['short_game_rescue', 'short_game', 'strength'],
    ['steady_scoring', 'scoring_control', 'neutral'],
    ['survival', 'scoring_control', 'neutral'],
    ['approach_leak', 'approach', 'weakness'],
    ['tee_trouble', 'off_the_tee', 'weakness'],
    ['penalty_damaged', 'penalties', 'weakness'],
    ['putting_leak', 'putting', 'weakness'],
    ['short_game_pressure', 'short_game', 'weakness'],
    ['scoring_chance_missed', 'putting', 'weakness'],
    ['volatile_scoring', 'volatility', 'weakness'],
    ['big_number', 'big_numbers', 'weakness'],
    ['everything_leaked', 'all_around', 'weakness'],
  ] satisfies Array<[
    RoundIdentityPrimaryKey,
    NonNullable<ReturnType<typeof getRoundIdentityFocusContract>>['category'],
    NonNullable<ReturnType<typeof getRoundIdentityFocusContract>>['polarity'],
  ]>)('defines category and polarity for canonical key %s', (primaryKey, category, polarity) => {
    expect(getRoundIdentityFocusContract(primaryKey)).toEqual({ category, polarity });
  });

  it('does not use identity.nextRoundFocus as a stored fallback', () => {
    expect(extract({ canonicalRecommendation: undefined })).toEqual({
      kind: 'unavailable',
      reason: 'missing_m3',
    });
  });

  it('rejects an unsupported runtime category without forcing a mapping', () => {
    const identity = makeIdentity({ primaryKey: 'mental_game' as RoundIdentity['primaryKey'] });
    expect(extract({ identity })).toEqual({
      kind: 'unavailable',
      reason: 'unsupported_category',
    });
  });

  it('does not mutate identity input', () => {
    const identity = makeIdentity();
    const before = structuredClone(identity);
    extract({ identity });
    expect(identity).toEqual(before);
  });
});
