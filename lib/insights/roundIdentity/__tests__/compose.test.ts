import { composeRoundIdentityDisplay } from '@/lib/insights/roundIdentity/compose';
import { POST_ROUND_MESSAGE_MAX_CHARS } from '@/lib/insights/config/postRound';
import {
  ROUND_IDENTITY_V1_VERSION,
  type RoundIdentity,
  type RoundIdentityPrimaryKey,
  type RoundIdentityTone,
} from '@/lib/insights/roundIdentity/types';

function baseIdentity(overrides: Partial<RoundIdentity> = {}): RoundIdentity {
  return {
    version: ROUND_IDENTITY_V1_VERSION,
    inputHash: 'hash',
    primaryKey: 'steady_scoring',
    title: 'Steady Scoring Round',
    summary: 'The round was consistent, with limited score swings hole to hole.',
    shapedBy: ['Primary story: Steady Scoring Round.', 'Round detail: repeated_bogeys.'],
    nextRoundFocus: 'Next round, keep this pattern in place and confirm it across another round.',
    modifiers: ['repeated_bogeys'],
    evidenceLevel: 'hole_by_hole',
    confidence: 'moderate',
    sampleContext: 'established',
    tone: 'build',
    entryMode: 'live_round',
    statCompletenessScore: 70,
    displayEvidence: {
      scoreText: '82 (+10)',
      baselineDeltaText: '1.8 strokes better than your recent average of 83.8.',
      strongestArea: {
        area: 'approach',
        label: 'Approach Play',
        valueText: '+1.1 SG approach',
        detailText: 'Greens in regulation: 9/18 (50%).',
      },
      weakestArea: {
        area: 'off_tee',
        label: 'Off The Tee',
        valueText: '-0.6 SG off tee',
        detailText: 'Fairways hit: 4/12 (33%).',
      },
      hbhStory: {
        label: 'Scoring upside with costly holes',
        detailText: 'You had 2 birdies and 2 double-or-worse holes.',
      },
    },
    ...overrides,
  };
}

function allCopy(display: ReturnType<typeof composeRoundIdentityDisplay>): string {
  return [
    display.eyebrow,
    display.headline,
    display.subhead,
    display.confidenceText,
    display.progressText,
    ...display.insights.map((insight) => `${insight.title} ${insight.body}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function collectAreaCardBodies(identity: RoundIdentity, variants = 96): string[] {
  return Array.from({ length: variants }, (_, index) =>
    composeRoundIdentityDisplay({
      ...identity,
      inputHash: `${identity.inputHash}-${index}`,
    }).insights[1].body,
  );
}

const TONE_BY_PRIMARY: Record<RoundIdentityPrimaryKey, RoundIdentityTone> = {
  score_only_baseline: 'explain',
  no_clear_separator: 'build',
  breakthrough: 'repeat',
  clean_control: 'repeat',
  all_around_strong: 'repeat',
  approach_carried: 'repeat',
  tee_controlled: 'repeat',
  putting_saved: 'repeat',
  short_game_rescue: 'repeat',
  steady_scoring: 'build',
  survival: 'build',
  approach_leak: 'fix',
  tee_trouble: 'fix',
  penalty_damaged: 'fix',
  putting_leak: 'fix',
  short_game_pressure: 'fix',
  scoring_chance_missed: 'fix',
  volatile_scoring: 'build',
  big_number: 'fix',
  everything_leaked: 'fix',
};

describe('composeRoundIdentityDisplay', () => {
  it('builds useful score-only copy without implying causes', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'score_only_baseline',
        summary: 'Score recorded at 90 (+18). This starts your baseline.',
        evidenceLevel: 'score_only',
        tone: 'explain',
        sampleContext: 'established',
        modifiers: [],
        displayEvidence: {
          scoreText: '90 (+18)',
        },
      }),
    );

    expect(display.insights).toHaveLength(3);
    expect(display.insights[0].body).toMatch(/you shot 90 \(\+18\)/i);
    expect(display.insights[0].body).not.toMatch(/starting point|optional stats|extra stat|putts or greens/i);
    expect(display.insights[1].body).toMatch(/score-only tracking|tracked detail|score trend|score is logged/i);
    expect(display.insights[2].body).toMatch(/optional stats|extra stat|putts or greens/i);
    expect(display.insights[0].body.toLowerCase()).not.toMatch(/approach|putting|off the tee|penalty strokes were/i);
  });

  it('keeps a score-only breakthrough while making the missing cause explicit', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'breakthrough',
        summary: "This score beat what you've been shooting lately by a meaningful margin.",
        evidenceLevel: 'score_only',
        confidence: 'building',
        tone: 'repeat',
        modifiers: [],
        displayLevels: {
          story: 'great',
          worked: 'success',
          watch: 'success',
        },
        displayEvidence: {
          scoreText: '74 (+2)',
          baselineDeltaText: '4 strokes better than your recent average of 78.',
        },
      }),
    );

    expect(display.insights[0].body).toMatch(/you shot 74 \(\+2\).*4 strokes better/i);
    expect(display.insights[0].body).toMatch(/breakthrough|usual scoring range|separated itself|step forward/i);
    expect(display.insights[0].level).toBe('great');
    expect(display.insights[1].body).toMatch(/score-only tracking|tracked detail|score trend|score is logged/i);
    expect(display.insights[1].body).not.toMatch(/tracked areas stayed close|balanced read|outperforming or trailing/i);
    expect(display.insights[1].level).toBe('info');
    expect(display.insights[2].body).toMatch(/optional stats|extra stat|putts or greens/i);
    expect(display.insights[2].level).toBe('info');
  });

  it('keeps partial tracking informational when no reliable area conclusion exists', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'putts-only-breakthrough',
        primaryKey: 'breakthrough',
        evidenceLevel: 'aggregate_stats',
        confidence: 'building',
        tone: 'repeat',
        modifiers: [],
        displayLevels: {
          story: 'great',
          worked: 'info',
          watch: 'success',
        },
        displayEvidence: {
          scoreText: '74 (+4)',
          baselineDeltaText: '4 strokes better than your recent average of 78.',
        },
      }),
    );

    expect(display.insights[0].level).toBe('great');
    expect(display.insights[1].level).toBe('info');
    expect(display.insights[2].level).toBe('info');
    expect(display.insights[2].body).toMatch(/next round.*(one more|complementary)/i);
    expect(display.insights[2].body).not.toMatch(/same pattern|repeat/i);
  });

  it('uses non-comparative strength wording for one reliable putting area', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'single-putting-strength',
        primaryKey: 'putting_saved',
        evidenceLevel: 'aggregate_stats',
        confidence: 'building',
        tone: 'repeat',
        overallTone: 'success',
        displayEvidence: {
          scoreText: '74 (+4)',
          baselineDeltaText: '4 strokes better than your recent average of 78.',
          reliableAreaCount: 1,
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+2.7 SG putting',
            detailText: 'Putts: 31 (1.72 per hole).',
          },
        },
      }),
    );

    expect(display.insights[0].body).toMatch(/putting|putter/i);
    expect(display.insights[0].body).not.toMatch(/biggest|strongest/i);
    expect(display.insights[1].body).toBe(
      'Putting was a clear strength this round. You had 31 putts.',
    );
    expect(display.insights[1].body).not.toMatch(/strongest|biggest/i);
    expect(display.insights[1].level).toBe('success');
  });

  it('uses non-comparative opportunity wording for one reliable putting area', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'single-putting-opportunity',
        primaryKey: 'putting_leak',
        evidenceLevel: 'aggregate_stats',
        confidence: 'building',
        tone: 'fix',
        overallTone: 'warning',
        displayEvidence: {
          scoreText: '88 (+16)',
          reliableAreaCount: 1,
          weakestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '-1.2 SG putting',
            detailText: 'Putts: 39 (2.17 per hole).',
          },
        },
      }),
    );

    expect(display.insights[1].body).toBe(
      'Putting was a clear opportunity this round. You had 39 putts.',
    );
    expect(display.insights[1].body).not.toMatch(/weakest|clearest leak/i);
    expect(display.insights[1].level).toBe('warning');
  });

  it('does not call a single positive penalties input a balanced multi-area read', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'single-penalties-strength',
        primaryKey: 'no_clear_separator',
        evidenceLevel: 'aggregate_stats',
        confidence: 'building',
        tone: 'build',
        overallTone: 'success',
        displayEvidence: {
          scoreText: '84 (+12)',
          reliableAreaCount: 1,
          strongestArea: {
            area: 'penalties',
            label: 'Penalty Control',
            valueText: '+1.3 SG penalties',
            detailText: 'Penalty strokes: 0.',
          },
        },
      }),
    );

    expect(display.insights[0].body).toMatch(/penalty control was a clear positive/i);
    expect(display.insights[1].body).toBe(
      'Penalty control was a clear strength this round. You recorded 0 penalty strokes.',
    );
    expect(display.insights[1].body).not.toMatch(/balanced|tracked areas stayed close/i);
    expect(display.insights[1].level).toBe('success');
    expect(display.insights[2].level).toBe('success');
  });

  it('uses neutral M2 title semantics for composed cards', () => {
    const display = composeRoundIdentityDisplay(baseIdentity({ primaryKey: 'putting_leak', tone: 'fix' }));

    expect(display.insights[1].title).toBe('What Stood Out');
    expect(display.insights[1].title).not.toBe('What Worked');
  });

  it.each([
    { count: 1, valueText: 'One double-or-worse hole', expected: 'The round got away on one costly hole.' },
    { count: 2, valueText: 'Two double-or-worse holes', expected: 'The round got away on two costly holes.' },
    { count: 3, valueText: 'Three double-or-worse holes', expected: 'The round got away on three costly holes.' },
  ])('uses count-aware costly-hole grammar for $count big-number holes', ({ count, valueText, expected }) => {
    const bodies = collectAreaCardBodies(
      baseIdentity({
        inputHash: `big-number-count-${count}`,
        primaryKey: 'big_number',
        tone: 'fix',
        displayEvidence: {
          scoreText: '89 (+17)',
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText,
            detailText:
              count === 1
                ? 'One hole accounted for 42% of total over-par damage.'
                : 'Big numbers shaped too much of the final score.',
          },
        },
      }),
    );

    const copy = bodies.join(' ');
    expect(copy).not.toContain('one costly holes');
    expect(bodies.some((body) => body.includes(expected))).toBe(true);
  });

  it('does not ask for stats again when aggregate evidence has no decisive separator', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'no_clear_separator',
        title: 'No Clear Separator',
        summary: 'The tracked areas stayed close enough that no single one defined the round.',
        evidenceLevel: 'aggregate_stats',
        tone: 'build',
        modifiers: [],
        displayEvidence: {
          scoreText: '82 (+10)',
          weakestArea: {
            area: 'approach',
            label: 'Approach Play',
            valueText: '-0.6 SG approach',
            detailText: 'Greens in regulation: 7/18 (39%).',
          },
        },
      }),
    );

    const copy = display.insights.map((insight) => insight.body).join(' ');
    expect(copy).toMatch(/tracked areas stayed close enough that no single one defined the round/i);
    expect(display.insights[1].body).not.toMatch(/approach|putting|off the tee|short game/i);
    expect(display.insights[2].body).not.toMatch(/approach|putting|off the tee|short game/i);
    expect(copy).not.toMatch(/add one or two optional stats|add a couple of stats|track one extra area/i);
  });

  it('keeps no-clear-separator evidence neutral instead of calling a marginal area a leak', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'no_clear_separator',
        title: 'No Clear Separator',
        summary: 'The tracked areas stayed close enough that no single one defined the round.',
        evidenceLevel: 'aggregate_stats',
        tone: 'build',
        overallTone: 'success',
        modifiers: [],
        displayEvidence: {
          scoreText: '86 (+14)',
          baselineDeltaText: 'Right on your recent average of 86.0.',
          weakestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '1.78 putts per hole',
            detailText: 'Putts: 32 (1.78 per hole).',
          },
        },
      }),
    );

    expect(display.insights[0].level).toBe('success');
    expect(display.insights[1].level).toBe('info');
    expect(display.insights[1].body).toMatch(/not decisive|not enough to define|clear strength or leak|not enough to call it a pattern/i);
    expect(display.insights[1].body).not.toMatch(/held the score back|clearest leak|costing you strokes/i);
    expect(display.insights[2].body).toMatch(/keep tracking|same stat set|one more round|confirm what matters/i);
  });

  it('keeps positive-overall M1 copy rewarding when the primary identity is a leak', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'approach_leak',
        tone: 'fix',
        overallTone: 'success',
        modifiers: [],
        displayEvidence: {
          scoreText: '80 (+8)',
          baselineDeltaText: '2 strokes better than your recent average of 82.0.',
          weakestArea: {
            area: 'approach',
            label: 'Approach Play',
            valueText: '-1.1 SG approach',
            detailText: 'Greens in regulation: 5/18 (28%).',
          },
        },
      }),
    );

    expect(display.insights[0].level).toBe('success');
    expect(display.insights[0].body).toMatch(/positive round overall|positive result overall|finished above expectation|good outweighed|stronger parts.*outweighed/i);
    expect(display.insights[0].body).not.toMatch(/benchmark/i);
    expect(display.insights[0].body).not.toMatch(/round got harder|too many approaches|missed greens put the score under pressure/i);
    expect(display.insights[1].level).toBe('warning');
  });

  it('uses sentence case when the score is right on the recent average', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'no_clear_separator',
        evidenceLevel: 'aggregate_stats',
        tone: 'build',
        displayEvidence: {
          scoreText: '86 (+14)',
          baselineDeltaText: 'Right on your recent average of 86.0.',
        },
      }),
    );

    expect(display.insights[0].body).toContain('which was right on your recent average');
    expect(display.insights[0].body).not.toContain('which was Right on');
  });

  it('adds first-round framing and progress text', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        sampleContext: 'first_round',
        overallTone: 'warning',
        displayLevels: {
          story: 'warning',
          worked: 'warning',
          watch: 'info',
        },
      }),
    );

    expect(display.eyebrow).toBe('Round 1 Logged');
    expect(display.progressText).toMatch(/2 more rounds unlock stronger patterns/i);
    expect(display.insights[0].level).toBe('success');
    expect(display.insights[1].level).toBe('warning');
  });

  it('uses round-number-based progress text for rounds 1 and 2, and hides it at 3+', () => {
    const first = composeRoundIdentityDisplay(baseIdentity(), { roundNumber: 1 });
    const second = composeRoundIdentityDisplay(baseIdentity(), { roundNumber: 2 });
    const third = composeRoundIdentityDisplay(baseIdentity(), { roundNumber: 3 });

    expect(first.progressText).toBe('2 more rounds unlock stronger patterns.');
    expect(second.progressText).toBe('1 more round unlocks stronger patterns.');
    expect(third.progressText).toBeUndefined();
  });

  it('composes breakthrough copy with repeat tone and costly holes as watch item', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'breakthrough',
        tone: 'repeat',
        summary: 'This score beat your recent baseline by a meaningful margin.',
        modifiers: ['one_hole_damage', 'bounce_back'],
        displayEvidence: {
          scoreText: '76 (+6)',
          baselineDeltaText: '18.6 strokes better than your recent average of 94.6.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+6.9 SG putting',
            detailText: 'Putts: 27 (1.50 per hole).',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '2 double-or-worse holes',
            detailText: 'One hole accounted for 33% of total over-par damage.',
          },
          hbhStory: {
            label: 'Scoring upside with costly holes',
            detailText: 'You had 3 birdies and 2 double-or-worse holes.',
          },
        },
      }),
    );

    expect(display.insights[0].body).toMatch(/18\.6 strokes better than your recent average of 94\.6/i);
    expect(display.insights[1].body).toMatch(/putting was the round's biggest edge|putter gave the round its biggest lift|putting did real work|greens were a strength/i);
    expect(display.insights[1].body).toMatch(/With 27 putts/i);
    expect(display.insights[0].body).toMatch(/breakthrough|broke through|clearly ahead of your usual range|clearly better than your usual range|costly holes showed up, but they did not define the round|good holes outweighed the costly ones/i);
    expect(display.insights[2].title).toMatch(/repeat/i);
    expect(display.insights[2].body).toMatch(
      /big numbers|costly|doubles|make those costly holes less expensive|keep the good pattern/i,
    );
    expect(display.insights[2].body.toLowerCase()).not.toContain('profile can go even lower');
    expect(display.insights[2].body.toLowerCase()).not.toMatch(/fix|leak first|remove the biggest leak/);
  });

  it('composes fix tone with one clear watch area', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'penalty_damaged',
        tone: 'fix',
        displayEvidence: {
          scoreText: '91 (+19)',
          weakestArea: {
            area: 'penalties',
            label: 'Penalty Control',
            valueText: '-1.3 SG penalties',
            detailText: 'Penalty strokes: 4.',
          },
        },
      }),
    );

    expect(display.insights[1].body).toContain('Penalty strokes were the clearest scoring issue.');
    expect(display.insights[1].body).toContain('Four penalty strokes were recorded.');
    expect(display.insights[1].body).not.toMatch(/manageable holes into big numbers|clearest leak/i);
    expect(display.insights[2].title).toMatch(/watch/i);
    expect(display.insights[2].body).toMatch(/target with the most room/i);
  });

  it.each([
    [2, 'Two'],
    [4, 'Four'],
  ])('states the exact penalty count for %i penalty strokes', (penalties, countLabel) => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: `penalties-${penalties}`,
        primaryKey: 'penalty_damaged',
        tone: 'fix',
        displayEvidence: {
          scoreText: '91 (+19)',
          weakestArea: {
            area: 'penalties',
            label: 'Penalty Control',
            valueText: '-1.3 SG penalties',
            detailText: `Penalty strokes: ${penalties}.`,
          },
        },
      }),
    );

    expect(display.insights[1].body).toContain(`${countLabel} penalty strokes`);
    expect(display.insights[1].body.toLowerCase()).not.toContain('a couple of penalties');
    expect(display.insights[1].body).not.toMatch(/costly holes|big numbers|changed quickly/i);
  });

  it('keeps aggregate penalties-only copy penalty-led without hole-level overclaims', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'aggregate-penalties-only',
        primaryKey: 'penalty_damaged',
        tone: 'fix',
        evidenceLevel: 'aggregate_stats',
        modifiers: [],
        displayEvidence: {
          scoreText: '91 (+19)',
          weakestArea: {
            area: 'penalties',
            label: 'Penalty Control',
            valueText: '-2.4 SG penalties',
            detailText: 'Penalty strokes: 4.',
          },
          hbhStory: undefined,
        },
      }),
    );

    const copy = display.insights.slice(0, 2).map((insight) => insight.body).join(' ');
    expect(copy).toContain('Penalty strokes were the clearest scoring issue.');
    expect(copy).toContain('Four penalty strokes were recorded.');
    expect(copy).not.toMatch(/big numbers|costly holes|changed quickly|several holes|scoring damage came from .*holes/i);
  });

  it.each([
    {
      area: 'putting' as const,
      label: 'Putting',
      valueText: '-1.2 SG putting',
      detailText: 'Putts: 37 (2.06 per hole).',
      secondary: 'Putting also cost strokes, but penalties had the clearest impact on the score.',
    },
    {
      area: 'approach' as const,
      label: 'Approach Play',
      valueText: '-1.4 SG approach',
      detailText: 'Greens in regulation: 4/18 (22%).',
      secondary: 'Approach play also cost strokes, but penalties had the clearest impact on the score.',
    },
  ])('keeps penalty-damaged M2 penalty-led when $label is secondary', ({ area, label, valueText, detailText, secondary }) => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: `penalty-secondary-${area}`,
        primaryKey: 'penalty_damaged',
        tone: 'fix',
        evidenceLevel: 'aggregate_stats',
        modifiers: [],
        displayEvidence: {
          scoreText: '91 (+19)',
          strongestArea: {
            area: 'penalties',
            label: 'Penalty Control',
            valueText: '-2.4 SG penalties',
            detailText: 'Penalty strokes: 4.',
          },
          weakestArea: {
            area,
            label,
            valueText,
            detailText,
          },
          hbhStory: undefined,
        },
      }),
    );

    expect(display.insights[1].body).toContain('Penalty strokes were the clearest scoring issue.');
    expect(display.insights[1].body).toContain(secondary);
    expect(display.insights[1].body).not.toMatch(/Putting was the clearest leak|Approach play was the clearest leak|clearest leak/i);
  });

  it('does not invent untracked categories for partial aggregate penalties', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'partial-aggregate-penalties',
        primaryKey: 'penalty_damaged',
        tone: 'fix',
        evidenceLevel: 'aggregate_stats',
        modifiers: [],
        displayEvidence: {
          scoreText: '46 (+10)',
          weakestArea: {
            area: 'penalties',
            label: 'Penalty Control',
            valueText: '-1.1 SG penalties',
            detailText: 'Penalty strokes: 2.',
          },
          hbhStory: undefined,
        },
      }),
    );

    expect(display.insights[1].body).toContain('Penalty strokes were the clearest scoring issue.');
    expect(display.insights[1].body).toContain('Two penalty strokes were recorded.');
    expect(display.insights[1].body).not.toMatch(/putting|approach|off the tee|short game|big numbers|costly holes/i);
  });

  it('penalty-damaged with repeated big holes suppresses bounce-back and uses plural big-number M3', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'penalty_damaged',
        tone: 'fix',
        modifiers: ['bounce_back', 'blow_up_stretch'],
        displayEvidence: {
          scoreText: '50 (+15)',
          baselineDeltaText: '5.1 strokes above your recent average of 44.9.',
          strongestArea: {
            area: 'penalties',
            label: 'Penalty Control',
            valueText: '-2.9 SG penalties',
            detailText: 'Penalty strokes: 4.',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '4 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      }),
    );

    expect(
      matchesAny(display.insights[0].body, [
        /penalties and costly holes drove the score more than the smaller misses/i,
        /round changed quickly when penalties and big numbers showed up/i,
        /most of the extra strokes came from penalties and costly holes/i,
        /less about small misses and more about the holes where penalties and doubles stacked up/i,
        /penalty strokes and big holes added most of the extra strokes/i,
      ]),
    ).toBe(true);
    expect(display.insights[0].body.toLowerCase()).not.toContain('recovered after mistakes');
    expect(display.insights[0].body.toLowerCase()).not.toContain('repeated bogeys');
    expect(display.insights[1].body).toMatch(/four(?: costly)? holes|4 holes|round got away/i);
    expect(display.insights[1].body).toMatch(/penalties and doubles|penalties made those holes harder|penalty strokes entered the hole/i);
    expect(display.insights[1].body.toLowerCase()).not.toMatch(/big-number holes.*big-number holes/);
    const allCards = display.insights.map((insight) => insight.body.toLowerCase()).join(' ');
    const bigNumberMentions = (allCards.match(/big-number holes/g) ?? []).length;
    expect(bigNumberMentions).toBeLessThanOrEqual(1);
    expect(display.insights[2].body).toMatch(
      /protect against the big-number holes first|make the recovery shot boring|protect bogey first|choose the safe exit earlier/i,
    );
  });

  it('uses deterministic big-number variation by inputHash and stable output per hash', () => {
    const makeIdentity = (inputHash: string) =>
      baseIdentity({
        inputHash,
        primaryKey: 'penalty_damaged',
        tone: 'fix',
        displayEvidence: {
          scoreText: '50 (+15)',
          baselineDeltaText: '5.1 strokes above your recent average of 44.9.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Big Numbers',
            valueText: '4 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      });

    const a1 = composeRoundIdentityDisplay(makeIdentity('hash-a'));
    const a2 = composeRoundIdentityDisplay(makeIdentity('hash-a'));
    const b = composeRoundIdentityDisplay(makeIdentity('hash-b'));

    expect(a1.insights[0].body).toBe(a2.insights[0].body);
    expect(a1.insights[1].body).toBe(a2.insights[1].body);
    expect(a1.insights[2].body).toBe(a2.insights[2].body);
    expect(
      a1.insights[0].body !== b.insights[0].body ||
        a1.insights[1].body !== b.insights[1].body ||
        a1.insights[2].body !== b.insights[2].body,
    ).toBe(true);
  });

  it('keeps sampled identity variants evidence-safe and grammatically polished', () => {
    const cases: Array<Partial<RoundIdentity>> = [
      {
        primaryKey: 'breakthrough',
        tone: 'repeat',
        modifiers: [],
      },
      {
        primaryKey: 'tee_controlled',
        tone: 'repeat',
        modifiers: [],
        displayEvidence: {
          scoreText: '80 (+8)',
          strongestArea: {
            area: 'off_tee',
            label: 'Off The Tee',
            valueText: '+1.0 SG off tee',
            detailText: 'Fairways hit: 10/14 (71%).',
          },
        },
      },
      {
        primaryKey: 'tee_trouble',
        tone: 'fix',
        modifiers: [],
        displayEvidence: {
          scoreText: '88 (+16)',
          weakestArea: {
            area: 'off_tee',
            label: 'Off The Tee',
            valueText: '-1.2 SG off tee',
            detailText: 'Fairways hit: 3/14 (21%).',
          },
        },
      },
      {
        primaryKey: 'short_game_rescue',
        tone: 'repeat',
        modifiers: [],
        displayEvidence: {
          scoreText: '80 (+8)',
          strongestArea: {
            area: 'short_game',
            label: 'Short Game',
            valueText: '+1.0 SG short game',
            detailText: 'Short-game shots: 8.',
          },
        },
      },
      {
        primaryKey: 'short_game_pressure',
        tone: 'fix',
        modifiers: [],
        displayEvidence: {
          scoreText: '88 (+16)',
          weakestArea: {
            area: 'short_game',
            label: 'Short Game',
            valueText: '-1.2 SG short game',
            detailText: 'Short-game shots: 15.',
          },
        },
      },
    ];
    const unsafe = /above your usual range|recovery spots|awkward positions|playing from defense|difficult recover|tough saves|a couple penalties|a couple holes|one lucky area|entered the round/i;
    const sampledCopy: string[] = [];

    for (const testCase of cases) {
      for (let index = 0; index < 128; index += 1) {
        const display = composeRoundIdentityDisplay(
          baseIdentity({
            ...testCase,
            inputHash: `copy-trust-${testCase.primaryKey}-${index}`,
          }),
        );
        const copy = display.insights.map((insight) => insight.body).join(' ');
        sampledCopy.push(copy);
        expect(copy).not.toMatch(unsafe);
      }
    }

    expect(sampledCopy.some((copy) => copy.includes('Off the Tee'))).toBe(true);
  });

  it('keeps M1, M2, and M3 deterministic per hash across stable inputs', () => {
    const mk = (inputHash: string) =>
      baseIdentity({
        inputHash,
        primaryKey: 'approach_leak',
        tone: 'fix',
        displayEvidence: {
          scoreText: '88 (+16)',
          baselineDeltaText: '3.0 strokes above your recent average of 85.0.',
          weakestArea: {
            area: 'approach',
            label: 'Approach Play',
            valueText: '-1.2 SG approach',
            detailText: 'Greens in regulation: 3/18 (17%).',
          },
        },
      });

    const a = composeRoundIdentityDisplay(mk('deterministic-a'));
    const a2 = composeRoundIdentityDisplay(mk('deterministic-a'));
    const b = composeRoundIdentityDisplay(mk('deterministic-b'));

    expect(a.insights[0].body).toBe(a2.insights[0].body);
    expect(a.insights[1].body).toBe(a2.insights[1].body);
    expect(a.insights[2].body).toBe(a2.insights[2].body);
    expect(a.insights.map((x) => x.body).join(' ')).not.toBe(b.insights.map((x) => x.body).join(' '));
  });

  it('falls back to first variant when inputHash is missing', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: '',
        primaryKey: 'penalty_damaged',
        tone: 'fix',
        displayEvidence: {
          scoreText: '50 (+15)',
          baselineDeltaText: '5.1 strokes above your recent average of 44.9.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Big Numbers',
            valueText: '4 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      }),
    );

    expect(display.insights[0].body).toContain('Big numbers shaped the round more than the routine holes.');
    expect(display.insights[0].body).not.toMatch(/penalties/i);
  });

  it('limits M1 to one modifier add-on sentence when many modifiers are present', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        tone: 'repeat',
        modifiers: ['slow_start_strong_finish', 'bounce_back', 'par_3_problem', 'repeated_bogeys', 'no_damage'],
        displayEvidence: {
          scoreText: '83 (+11)',
          baselineDeltaText: '1.2 strokes above your recent average of 81.8.',
          hbhStory: {
            label: 'Steady with a momentum shift',
            detailText: 'You played the last six holes three strokes better than the first six.',
          },
        },
      }),
    );

    const m1 = display.insights[0].body;
    expect(m1).toContain('You shot 83 (+11), which was 1.2 strokes above your recent average of 81.8.');
    expect(m1).toMatch(/steady round with limited momentum swings|staying fairly even|mostly under control|scorecard was steady enough|more about consistency/i);
    expect(m1).toContain('The round got better as it went, which is a useful signal.');
    expect(m1).not.toContain('Par 3s created more pressure');
    expect(m1).not.toContain('recovered after mistakes');
    expect(m1).not.toContain('repeated bogeys');
  });

  it('big-number rounds with one dominant hole keep one-hole M3 language', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'big_number',
        tone: 'fix',
        displayEvidence: {
          scoreText: '89 (+17)',
          baselineDeltaText: '4.0 strokes above your recent average of 85.0.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: 'One double-or-worse hole',
            detailText: 'One hole accounted for 42% of total over-par damage.',
          },
        },
      }),
    );

    expect(display.insights[2].body).toMatch(
      /protect against the one hole|one hole starts going sideways|one mistake from turning into a big number|one bad hole from becoming the round's main memory/i,
    );
  });

  it('adds HBH-specific language for volatile and big-number patterns', () => {
    const volatileDisplay = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'volatile_scoring',
        evidenceLevel: 'hole_by_hole',
        modifiers: ['one_hole_damage', 'bounce_back'],
        displayEvidence: {
          scoreText: '84 (+12)',
          hbhStory: {
            label: 'Scoring upside with costly holes',
            detailText: 'You had 2 birdies and 3 double-or-worse holes.',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '3 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      }),
    );
    const bigNumberDisplay = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'big_number',
        evidenceLevel: 'hole_by_hole',
        modifiers: ['blow_up_stretch'],
        displayEvidence: {
          scoreText: '89 (+17)',
          hbhStory: {
            label: 'Costly holes',
            detailText: 'Four double-or-worse holes shaped the round.',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '4 double-or-worse holes',
            detailText: 'One hole accounted for 42% of total over-par damage.',
          },
        },
      }),
    );

    expect(allCopy(volatileDisplay)).toMatch(/birdies|double-or-worse|damage|costly/);
    expect(allCopy(bigNumberDisplay)).toMatch(/double-or-worse|damage|hole/);
  });

  it('balances positive-total volatile rounds before coaching the damage', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'volatile_scoring',
        tone: 'build',
        overallTone: 'success',
        modifiers: ['one_hole_damage'],
        displayEvidence: {
          scoreText: '77 (+7)',
          baselineDeltaText: '5.6 strokes better than your recent average of 82.6.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+3.9 SG putting',
            detailText: 'Putts: 31 (1.72 per hole).',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '2 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      }),
    );

    expect(display.insights[0].level).toBe('success');
    expect(display.insights[0].body).toMatch(/good holes won out|positive round overall|good golf to stay ahead/i);
    expect(display.insights[0].body).not.toMatch(/benchmark/i);
    expect(display.insights[1].level).toBe('success');
    expect(display.insights[1].body).toMatch(
      /strongest area|biggest lift|clearest strength/i,
    );
    expect(display.insights[1].body).not.toMatch(/benchmark/i);
    expect(display.insights[2].level).toBe('info');
  });

  it('uses positive result-local copy without historical comparison when no recent baseline exists', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'positive-no-recent-baseline',
        primaryKey: 'approach_leak',
        tone: 'fix',
        overallTone: 'success',
        modifiers: [],
        displayEvidence: {
          scoreText: '80 (+8)',
          weakestArea: {
            area: 'approach',
            label: 'Approach Play',
            valueText: '-1.1 SG approach',
            detailText: 'Greens in regulation: 5/18 (28%).',
          },
        },
      }),
    );

    expect(display.insights[0].body).toMatch(/positive round overall|positive result overall|finished above expectation|stronger parts/i);
    expect(display.insights[0].body).not.toMatch(/recent form|recent average|benchmark/i);
  });

  it('keeps positive HBH costly-hole copy clear without benchmark wording', () => {
    const bodies = Array.from({ length: 96 }, (_, index) =>
      composeRoundIdentityDisplay(
        baseIdentity({
          inputHash: `positive-costly-hbh-${index}`,
          primaryKey: 'volatile_scoring',
          tone: 'build',
          overallTone: 'success',
          modifiers: ['one_hole_damage'],
          evidenceLevel: 'hole_by_hole',
          displayEvidence: {
            scoreText: '77 (+7)',
            baselineDeltaText: '5.6 strokes better than your recent average of 82.6.',
            strongestArea: {
              area: 'putting',
              label: 'Putting',
              valueText: '+3.9 SG putting',
              detailText: 'Putts: 31 (1.72 per hole).',
            },
            weakestArea: {
              area: 'big_numbers',
              label: 'Concentrated Damage',
              valueText: 'Two double-or-worse holes',
              detailText: 'Big numbers shaped too much of the final score.',
            },
          },
        }),
      ).insights[0].body,
    );

    expect(bodies.some((body) => body.includes('This was a positive round overall, even with a few costly holes.'))).toBe(true);
    expect(bodies.join(' ')).not.toMatch(/benchmark/i);
  });

  it('keeps aggregate positive result copy clear without hole-level benchmark wording', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'positive-aggregate-copy',
        primaryKey: 'approach_leak',
        tone: 'fix',
        overallTone: 'success',
        evidenceLevel: 'aggregate_stats',
        modifiers: [],
        displayEvidence: {
          scoreText: '80 (+8)',
          baselineDeltaText: '2 strokes better than your recent average of 82.0.',
          weakestArea: {
            area: 'approach',
            label: 'Approach Play',
            valueText: '-1.1 SG approach',
            detailText: 'Greens in regulation: 5/18 (28%).',
          },
        },
      }),
    );

    expect(display.insights[0].body).toMatch(/positive round overall|positive result overall|finished above expectation|stronger parts/i);
    expect(display.insights[0].body).not.toMatch(/benchmark|costly holes|big numbers/i);
  });

  it('does not expose benchmark wording in composed user-facing round identity copy', () => {
    const identities: RoundIdentity[] = [
      baseIdentity({
        inputHash: 'no-benchmark-positive-corrective',
        primaryKey: 'approach_leak',
        tone: 'fix',
        overallTone: 'success',
        displayEvidence: {
          scoreText: '80 (+8)',
          baselineDeltaText: '2 strokes better than your recent average of 82.0.',
          weakestArea: {
            area: 'approach',
            label: 'Approach Play',
            valueText: '-1.1 SG approach',
            detailText: 'Greens in regulation: 5/18 (28%).',
          },
        },
      }),
      baseIdentity({
        inputHash: 'no-benchmark-volatile-positive',
        primaryKey: 'volatile_scoring',
        tone: 'build',
        overallTone: 'success',
        modifiers: ['one_hole_damage'],
        displayEvidence: {
          scoreText: '77 (+7)',
          baselineDeltaText: '5.6 strokes better than your recent average of 82.6.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+3.9 SG putting',
            detailText: 'Putts: 31 (1.72 per hole).',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: 'Two double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      }),
      baseIdentity({
        inputHash: 'no-benchmark-putting-strength',
        primaryKey: 'putting_saved',
        tone: 'repeat',
        overallTone: 'success',
        displayEvidence: {
          scoreText: '76 (+6)',
          baselineDeltaText: '18.6 strokes better than your recent average of 94.6.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+6.9 SG putting',
            detailText: 'Putts: 27 (1.50 per hole).',
          },
        },
      }),
    ];
    const copy = identities.flatMap((identity) =>
      Array.from({ length: 96 }, (_, index) =>
        allCopy(composeRoundIdentityDisplay({ ...identity, inputHash: `${identity.inputHash}-${index}` })),
      ),
    ).join(' ');

    expect(copy).not.toMatch(/\b(your benchmark|the benchmark|benchmark)\b/i);
  });

  it('approach-carried rounds mention approach or GIR evidence', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'approach_carried',
        tone: 'repeat',
        displayEvidence: {
          scoreText: '81 (+9)',
          baselineDeltaText: '2.4 strokes better than your recent average of 83.4.',
          strongestArea: {
            area: 'approach',
            label: 'Approach Play',
            valueText: '+1.6 SG approach',
            detailText: 'Greens in regulation: 10/18 (56%).',
          },
        },
      }),
    );

    expect(display.insights[1].body).toMatch(/Approach play gave the round structure/i);
    expect(display.insights[1].body).toMatch(/Hitting 10 of 18 greens/i);
  });

  it('keeps approach_leak framing primary when big-number holes are supporting damage', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'approach_leak',
        tone: 'fix',
        displayEvidence: {
          scoreText: '50 (+15)',
          baselineDeltaText: '5.1 strokes above your recent average of 44.9.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Big Numbers',
            valueText: '3 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      }),
    );

    expect(display.insights[0].body).toMatch(
      /approach misses created too much pressure|round got harder because too many approaches left work to do|missed greens put the score under pressure too often|approach play left the round relying on too many recovery shots|too many holes became harder than they needed to be after the approach shot/i,
    );
    expect(display.insights[1].body).toMatch(/three(?: costly)? holes|3 holes|round got away/i);
    expect(display.insights[1].body).toMatch(/missed greens|approach misses/i);
    expect(display.insights[2].body).toMatch(
      /prioritize getting approaches on or near the green|part of the green that keeps the miss playable|approach goal simple: on the green or near it|choose approach targets that reduce the need for a tough save/i,
    );
    expect(display.insights[0].body.toLowerCase()).not.toContain('penalties and big numbers shaped');
    expect(display.insights[1].body.toLowerCase()).not.toContain('penalties and doubles made the score climb quickly');
  });

  it('does not use penalty-dominant wording when penalties are low in approach-leak scenarios', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'approach_leak',
        tone: 'fix',
        displayEvidence: {
          scoreText: '88 (+16)',
          baselineDeltaText: '3.0 strokes above your recent average of 85.0.',
          weakestArea: {
            area: 'approach',
            label: 'Approach Play',
            valueText: '-1.2 SG approach',
            detailText: 'Greens in regulation: 3/18 (17%). Penalty strokes: 1.',
          },
        },
      }),
    );

    const copy = allCopy(display);
    expect(copy).not.toContain('penalties and big numbers shaped the round');
    expect(copy).not.toContain('score was shaped by penalty trouble');
  });

  it('polishes M1 fallback tone for key non-breakthrough archetypes', () => {
    const cases: Array<{ key: RoundIdentity['primaryKey']; pattern: RegExp }> = [
      { key: 'all_around_strong', pattern: /not carried by one area|balanced golf|support from multiple areas|several parts of your game held up|more than one reason the score stayed strong/i },
      { key: 'survival', pattern: /held-together round|costly holes never fully took over|not clean, but you kept it from fully slipping away|rough stretches never completely took over|did enough mistake control|never fully unraveled/i },
      { key: 'penalty_damaged', pattern: /penalty trouble changed the score more than the smaller misses|penalty strokes added more strokes than the smaller misses did|penalties made the score climb faster|score got more expensive when penalty strokes appeared|changed the score the quickest/i },
      { key: 'putting_leak', pattern: /mostly on the greens|too many strokes stayed behind|putting made it harder|needed more from the putter|putting held the score back/i },
      { key: 'scoring_chance_missed', pattern: /story was conversion|chances were there, but enough of them slipped away|had scoring chances|enough looks to score better|final number suggests/i },
      { key: 'everything_leaked', pattern: /no single issue explains this one|too many parts of the game leaked at once|several smaller problems stacking together|not one clean fix|more than one part of the game was under pressure/i },
    ];

    for (const item of cases) {
      const display = composeRoundIdentityDisplay(
        baseIdentity({
          primaryKey: item.key,
          tone: item.key === 'all_around_strong' ? 'repeat' : 'fix',
          displayEvidence: {
            scoreText: '85 (+13)',
            baselineDeltaText: '2.0 strokes above your recent average of 83.0.',
          },
        }),
      );
      expect(display.insights[0].body).toMatch(item.pattern);
    }
  });

  it('uses balance language for all-around-strong M2 fallback', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'all_around_strong',
        tone: 'repeat',
        displayEvidence: {
          scoreText: '79 (+7)',
          baselineDeltaText: '4.1 strokes better than your recent average of 83.1.',
        },
      }),
    );

    expect(display.insights[1].body).toMatch(/strength was balance/i);
    expect(display.insights[1].body).toMatch(/no single area had to carry the round/i);
  });

  it('uses multi-area leak language for everything-leaked fallback', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'everything_leaked',
        tone: 'fix',
        displayEvidence: {
          scoreText: '94 (+22)',
          baselineDeltaText: '8.0 strokes above your recent average of 86.0.',
        },
      }),
    );

    expect(display.insights[1].body).toMatch(/useful takeaway is to simplify/i);
    expect(display.insights[1].body).toMatch(/pick the easiest leak to control first/i);
  });

  it('uses golfer-native generic summary fallback without internal wording', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'survival',
        tone: 'build',
        displayEvidence: {
          scoreText: '86 (+14)',
          baselineDeltaText: '0.6 strokes above your recent average of 85.4.',
        },
      }),
    );

    expect(display.insights[1].body).toMatch(/score is clearer than the cause/i);
    expect(display.insights[1].body).toMatch(/one more reliable stat is needed/i);
    expect(display.insights[1].body.toLowerCase()).not.toContain('single driver');
  });

  it('uses updated build fallback wording', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'survival',
        tone: 'build',
        displayEvidence: {
          scoreText: '88 (+16)',
          baselineDeltaText: '2.2 strokes above your recent average of 85.8.',
        },
      }),
    );

    expect(display.insights[2].body).toMatch(
      /same pattern shows up again|same pattern again|tracking the same basics|one more round before making a big conclusion/i,
    );
  });

  it('uses modifier-aware copy for par-3 and par-5 stories', () => {
    const par3 = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        tone: 'repeat',
        modifiers: ['par_3_problem'],
      }),
    );
    const par5 = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        tone: 'repeat',
        modifiers: ['par_5_scoring'],
      }),
    );

    expect(par3.insights[0].body).toMatch(/par 3s created more pressure/i);
    expect(par3.insights[2].body).toMatch(/treat par 3s as score-protection holes|play the par 3s for the middle of the green|make par 3s boring first|give the par 3s more respect/i);
    expect(par5.insights[0].body).toMatch(/par 5 scoring helped keep the round moving|par 5s gave the round some needed help|got enough out of the par 5s|longer scoring holes helped balance the round/i);
    expect(par5.insights[2].body).toMatch(/keep leaning on par 5 scoring|using the par 5s as scoring chances|let the par 5s help the score again|par 5 scoring pattern/i);
  });

  it('uses modifier-aware copy for bounce-back and repeated bogeys', () => {
    const bounce = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        tone: 'repeat',
        modifiers: ['bounce_back'],
      }),
    );
    const repeated = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        tone: 'repeat',
        modifiers: ['repeated_bogeys'],
        displayEvidence: {
          scoreText: '82 (+10)',
          baselineDeltaText: '1.8 strokes better than your recent average of 83.8.',
        },
      }),
    );

    expect(bounce.insights[0].body).toMatch(/recovered after mistakes|response after mistakes helped keep the round|did enough after the bad holes|mistakes happened, but the next holes did not automatically get worse/i);
    expect(repeated.insights[0].body).toMatch(/repeated bogeys|steady bogeys|bogeys kept adding up|repeated small leaks/i);
    expect(repeated.insights[2].body).toMatch(/stop the bogey stretches early|break up the bogey runs|after one bogey, make the next hole simple|bogeys stacking quietly/i);
  });

  it('suppresses bounce-back wording when repeated damage dominates', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        tone: 'repeat',
        modifiers: ['bounce_back', 'blow_up_stretch'],
        displayEvidence: {
          scoreText: '84 (+12)',
          baselineDeltaText: '0.9 strokes better than your recent average of 84.9.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '3 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      }),
    );

    expect(display.insights[0].body.toLowerCase()).not.toContain('recovered after mistakes');
    expect(display.insights[2].body).toMatch(
      /protecting against the big numbers|keep the parts that worked and make the doubles harder|protect the good holes by keeping the costly ones closer to bogey|keep the good pattern and make those costly holes less expensive/i,
    );
  });

  it('keeps score-only copy safe while varying sparse prompts', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'score_only_baseline',
        evidenceLevel: 'score_only',
        tone: 'explain',
        modifiers: [],
        displayEvidence: {
          scoreText: '92 (+20)',
        },
      }),
    );
    const copy = allCopy(display);
    expect(copy).toMatch(/starting point/);
    expect(copy).toMatch(/optional stats|extra stat|putts or greens/);
    expect(copy).not.toMatch(/approach carried|putting was the clearest leak|tee shots made/i);
  });

  it('does not leak raw archetype labels or snake_case modifier names', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        modifiers: ['putting_conversion_issue', 'tee_accuracy_leak', 'repeated_bogeys'],
        shapedBy: ['Primary story: Steady Scoring Round.', 'Round detail: putting_conversion_issue.'],
      }),
    );

    const combined = allCopy(display);
    expect(combined).not.toContain('primary story');
    expect(combined).not.toContain('round detail');
    expect(combined).not.toContain('putting_conversion_issue');
    expect(combined).not.toContain('tee_accuracy_leak');
  });

  it('contains no em dash characters in composed copy', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'breakthrough',
        tone: 'repeat',
        modifiers: ['one_hole_damage'],
      }),
    );
    const combined = [
      display.headline,
      display.subhead,
      display.confidenceText,
      display.progressText,
      ...display.insights.map((insight) => `${insight.title} ${insight.body}`),
    ]
      .filter(Boolean)
      .join(' ');
    expect(combined).not.toContain('—');
    expect(combined).not.toContain('—');
  });

  it('avoids generic filler when strong evidence exists', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'breakthrough',
        tone: 'repeat',
        confidence: 'strong',
        displayEvidence: {
          scoreText: '76 (+6)',
          baselineDeltaText: '18.6 strokes better than your recent average of 94.6.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+6.9 SG putting',
            detailText: 'Putts: 27 (1.50 per hole).',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '2 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      }),
    );

    const copy = allCopy(display);
    expect(copy).not.toContain('repeatable pieces');
    expect(copy).not.toContain('promising signal');
    expect(copy).not.toContain('confirm it across');
    expect(copy).not.toContain('profile can go even lower');
  });

  it('keeps the career-best breakthrough wording stable', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'breakthrough',
        tone: 'repeat',
        modifiers: ['one_hole_damage'],
        displayEvidence: {
          scoreText: '76 (+6)',
          baselineDeltaText: '18.6 strokes better than your recent average of 94.6.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+6.9 SG putting',
            detailText: 'Putts: 27 (1.50 per hole).',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '2 double-or-worse holes',
            detailText: 'One hole accounted for 33% of total over-par damage.',
          },
          hbhStory: {
            label: 'Scoring upside with costly holes',
            detailText: 'You had 3 birdies and 2 double-or-worse holes.',
          },
        },
      }),
    );

    expect(display.insights[0].body).toMatch(/You shot 76 \(\+6\), which was 18\.6 strokes better than your recent average of 94\.6/i);
    expect(display.insights[0].body).toMatch(
      /enough good holes to outweigh a couple of costly mistakes|good holes outweighed the costly ones|couple of mistakes, this score was clearly ahead|costly holes showed up, but they did not define the round/i,
    );
    expect(display.insights[1].body).toMatch(
      /strongest area|biggest lift|clearest strength/i,
    );
    expect(display.insights[1].body).not.toMatch(/benchmark/i);
    expect(display.insights[2].body).toMatch(
      /keep giving yourself scoring chances while protecting against the big numbers|keep the parts that worked and make the doubles harder to find|protect the good holes by keeping the costly ones closer to bogey|keep the good pattern and make those costly holes less expensive/i,
    );
  });

  it('keeps clean breakthrough HBH detail out of damage wording', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'clean-breakthrough-hbh',
        primaryKey: 'breakthrough',
        tone: 'repeat',
        modifiers: ['no_damage'],
        displayEvidence: {
          scoreText: '68 (-4)',
          baselineDeltaText: '17 strokes better than your recent average of 85.',
          strongestArea: {
            area: 'approach',
            label: 'Approach Play',
            valueText: '+1.2 SG approach',
            detailText: 'Greens in regulation: 16/18 (89%).',
          },
          hbhStory: {
            label: 'Low-damage scorecard',
            detailText: 'You avoided doubles or worse across the round.',
          },
        },
      }),
    );

    const story = display.insights[0].body.toLowerCase();
    expect(story).toContain('you shot 68 (-4), which was 17 strokes better than your recent average of 85');
    expect(story).not.toMatch(/costly|damage|offset|not all bad|surviv/i);
  });

  it('uses singular positive-first breakthrough wording with one costly hole', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'breakthrough-one-costly-hole',
        primaryKey: 'breakthrough',
        tone: 'repeat',
        modifiers: ['one_hole_damage'],
        displayEvidence: {
          scoreText: '70 (-2)',
          baselineDeltaText: '12 strokes better than your recent average of 82.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: 'One double-or-worse hole',
            detailText: 'One costly hole added most of the extra strokes.',
          },
          hbhStory: {
            label: 'Scoring upside with costly holes',
            detailText: 'You had 4 birdies and one double-or-worse hole.',
          },
        },
      }),
    );

    const story = display.insights[0].body;
    expect(story).toMatch(/You shot 70 \(-2\), which was 12 strokes better/i);
    expect(story).toMatch(/one costly hole/i);
    expect(story).not.toMatch(/couple|costly holes|those holes/i);
  });

  it('keeps breakthrough with penalties positive-first without inventing costly holes', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'breakthrough-penalties',
        primaryKey: 'breakthrough',
        tone: 'repeat',
        displayEvidence: {
          scoreText: '72 (E)',
          baselineDeltaText: '10 strokes better than your recent average of 82.',
          weakestArea: {
            area: 'penalties',
            label: 'Penalty Control',
            valueText: '2 penalties',
            detailText: 'Penalty strokes: 2.',
          },
        },
      }),
    );

    const story = display.insights[0].body;
    expect(story).toMatch(/You shot 72 \(E\), which was 10 strokes better/i);
    expect(story).toMatch(/Penalty strokes|penalty trouble/i);
    expect(story).not.toMatch(/costly hole/i);
  });

  it('keeps breakthrough with multiple costly holes on the supported damage branch', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'breakthrough-multiple-costly-holes',
        primaryKey: 'breakthrough',
        tone: 'repeat',
        displayEvidence: {
          scoreText: '74 (+2)',
          baselineDeltaText: '11 strokes better than your recent average of 85.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: 'Two double-or-worse holes',
            detailText: 'Two costly holes added most of the extra strokes.',
          },
          hbhStory: {
            label: 'Scoring upside with costly holes',
            detailText: 'You had 5 birdies and two double-or-worse holes.',
          },
        },
      }),
    );

    const story = display.insights[0].body;
    expect(story).toMatch(/You shot 74 \(\+2\), which was 11 strokes better/i);
    expect(story).toMatch(/costly|mistakes|damage/i);
    expect(story).not.toMatch(/one costly hole/i);
  });

  it('replaces the old volatile wording with the tighter costly-holes variant', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'h11',
        primaryKey: 'volatile_scoring',
        tone: 'fix',
        displayEvidence: {
          scoreText: '89 (+17)',
          baselineDeltaText: '4.2 strokes above your recent average of 84.8.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Big Numbers',
            valueText: '3 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
          hbhStory: {
            label: 'Scoring upside with costly holes',
            detailText: 'You had 2 birdies and 3 double-or-worse holes.',
          },
        },
      }),
    );

    const copy = allCopy(display);
    expect(copy).not.toContain(
      'The score was shaped by the holes that got away more than the holes you managed well.',
    );
    expect(display.insights[0].body).toContain('A few costly holes carried too much of the score.');
  });

  it('uses area-aware good_score_bad_process copy for approach weak area', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'g4',
        primaryKey: 'approach_leak',
        tone: 'fix',
        modifiers: ['good_score_bad_process'],
        displayEvidence: {
          scoreText: '84 (+12)',
          baselineDeltaText: '2 strokes better than your recent average of 86.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+0.4 SG putting',
            detailText: 'Putts: 30 (1.67 per hole).',
          },
          weakestArea: {
            area: 'approach',
            label: 'Approach',
            valueText: '-0.8 SG approach',
            detailText: 'Greens in regulation: 6/18 (33%).',
          },
          hbhStory: undefined,
        },
      }),
    );

    expect(display.insights[0].body).toContain('The score improved, but approach play still left too much work.');
    expect(display.insights[0].body).not.toContain('one area still looked less stable');
  });

  it('uses area-aware good_score_bad_process copy for big-number weak area', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'g4',
        primaryKey: 'steady_scoring',
        tone: 'build',
        modifiers: ['good_score_bad_process'],
        displayEvidence: {
          scoreText: '83 (+11)',
          baselineDeltaText: '1 stroke better than your recent average of 84.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+0.3 SG putting',
            detailText: 'Putts: 31 (1.72 per hole).',
          },
          weakestArea: {
            area: 'big_numbers',
            label: 'Big Numbers',
            valueText: 'One double-or-worse hole',
            detailText: 'One costly hole pushed the score higher than needed.',
          },
          hbhStory: undefined,
        },
      }),
    );

    expect(display.insights[0].body).toContain(
      'The score improved, but the costly holes still carried too much of the score.',
    );
  });

  it('uses fallback good_score_bad_process copy when unstable area is unknown', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        inputHash: 'g4',
        primaryKey: 'steady_scoring',
        tone: 'build',
        modifiers: ['good_score_bad_process'],
        displayEvidence: {
          scoreText: '83 (+11)',
          baselineDeltaText: '1 stroke better than your recent average of 84.',
          strongestArea: {
            area: 'putting',
            label: 'Putting',
            valueText: '+0.3 SG putting',
            detailText: 'Putts: 31 (1.72 per hole).',
          },
          weakestArea: undefined,
          hbhStory: undefined,
        },
      }),
    );

    expect(display.insights[0].body).toContain('The score improved, but one part of the game still needs attention.');
  });

  it('removes internal wording phrases from composed copy', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'big_number',
        tone: 'fix',
        displayEvidence: {
          scoreText: '90 (+18)',
          baselineDeltaText: '5.3 strokes above your recent average of 84.7.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Concentrated Damage',
            valueText: '3 double-or-worse holes',
            detailText: 'Big numbers shaped too much of the final score.',
          },
        },
      }),
    );

    const copy = allCopy(display);
    expect(copy).not.toContain('concentrated damage');
    expect(copy).not.toContain('single-stat story');
    expect(copy).not.toContain('round shape');
    expect(copy).not.toContain('single driver');
    expect(copy).not.toContain('real baseline');
    expect(copy).not.toContain('normal misses');
    expect(copy).not.toContain('ordinary mistakes');
    expect(copy).not.toContain('same scoring intent');
    expect(copy).not.toContain('clean area to point to');
    expect(copy).not.toContain('golfiq can call');
    expect(copy).not.toContain('process area');
    expect(copy).not.toContain('the card');
    expect(copy).not.toContain('one more card');
    expect(copy).not.toContain('readable pattern');
    expect(copy).not.toContain('separate from the noise');
    expect(copy).not.toContain('process was not');
    expect(copy).not.toContain('good process piece');
    expect(copy).not.toContain('the number was');
    expect(copy).not.toContain('scoring upside');
    expect(copy).not.toContain('round found its biggest help');
    expect(copy).not.toContain('the greens were a strength');
    expect(copy).not.toContain('the greens were where');
    expect(copy).not.toContain('give damage control the first bit of attention');
    expect(copy).not.toContain('one area still looked less stable');
    expect(copy).not.toContain('the number was good');
  });

  it('does not use profile phrasing in composed copy', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        tone: 'build',
        modifiers: ['repeated_bogeys'],
      }),
    );

    const cardsOnly = display.insights.map((insight) => insight.body.toLowerCase()).join(' ');
    expect(cardsOnly).not.toContain('profile');
    expect(cardsOnly).not.toContain('rest of the profile');
    expect(cardsOnly).not.toContain('scoring profile');
  });

  it('never emits process area in composed M1/M2/M3 output', () => {
    const variants: RoundIdentity['primaryKey'][] = [
      'breakthrough',
      'short_game_rescue',
      'penalty_damaged',
      'everything_leaked',
      'score_only_baseline',
    ];

    for (const key of variants) {
      const display = composeRoundIdentityDisplay(
        baseIdentity({
          primaryKey: key,
          tone: key === 'score_only_baseline' ? 'explain' : key === 'breakthrough' ? 'repeat' : 'fix',
          modifiers: ['good_score_bad_process'],
          displayEvidence: {
            scoreText: '84 (+12)',
            baselineDeltaText: '1.0 stroke above your recent average of 83.0.',
            weakestArea: {
              area: 'big_numbers',
              label: 'Big Numbers',
              valueText: '2 double-or-worse holes',
              detailText: 'Two costly holes added most of the extra strokes.',
            },
          },
        }),
      );
      expect(allCopy(display)).not.toContain('process area');
    }
  });

  it('keeps every identity variant within canonical copy, style, and length safeguards', () => {
    const unsafeCopy =
      /process area|recovery spots|stay patient|find your rhythm|settled in|club selection|make the couple|\b[a-z]+_[a-z_]+\b|—|—/i;
    const primaryKeys = Object.keys(TONE_BY_PRIMARY) as RoundIdentityPrimaryKey[];

    expect(primaryKeys).toHaveLength(20);

    for (const primaryKey of primaryKeys) {
      for (let variant = 0; variant < 128; variant += 1) {
        const isScoreOnly = primaryKey === 'score_only_baseline';
        const display = composeRoundIdentityDisplay(
          baseIdentity({
            inputHash: `${primaryKey}-${variant}`,
            primaryKey,
            tone: TONE_BY_PRIMARY[primaryKey],
            evidenceLevel: isScoreOnly ? 'score_only' : 'hole_by_hole',
            modifiers: isScoreOnly
              ? []
              : [
                  'one_hole_damage',
                  'blow_up_stretch',
                  'bounce_back',
                  'fast_start_slow_finish',
                  'slow_start_strong_finish',
                  'par_3_problem',
                  'par_5_scoring',
                  'repeated_bogeys',
                ],
            displayEvidence: isScoreOnly
              ? { scoreText: '90 (+18)' }
              : baseIdentity().displayEvidence,
          }),
        );

        expect(display.insights).toHaveLength(3);
        for (const insight of display.insights) {
          expect(insight.body.trim().length).toBeGreaterThan(0);
          expect(insight.body.length).toBeLessThanOrEqual(POST_ROUND_MESSAGE_MAX_CHARS);
          expect(insight.body).not.toMatch(unsafeCopy);
        }
      }
    }
  });

  it('exercises modifier branches individually without inferred rhythm or mindset language', () => {
    const modifiers: RoundIdentity['modifiers'][number][] = [
      'fast_start_slow_finish',
      'slow_start_strong_finish',
      'par_5_scoring',
      'no_damage',
      'bounce_back',
    ];

    for (const modifier of modifiers) {
      for (let variant = 0; variant < 128; variant += 1) {
        const display = composeRoundIdentityDisplay(
          baseIdentity({
            inputHash: `${modifier}-${variant}`,
            primaryKey: 'clean_control',
            tone: 'repeat',
            modifiers: [modifier],
            displayEvidence: {
              scoreText: '79 (+7)',
              baselineDeltaText: '2 strokes better than your recent average of 81.0.',
            },
          }),
        );

        expect(allCopy(display)).not.toMatch(/better rhythm|early rhythm|mindset|discipline|score-protection decisions|same decisions late|trust the reset/i);
      }
    }
  });

  it('keeps putting recommendations evidence-safe without diagnosing pace or start line', () => {
    for (let variant = 0; variant < 128; variant += 1) {
      const display = composeRoundIdentityDisplay(
        baseIdentity({
          inputHash: `putting-fix-${variant}`,
          primaryKey: 'putting_leak',
          tone: 'fix',
          modifiers: [],
          displayEvidence: {
            scoreText: '91 (+19)',
            weakestArea: {
              area: 'putting',
              label: 'Putting',
              valueText: '-1.5 SG putting',
              detailText: 'Putts: 37 (2.06 per hole).',
            },
          },
        }),
      );

      expect(display.insights[2].body).not.toMatch(/first-putt|pace|speed control|three-putt|leave distance|start line/i);
    }
  });

  it('never emits malformed couple phrasing across two-hole damage variants', () => {
    for (let variant = 0; variant < 512; variant += 1) {
      const display = composeRoundIdentityDisplay(
        baseIdentity({
          inputHash: `two-hole-damage-${variant}`,
          primaryKey: 'big_number',
          tone: 'fix',
          modifiers: ['one_hole_damage'],
          displayEvidence: {
            scoreText: '88 (+16)',
            weakestArea: {
              area: 'big_numbers',
              label: 'Concentrated Damage',
              valueText: 'Two double-or-worse holes',
              detailText: 'Two costly holes added most of the extra strokes.',
            },
          },
        }),
      );

      expect(allCopy(display)).not.toMatch(/a couple (?!of\b)|the couple of/i);
    }
  });

  it('never emits known grammar bugs in composed copy', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'penalty_damaged',
        tone: 'fix',
        modifiers: ['one_hole_damage'],
        displayEvidence: {
          scoreText: '90 (+18)',
          baselineDeltaText: '1.0 stroke above your recent average of 89.0.',
          weakestArea: {
            area: 'big_numbers',
            label: 'Big Numbers',
            valueText: 'One double-or-worse hole',
            detailText: 'One costly hole added most of the extra strokes.',
          },
          hbhStory: {
            label: 'Costly holes',
            detailText: 'You had 1 birdie and one double-or-worse hole.',
          },
        },
      }),
    );

    const copy = allCopy(display);
    expect(copy).not.toMatch(/\b1 strokes\b/i);
    expect('5.1 strokes above baseline').toMatch(/\b\d+\.\d+\s+strokes\b/i);
    expect('1 strokes above baseline').toMatch(/\b1 strokes\b/i);
    expect(copy).not.toContain('birdieies');
    expect(copy).not.toContain('1 double-or-worse holes');
    expect(copy).not.toContain('One holes');
    expect(copy).not.toContain('1 holes');
    expect(copy).not.toContain('rest of the card');
  });
});

