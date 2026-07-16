import { resolveRoundIdentity } from '@/lib/insights/roundIdentity/resolve';
import type { RoundIdentityResolverInput } from '@/lib/insights/roundIdentity/types';

const PAR18 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 3, 4, 5, 4, 5];

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function holesFromToPar(toPar: number[]): NonNullable<RoundIdentityResolverInput['roundHoles']> {
  return toPar.map((diff, index) => ({
    holeNumber: index + 1,
    par: PAR18[index] ?? 4,
    score: (PAR18[index] ?? 4) + diff,
    pass: 1,
    firHit: null,
    girHit: null,
    putts: null,
    penalties: null,
    chips: null,
    greensideBunkerShots: null,
    firDirection: null,
    girDirection: null,
  }));
}

function baseInput(overrides: Partial<RoundIdentityResolverInput> = {}): RoundIdentityResolverInput {
  return {
    roundId: '123',
    score: 86,
    parTotal: 72,
    toPar: 14,
    holesPlayed: 18,
    teeSegment: 'full',
    roundContext: 'real',
    roundsLifetime: 6,
    avgScoreRecent: 86,
    handicapAtRound: 14.1,
    firHit: null,
    girHit: null,
    putts: null,
    penalties: null,
    chips: null,
    greensideBunkerShots: null,
    shortGameShots: null,
    sgTotal: null,
    sgOffTee: null,
    sgApproach: null,
    sgShortGame: null,
    sgPutting: null,
    sgPenalties: null,
    sgResidual: null,
    sgPartialAnalysis: null,
    entryMode: 'post_round',
    roundHoles: [],
    hasTrustedHoleByHole: false,
    ...overrides,
  };
}

describe('resolveRoundIdentity', () => {
  it('marks a volatile round at the positive-total-SG boundary as an overall success', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 77,
        toPar: 7,
        avgScoreRecent: 82.6,
        sgTotal: 0.5,
        roundHoles: holesFromToPar([0, 0, 2, 0, -1, 0, 0, 0, 0, 0, 0, 2, 0, 0, -1, 0, 0, 0]),
        hasTrustedHoleByHole: true,
      }),
    );

    expect(identity.primaryKey).toBe('volatile_scoring');
    expect(identity.overallTone).toBe('success');
  });

  it('keeps exceptional total SG at great instead of letting the success boundary override it', () => {
    const exceptional = resolveRoundIdentity(baseInput({ sgTotal: 5 }));
    const strongButNotExceptional = resolveRoundIdentity(baseInput({ sgTotal: 4.99 }));
    const exceptionalNine = resolveRoundIdentity(
      baseInput({
        holesPlayed: 9,
        teeSegment: 'front_9',
        score: 43,
        parTotal: 36,
        toPar: 7,
        sgTotal: 2.5,
      }),
    );

    expect(exceptional.overallTone).toBe('great');
    expect(exceptional.displayLevels?.story).toBe('great');
    expect(strongButNotExceptional.overallTone).toBe('success');
    expect(strongButNotExceptional.displayLevels?.story).toBe('success');
    expect(exceptionalNine.overallTone).toBe('great');
    expect(exceptionalNine.displayLevels?.story).toBe('great');
  });

  it('uses an informational overall tone for effectively neutral total SG', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 77,
        toPar: 7,
        avgScoreRecent: 82.6,
        sgTotal: 0.49,
        roundHoles: holesFromToPar([0, 0, 2, 0, -1, 0, 0, 0, 0, 0, 0, 2, 0, 0, -1, 0, 0, 0]),
        hasTrustedHoleByHole: true,
      }),
    );

    expect(identity.primaryKey).toBe('volatile_scoring');
    expect(identity.overallTone).toBe('info');
  });

  it('uses score context for overall tone when SG is unavailable', () => {
    const better = resolveRoundIdentity(baseInput({ sgTotal: null, score: 82, avgScoreRecent: 85 }));
    const worse = resolveRoundIdentity(baseInput({ sgTotal: null, score: 88, avgScoreRecent: 85 }));

    expect(better.overallTone).toBe('success');
    expect(worse.overallTone).toBe('warning');
  });

  it('keeps the exact recent-score boundary positive and warns only beyond it', () => {
    const exactBetter = resolveRoundIdentity(baseInput({ sgTotal: null, score: 84, avgScoreRecent: 85.5 }));
    const exactWorse = resolveRoundIdentity(baseInput({ sgTotal: null, score: 87, avgScoreRecent: 85.5 }));
    const justWorse = resolveRoundIdentity(baseInput({ sgTotal: null, score: 87, avgScoreRecent: 85.49 }));

    expect(exactBetter.overallTone).toBe('success');
    expect(exactWorse.overallTone).toBe('success');
    expect(justWorse.overallTone).toBe('warning');
  });

  it('does not call marginal full-round SG a display strength', () => {
    const identity = resolveRoundIdentity(baseInput({ sgPutting: 0.3, putts: 34, girHit: null }));
    expect(identity.displayEvidence?.strongestArea).toBeUndefined();
  });

  it('does not surface putting or short-game evidence without the required context', () => {
    const putting = resolveRoundIdentity(
      baseInput({ sgPutting: 1.2, putts: 29, girHit: null }),
    );
    const shortGame = resolveRoundIdentity(
      baseInput({ sgShortGame: 1.2, shortGameShots: 5, girHit: null }),
    );

    expect(putting.primaryKey).not.toBe('putting_saved');
    expect(putting.displayEvidence?.strongestArea?.area).not.toBe('putting');
    expect(shortGame.primaryKey).not.toBe('short_game_rescue');
    expect(shortGame.displayEvidence?.strongestArea?.area).not.toBe('short_game');
  });

  it('scales approach strength thresholds for nine-hole rounds', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        holesPlayed: 9,
        parTotal: 36,
        score: 42,
        toPar: 6,
        avgScoreRecent: 42,
        sgApproach: 0.6,
      }),
    );
    expect(identity.primaryKey).toBe('approach_carried');
  });

  it('does not infer short-game rescue from raw shot volume alone', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 82,
        toPar: 10,
        avgScoreRecent: 83,
        girHit: 6,
        chips: 8,
        greensideBunkerShots: 1,
        shortGameShots: 9,
        sgShortGame: null,
      }),
    );
    expect(identity.primaryKey).not.toBe('short_game_rescue');
  });

  it('does not call putting a primary strength from raw putts per hole alone', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 82,
        toPar: 10,
        avgScoreRecent: 83,
        girHit: 10,
        putts: 30,
        sgPutting: null,
      }),
    );
    expect(identity.primaryKey).not.toBe('putting_saved');
  });

  it('returns score_only_baseline when only score exists', () => {
    const identity = resolveRoundIdentity(baseInput({ roundsLifetime: 1 }));
    expect(identity.primaryKey).toBe('score_only_baseline');
    expect(identity.evidenceLevel).toBe('score_only');
    expect(identity.tone).toBe('explain');
    expect(identity.confidence).toBe('building');
  });

  it('forces score_only_baseline confidence to building even when historical context exists', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        roundsLifetime: 14,
        avgScoreRecent: 84,
        score: 82,
        toPar: 10,
      }),
    );
    expect(identity.primaryKey).toBe('score_only_baseline');
    expect(identity.confidence).toBe('building');
  });

  it('uses a neutral aggregate identity when tracked areas have no clear separator', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        fairwaysPossible: 14,
        firHit: 7,
        girHit: 7,
        putts: 32,
        penalties: 1,
        sgTotal: 0,
        sgOffTee: 0,
        sgApproach: 0,
        sgPutting: 0,
        sgPenalties: 0,
      }),
    );

    expect(identity.evidenceLevel).toBe('aggregate_stats');
    expect(identity.primaryKey).toBe('no_clear_separator');
    expect(identity.tone).toBe('build');
    expect(identity.confidence).not.toBe('building');
  });

  it('formats stroke singular/plural correctly in baseline delta text', () => {
    const oneStrokeBetter = resolveRoundIdentity(
      baseInput({
        roundsLifetime: 8,
        score: 84,
        toPar: 12,
        avgScoreRecent: 85,
      }),
    );
    const twoStrokesWorse = resolveRoundIdentity(
      baseInput({
        roundsLifetime: 8,
        score: 87,
        toPar: 15,
        avgScoreRecent: 85,
      }),
    );

    expect(oneStrokeBetter.displayEvidence?.baselineDeltaText).toContain('1 stroke better');
    expect(twoStrokesWorse.displayEvidence?.baselineDeltaText).toContain('2 strokes above');
    expect(oneStrokeBetter.displayEvidence?.baselineDeltaText).not.toContain('1 strokes');
  });

  it('formats birdie and double-or-worse counts without grammar errors', () => {
    const roundHoles = holesFromToPar([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).map((hole, idx) => {
      if (idx === 1) return { ...hole, score: hole.par! - 1, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0 };
      if (idx === 7) return { ...hole, score: hole.par! + 2, putts: 2, penalties: 0, chips: 1, greensideBunkerShots: 0 };
      return { ...hole, putts: 2, penalties: 0, chips: 0, greensideBunkerShots: 0 };
    });

    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) + 1,
        toPar: 1,
        avgScoreRecent: 82,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );

    const story = identity.displayEvidence?.hbhStory?.detailText ?? '';
    expect(story).toContain('1 birdie');
    expect(story).toContain('one double-or-worse hole');
    expect(story).not.toContain('birdieies');
    expect(story).not.toContain('1 double-or-worse hole');
    expect(story).not.toContain('1 double-or-worse holes');
  });

  it.each([
    { label: 'one', scores: [2], expected: 'One double-or-worse hole shaped the round.' },
    { label: 'two', scores: [2, 2], expected: 'Two double-or-worse holes shaped the round.' },
  ])('formats $label double-or-worse HBH story without numeric singulars or card language', ({ scores, expected }) => {
    const toPar = Array.from({ length: 18 }, (_, index) => scores[index] ?? 0);
    const roundHoles = holesFromToPar(toPar).map((hole) => ({
      ...hole,
      putts: 2,
      penalties: 0,
      chips: 0,
      greensideBunkerShots: 0,
    }));

    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) + scores.reduce((total, diff) => total + diff, 0),
        toPar: scores.reduce((total, diff) => total + diff, 0),
        avgScoreRecent: 82,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );

    const story = identity.displayEvidence?.hbhStory?.detailText ?? '';
    expect(story).toBe(expected);
    expect(story).not.toMatch(/^1\s+double-or-worse hole/i);
    expect(story).not.toContain('shaped the card');
  });

  it('prefers volatile_scoring when birdies and doubles coexist', () => {
    const roundHoles = Array.from({ length: 18 }, (_, index) => {
      const holeNumber = index + 1;
      const par = holeNumber % 4 === 0 ? 3 : 4;
      let score = par;
      if (holeNumber === 2 || holeNumber === 11) score = par - 2;
      if (holeNumber === 6 || holeNumber === 14 || holeNumber === 17) score = par + 4;
      return {
        holeNumber,
        par,
        score,
        pass: 1,
        firHit: null,
        girHit: null,
        putts: 2,
        penalties: 0,
        chips: 1,
        greensideBunkerShots: 0,
        firDirection: null,
        girDirection: null,
      };
    });
    const identity = resolveRoundIdentity(baseInput({ entryMode: 'live_round', hasTrustedHoleByHole: true, roundHoles }));
    expect(identity.evidenceLevel).toBe('hole_by_hole');
    expect(identity.primaryKey).toBe('volatile_scoring');
  });

  it('prefers big_number when damage is concentrated without birdie upside', () => {
    const roundHoles = Array.from({ length: 18 }, (_, index) => {
      const holeNumber = index + 1;
      const par = 4;
      const score = holeNumber === 8 ? 8 : holeNumber % 6 === 0 ? 6 : 5;
      return {
        holeNumber,
        par,
        score,
        pass: 1,
        firHit: null,
        girHit: null,
        putts: 2,
        penalties: 0,
        chips: 1,
        greensideBunkerShots: 0,
        firDirection: null,
        girDirection: null,
      };
    });
    const identity = resolveRoundIdentity(baseInput({ entryMode: 'live_round', hasTrustedHoleByHole: true, roundHoles }));
    expect(identity.primaryKey).toBe('big_number');
  });

  it('selects penalty_damaged when penalties are clearly high', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        entryMode: 'post_round',
        firHit: 8,
        girHit: 8,
        putts: 34,
        penalties: 5,
        sgPenalties: -1.5,
        sgApproach: 0.2,
        sgPutting: 0.2,
        sgOffTee: 0.1,
      }),
    );
    expect(identity.primaryKey).toBe('penalty_damaged');
    expect(identity.tone).toBe('fix');
  });

  it('selects scoring_chance_missed with strong GIR and weak putting conversion', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        girHit: 10,
        putts: 36,
        firHit: 8,
        sgApproach: 0.8,
        sgPutting: -0.7,
        sgOffTee: 0.1,
      }),
    );
    expect(identity.primaryKey).toBe('scoring_chance_missed');
  });

  it('selects clean_control for low-mistake above-expected HBH round', () => {
    const toPar = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
    const roundHoles = holesFromToPar(toPar).map((hole, idx) => ({
      ...hole,
      firHit: PAR18[idx] === 3 ? null : 1,
      girHit: idx % 2 === 0 ? 1 : 0,
      putts: idx % 5 === 0 ? 1 : 2,
      penalties: 0,
      chips: idx % 2 === 0 ? 0 : 1,
      greensideBunkerShots: 0,
    }));
    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) + sum(toPar),
        toPar: sum(toPar),
        avgScoreRecent: 84,
        firHit: 10,
        girHit: 9,
        putts: 31,
        penalties: 0,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );
    expect(identity.primaryKey).toBe('clean_control');
    expect(identity.tone).toBe('repeat');
  });

  it('uses survival when process is weak but score stayed manageable', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 85,
        toPar: 13,
        avgScoreRecent: 86,
        firHit: 4,
        girHit: 5,
        putts: 36,
        penalties: 2,
        sgOffTee: -1.1,
        sgApproach: -1.0,
        sgPutting: -0.8,
      }),
    );
    expect(identity.primaryKey).toBe('survival');
  });

  it('uses everything_leaked when several domains leak together', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 96,
        toPar: 24,
        avgScoreRecent: 86,
        firHit: 3,
        girHit: 3,
        putts: 41,
        penalties: 2,
        sgOffTee: -1.5,
        sgApproach: -1.2,
        sgPutting: -1.4,
        sgShortGame: -1.0,
        sgPenalties: -0.2,
      }),
    );
    expect(identity.primaryKey).toBe('everything_leaked');
  });

  it('does not fall back to score_only when live HBH scoring sequence exists', () => {
    const roundHoles = Array.from({ length: 9 }, (_, index) => ({
      holeNumber: index + 1,
      par: 4,
      score: 5,
      pass: 1,
      firHit: null,
      girHit: null,
      putts: null,
      penalties: null,
      chips: null,
      greensideBunkerShots: null,
      firDirection: null,
      girDirection: null,
    }));
    const identity = resolveRoundIdentity(
      baseInput({
        holesPlayed: 9,
        score: 45,
        parTotal: 36,
        toPar: 9,
        firHit: null,
        girHit: null,
        putts: null,
        penalties: null,
        chips: null,
        greensideBunkerShots: null,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );
    expect(identity.evidenceLevel).toBe('hole_by_hole');
    expect(identity.primaryKey).not.toBe('score_only_baseline');
  });

  it('prioritizes volatile_scoring over breakthrough when HBH volatility is clear', () => {
    const roundHoles = Array.from({ length: 18 }, (_, index) => {
      const holeNumber = index + 1;
      const par = holeNumber % 4 === 0 ? 3 : 4;
      let score = par;
      if (holeNumber === 2 || holeNumber === 6 || holeNumber === 11) score = par - 1;
      if (holeNumber === 4 || holeNumber === 8 || holeNumber === 14) score = par + 2;
      return {
        holeNumber,
        par,
        score,
        pass: 1,
        firHit: null,
        girHit: null,
        putts: 2,
        penalties: 0,
        chips: 1,
        greensideBunkerShots: 0,
        firDirection: null,
        girDirection: null,
      };
    });
    const identity = resolveRoundIdentity(
      baseInput({
        score: 80,
        toPar: 8,
        avgScoreRecent: 90,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );
    expect(identity.primaryKey).toBe('volatile_scoring');
  });

  it('prioritizes big_number over breakthrough on concentrated one-hole damage', () => {
    const roundHoles = Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      par: 4,
      score: index === 7 ? 8 : 5,
      pass: 1,
      firHit: null,
      girHit: null,
      putts: 2,
      penalties: 0,
      chips: 1,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));
    const identity = resolveRoundIdentity(
      baseInput({
        score: 85,
        toPar: 13,
        avgScoreRecent: 92,
        sgTotal: 2,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );
    expect(identity.primaryKey).toBe('big_number');
    expect(identity.overallTone).toBe('success');
  });

  it('does not resolve a strong no-double round to big_number from one bogey share alone', () => {
    const toPar = [0, 0, -1, 0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0];
    const roundHoles = holesFromToPar(toPar).map((hole, index) => ({
      ...hole,
      firHit: hole.par === 3 ? null : 1,
      girHit: toPar[index] <= 0 ? 1 : 0,
      putts: toPar[index] <= -1 ? 1 : 2,
      penalties: 0,
      chips: toPar[index] > 0 ? 1 : 0,
      greensideBunkerShots: 0,
    }));
    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) - 1,
        toPar: -1,
        avgScoreRecent: 85,
        firHit: 14,
        girHit: 16,
        putts: 33,
        penalties: 0,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );

    expect(identity.primaryKey).not.toBe('big_number');
    expect(identity.displayEvidence?.weakestArea?.area).not.toBe('big_numbers');
  });

  it('prioritizes penalty_damaged over positive stories when penalties are strong', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 84,
        toPar: 12,
        avgScoreRecent: 88,
        firHit: 10,
        girHit: 9,
        putts: 32,
        penalties: 4,
        sgOffTee: 1.0,
        sgApproach: 0.9,
        sgPutting: 0.7,
        sgPenalties: -1.4,
      }),
    );
    expect(identity.primaryKey).toBe('penalty_damaged');
  });

  it('prioritizes clean_control over breakthrough when low-mistake control is strongest', () => {
    const roundHoles = Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      par: 4,
      score: index % 6 === 0 ? 3 : 4,
      pass: 1,
      firHit: 1,
      girHit: 1,
      putts: 2,
      penalties: 0,
      chips: 0,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));
    const identity = resolveRoundIdentity(
      baseInput({
        score: 69,
        toPar: -3,
        avgScoreRecent: 79,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );
    expect(identity.primaryKey).toBe('clean_control');
  });

  it('prioritizes steady_scoring over breakthrough when HBH pattern is steady', () => {
    const roundHoles = Array.from({ length: 18 }, (_, index) => ({
      holeNumber: index + 1,
      par: 4,
      score: index % 3 === 0 ? 5 : 4,
      pass: 1,
      firHit: null,
      girHit: null,
      putts: 2,
      penalties: 0,
      chips: 1,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));
    const identity = resolveRoundIdentity(
      baseInput({
        score: 78,
        toPar: 6,
        avgScoreRecent: 84,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );
    expect(identity.primaryKey).toBe('steady_scoring');
  });

  it('chooses putting_leak over scoring_chance_missed with severe putting leak', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 87,
        toPar: 15,
        avgScoreRecent: 88,
        girHit: 10,
        putts: 40,
        firHit: 8,
        penalties: 1,
        sgApproach: 0.7,
        sgPutting: -1.4,
      }),
    );
    expect(identity.primaryKey).toBe('putting_leak');
  });

  it('chooses scoring_chance_missed over approach_carried when conversion clearly failed', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 86,
        toPar: 14,
        avgScoreRecent: 85,
        girHit: 10,
        putts: 36,
        firHit: 7,
        penalties: 1,
        sgApproach: 1.1,
        sgPutting: -0.8,
      }),
    );
    expect(identity.primaryKey).toBe('scoring_chance_missed');
  });

  it('prioritizes penalty_damaged over breakthrough in 9-hole penalty-heavy rounds', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        holesPlayed: 9,
        parTotal: 36,
        score: 43,
        toPar: 7,
        avgScoreRecent: 47,
        firHit: 3,
        girHit: 2,
        putts: 20,
        penalties: 3,
        sgPenalties: -0.9,
        entryMode: 'post_round',
      }),
    );
    expect(identity.primaryKey).toBe('penalty_damaged');
  });

  it('prefers approach_leak over big_number in 9-hole low-penalty low-GIR damage rounds', () => {
    const roundHoles = [
      2, 2, 1, 1, 2, 2, 1, 2, 2,
    ].map((toPar, index) => ({
      holeNumber: index + 1,
      par: index % 3 === 0 ? 3 : 4,
      score: (index % 3 === 0 ? 3 : 4) + toPar,
      pass: 1,
      firHit: index % 3 === 0 ? null : 0,
      girHit: index === 1 ? 1 : 0,
      putts: 2,
      penalties: 0,
      chips: 1,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));

    const identity = resolveRoundIdentity(
      baseInput({
        holesPlayed: 9,
        parTotal: 36,
        score: 50,
        toPar: 14,
        avgScoreRecent: 45,
        firHit: 3,
        girHit: 1,
        putts: 15,
        penalties: 0,
        sgApproach: -1.1,
        sgPenalties: 0.2,
        sgPutting: 0.1,
        sgShortGame: 0.1,
        shortGameShots: 2,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );

    expect(identity.primaryKey).toBe('approach_leak');
    expect(identity.primaryKey).not.toBe('big_number');
    expect(identity.primaryKey).not.toBe('penalty_damaged');
  });

  it('keeps low-penalty low-GIR one-penalty damage rounds on approach_leak when approach is clearly poor', () => {
    const roundHoles = [
      2, 1, 2, 1, 2, 2, 1, 2, 1,
    ].map((toPar, index) => ({
      holeNumber: index + 1,
      par: index % 3 === 0 ? 3 : 4,
      score: (index % 3 === 0 ? 3 : 4) + toPar,
      pass: 1,
      firHit: index % 3 === 0 ? null : 0,
      girHit: index === 0 || index === 5 ? 1 : 0,
      putts: 2,
      penalties: index === 6 ? 1 : 0,
      chips: 1,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));

    const identity = resolveRoundIdentity(
      baseInput({
        holesPlayed: 9,
        parTotal: 36,
        score: 48,
        toPar: 12,
        avgScoreRecent: 44,
        firHit: 2,
        girHit: 2,
        putts: 18,
        penalties: 1,
        sgApproach: -1.0,
        sgPenalties: -0.2,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );

    expect(identity.primaryKey).toBe('approach_leak');
    expect(identity.primaryKey).not.toBe('penalty_damaged');
  });

  it('keeps penalty_damaged for 9-hole high-penalty repeated damage rounds', () => {
    const roundHoles = [
      2, 2, 1, 2, 1, 2, 1, 2, 2,
    ].map((toPar, index) => ({
      holeNumber: index + 1,
      par: index % 3 === 0 ? 3 : 4,
      score: (index % 3 === 0 ? 3 : 4) + toPar,
      pass: 1,
      firHit: index % 3 === 0 ? null : 0,
      girHit: index === 1 || index === 4 ? 1 : 0,
      putts: 2,
      penalties: index % 2 === 0 ? 1 : 0,
      chips: 1,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));

    const identity = resolveRoundIdentity(
      baseInput({
        holesPlayed: 9,
        parTotal: 36,
        score: 50,
        toPar: 14,
        avgScoreRecent: 44,
        firHit: 2,
        girHit: 2,
        putts: 19,
        penalties: 4,
        sgApproach: -0.9,
        sgPenalties: -1.2,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );

    expect(identity.primaryKey).toBe('penalty_damaged');
  });

  it('prefers approach_leak over penalty_damaged in 18-hole low-penalty low-GIR many-big-hole rounds', () => {
    const toPar = [1, 2, 1, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 1, 2, 1, 1, 2];
    const roundHoles = holesFromToPar(toPar).map((hole, index) => ({
      ...hole,
      firHit: PAR18[index] === 3 ? null : 0,
      girHit: index % 5 === 0 ? 1 : 0,
      putts: 2,
      penalties: index === 3 || index === 14 ? 1 : 0,
      chips: 1,
      greensideBunkerShots: 0,
    }));

    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) + sum(toPar),
        toPar: sum(toPar),
        avgScoreRecent: 84,
        firHit: 3,
        girHit: 3,
        putts: 37,
        penalties: 2,
        sgApproach: -1.3,
        sgPenalties: -0.3,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );

    expect(['approach_leak', 'everything_leaked']).toContain(identity.primaryKey);
    expect(identity.primaryKey).not.toBe('penalty_damaged');
  });

  it('keeps big_number when only HBH score pattern exists without approach evidence', () => {
    const roundHoles = Array.from({ length: 9 }, (_, index) => ({
      holeNumber: index + 1,
      par: index % 3 === 0 ? 3 : 4,
      score: (index % 3 === 0 ? 3 : 4) + (index === 2 || index === 5 ? 3 : 1),
      pass: 1,
      firHit: null,
      girHit: null,
      putts: null,
      penalties: null,
      chips: null,
      greensideBunkerShots: null,
      firDirection: null,
      girDirection: null,
    }));

    const identity = resolveRoundIdentity(
      baseInput({
        holesPlayed: 9,
        parTotal: 36,
        score: 48,
        toPar: 12,
        avgScoreRecent: 43,
        girHit: null,
        sgApproach: null,
        penalties: null,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );

    expect(identity.primaryKey).toBe('big_number');
    expect(identity.primaryKey).not.toBe('approach_leak');
  });

  it('lets short_game_pressure beat approach_leak when approach is mild but short-game leak is severe', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 90,
        toPar: 18,
        avgScoreRecent: 86,
        firHit: 6,
        girHit: 5,
        putts: 36,
        penalties: 1,
        chips: 16,
        greensideBunkerShots: 4,
        shortGameShots: 20,
        sgApproach: -0.85,
        sgShortGame: -1.3,
        sgPenalties: -0.1,
      }),
    );

    expect(identity.primaryKey).toBe('short_game_pressure');
  });

  it('keeps clean_control over scoring_chance_missed when conversion is not clearly poor', () => {
    const toPar = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
    const roundHoles = holesFromToPar(toPar).map((hole, idx) => ({
      ...hole,
      firHit: PAR18[idx] === 3 ? null : 1,
      girHit: idx % 2 === 0 ? 1 : 0,
      putts: idx % 4 === 0 ? 1 : 2,
      penalties: 0,
      chips: idx % 2 === 0 ? 0 : 1,
      greensideBunkerShots: 0,
    }));
    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) + sum(toPar),
        toPar: sum(toPar),
        avgScoreRecent: 82,
        firHit: 10,
        girHit: 10,
        putts: 31,
        penalties: 0,
        chips: 7,
        greensideBunkerShots: 1,
        shortGameShots: 5,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );
    expect(identity.primaryKey).toBe('clean_control');
  });

  it('keeps all_around_strong over scoring_chance_missed when putting is not poor', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 80,
        toPar: 8,
        avgScoreRecent: 83,
        firHit: 10,
        girHit: 9,
        putts: 31,
        penalties: 1,
        sgOffTee: 0.8,
        sgApproach: 1.0,
        sgPutting: 0.9,
        sgShortGame: 0.7,
      }),
    );
    expect(identity.primaryKey).toBe('all_around_strong');
  });

  it('keeps approach_carried over scoring_chance_missed without clear putting failure', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 82,
        toPar: 10,
        avgScoreRecent: 83,
        firHit: 4,
        girHit: 10,
        putts: 33,
        penalties: 1,
        sgApproach: 1.3,
        sgOffTee: -0.5,
        sgPutting: 0.2,
      }),
    );
    expect(identity.primaryKey).toBe('approach_carried');
  });

  it('selects breakthrough for strong 9-hole rounds when score is exceptional', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        holesPlayed: 9,
        parTotal: 36,
        score: 39,
        toPar: 3,
        avgScoreRecent: 47,
        firHit: 5,
        girHit: 5,
        putts: 15,
        penalties: 0,
        sgApproach: 0.7,
        sgPutting: 0.6,
      }),
    );
    expect(identity.primaryKey).toBe('breakthrough');
  });

  it('keeps approach_carried on bad score with strong GIR when putting is not clearly bad', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 92,
        toPar: 20,
        avgScoreRecent: 85,
        firHit: 6,
        girHit: 10,
        putts: 34,
        penalties: 2,
        sgApproach: 1.0,
        sgPutting: -0.2,
      }),
    );
    expect(identity.primaryKey).toBe('approach_carried');
  });

  it('uses steady_scoring for no-damage HBH patterns instead of breakthrough', () => {
    const toPar = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) + sum(toPar),
        toPar: sum(toPar),
        avgScoreRecent: 88,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles: holesFromToPar(toPar),
      }),
    );
    expect(identity.primaryKey).toBe('steady_scoring');
  });

  it('uses steady_scoring for slow-start strong-finish HBH without dominant damage', () => {
    const toPar = [2, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0];
    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) + sum(toPar),
        toPar: sum(toPar),
        avgScoreRecent: 88,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles: holesFromToPar(toPar),
      }),
    );
    expect(identity.primaryKey).toBe('steady_scoring');
  });

  it('keeps breakthrough over tee_trouble when great score is the dominant story', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 77,
        toPar: 5,
        avgScoreRecent: 88,
        firHit: 3,
        girHit: 8,
        putts: 34,
        penalties: 1,
        sgApproach: 0.7,
        sgOffTee: -0.6,
        sgPutting: 0.5,
      }),
    );
    expect(identity.primaryKey).toBe('breakthrough');
  });

  it('uses steady_scoring for par-3 problem rounds instead of forcing big_number', () => {
    const toPar = [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 2, 0, 0, 2, 0];
    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) + sum(toPar),
        toPar: sum(toPar),
        avgScoreRecent: 88,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles: holesFromToPar(toPar),
      }),
    );
    expect(identity.primaryKey).toBe('steady_scoring');
    expect(identity.modifiers).toContain('par_3_problem');
  });

  it('uses steady_scoring for par-5 carried neutral rounds rather than clean_control', () => {
    const toPar = [1, 0, 0, -1, 1, 0, 0, 1, -1, 1, 0, 0, 0, 0, 1, -1, 0, -1];
    const identity = resolveRoundIdentity(
      baseInput({
        score: sum(PAR18) + sum(toPar),
        toPar: sum(toPar),
        avgScoreRecent: 88,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles: holesFromToPar(toPar),
      }),
    );
    expect(identity.primaryKey).toBe('steady_scoring');
    expect(identity.modifiers).toContain('par_5_scoring');
  });

  it('uses breakthrough (not volatile primary) for massive career-best style rounds with contained damage', () => {
    const pars = [4, 4, 3, 4, 4, 3, 5, 4, 4, 4, 3, 4, 4, 3, 4, 5, 4, 4];
    const toPar = [0, 1, 0, 2, -1, 0, 1, 0, 0, 1, 0, 0, 2, 0, -1, 1, 0, 0];
    const roundHoles = pars.map((par, index) => ({
      holeNumber: index + 1,
      par,
      score: par + toPar[index],
      pass: 1,
      firHit: par === 3 ? null : index % 3 === 0 ? 1 : 0,
      girHit: index % 2 === 0 ? 1 : 0,
      putts: index % 5 === 0 ? 1 : 2,
      penalties: index === 4 ? 1 : 0,
      chips: 0,
      greensideBunkerShots: 0,
      firDirection: null,
      girDirection: null,
    }));

    const identity = resolveRoundIdentity(
      baseInput({
        parTotal: 70,
        score: 76,
        toPar: 6,
        avgScoreRecent: 94.6,
        roundsLifetime: 20,
        firHit: 5,
        girHit: 8,
        putts: 27,
        penalties: 1,
        sgTotal: 16.6,
        sgOffTee: 0.0,
        sgApproach: 1.6,
        sgShortGame: 0.4,
        sgPutting: 6.9,
        sgPenalties: 2.0,
        entryMode: 'live_round',
        hasTrustedHoleByHole: true,
        roundHoles,
      }),
    );

    expect(identity.primaryKey).toBe('breakthrough');
    expect(identity.tone).toBe('repeat');
    expect(identity.modifiers).not.toContain('putting_conversion_issue');
    expect(identity.modifiers).not.toContain('tee_accuracy_leak');
    expect(identity.primaryKey).not.toBe('volatile_scoring');
    expect(identity.primaryKey).not.toBe('big_number');
    expect(identity.displayEvidence?.baselineDeltaText).toMatch(/18\.6 strokes better/i);
    expect(identity.displayEvidence?.strongestArea?.area).toBe('putting');
    expect(identity.displayEvidence?.strongestArea?.valueText).toMatch(/\+6\.9 SG putting/i);
    expect(identity.displayEvidence?.weakestArea?.area).toBe('big_numbers');
  });

  it('celebrates a breakthrough against recent form even when handicap-benchmark SG is negative', () => {
    const identity = resolveRoundIdentity(
      baseInput({
        score: 78,
        toPar: 6,
        avgScoreRecent: 89,
        roundsLifetime: 8,
        sgTotal: -0.7,
      }),
    );

    expect(identity.primaryKey).toBe('breakthrough');
    expect(identity.overallTone).toBe('great');
    expect(identity.displayEvidence?.baselineDeltaText).toMatch(/better than your recent average/i);
  });
});
