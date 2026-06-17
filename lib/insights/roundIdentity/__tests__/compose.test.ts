import { composeRoundIdentityDisplay } from '@/lib/insights/roundIdentity/compose';
import type { RoundIdentity } from '@/lib/insights/roundIdentity/types';

function baseIdentity(overrides: Partial<RoundIdentity> = {}): RoundIdentity {
  return {
    version: 'round_identity_v1.0.0',
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
        label: 'Scoring upside with concentrated damage',
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
    expect(display.insights[0].body).toMatch(/starting point/i);
    expect(display.insights[2].body).toMatch(/optional stats|extra stat|putts or greens/i);
    expect(display.insights[0].body.toLowerCase()).not.toMatch(/approach|putting|off the tee|penalty strokes were/i);
  });

  it('adds first-round framing and progress text', () => {
    const display = composeRoundIdentityDisplay(
      baseIdentity({
        primaryKey: 'steady_scoring',
        sampleContext: 'first_round',
      }),
    );

    expect(display.eyebrow).toBe('Round 1 Logged');
    expect(display.progressText).toMatch(/2 more rounds unlock stronger patterns/i);
  });

  it('uses round-number-based progress text for rounds 1 and 2, and hides it at 3+', () => {
    const first = composeRoundIdentityDisplay(baseIdentity(), { roundNumber: 1 });
    const second = composeRoundIdentityDisplay(baseIdentity(), { roundNumber: 2 });
    const third = composeRoundIdentityDisplay(baseIdentity(), { roundNumber: 3 });

    expect(first.progressText).toBe('2 more rounds unlock stronger patterns.');
    expect(second.progressText).toBe('1 more round unlocks stronger patterns.');
    expect(third.progressText).toBeUndefined();
  });

  it('composes breakthrough copy with repeat tone and concentrated damage as watch item', () => {
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
            label: 'Scoring upside with concentrated damage',
            detailText: 'You had 3 birdies and 2 double-or-worse holes.',
          },
        },
      }),
    );

    expect(display.insights[0].body).toMatch(/18\.6 strokes better than your recent average of 94\.6/i);
    expect(display.insights[1].body).toMatch(/putting was the round's biggest edge|putter gave the round its biggest lift|putting did real work|greens were a strength/i);
    expect(display.insights[1].body).toMatch(/With 27 putts/i);
    expect(display.insights[0].body).toMatch(/breakthrough|broke through|clearly ahead of your usual range|costly holes showed up, but they did not define the round|good holes outweighed the damage/i);
    expect(display.insights[2].title).toMatch(/repeat/i);
    expect(display.insights[2].body).toMatch(
      /big numbers|costly|doubles|make the couple of bad holes less expensive|protect the good holes/i,
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

    expect(display.insights[1].body).toMatch(/Penalty strokes were the clearest leak|Penalty trouble was the clearest leak|penalties made the round more expensive|Penalty strokes changed the score quickly/i);
    expect(display.insights[1].body).toMatch(/manageable holes into big numbers/i);
    expect(display.insights[2].title).toMatch(/watch/i);
    expect(display.insights[2].body).toMatch(/target with the most room/i);
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
        /penalties and big numbers shaped the round more than routine mistakes/i,
        /round changed quickly when penalties and big numbers showed up/i,
        /most of the scoring damage came from penalties and costly holes/i,
        /less about small misses and more about the holes where penalties and doubles stacked up/i,
        /penalty strokes and big holes did most of the scoring damage/i,
      ]),
    ).toBe(true);
    expect(display.insights[0].body.toLowerCase()).not.toContain('recovered after mistakes');
    expect(display.insights[0].body.toLowerCase()).not.toContain('repeated bogeys');
    expect(display.insights[1].body).toMatch(/four holes|4 holes|round got away/i);
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

    expect(display.insights[0].body).toContain('Penalties and big numbers shaped the round more than routine mistakes.');
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
            valueText: '1 double-or-worse hole',
            detailText: 'One hole accounted for 42% of total over-par damage.',
          },
        },
      }),
    );

    expect(display.insights[2].body).toMatch(
      /protect against the one hole|one hole starts going sideways|damage to one mistake|one bad hole from becoming the round's main memory/i,
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
            label: 'Scoring upside with concentrated damage',
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
            label: 'Damage concentration',
            detailText: '4 double-or-worse holes shaped the card.',
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
    expect(display.insights[1].body).toMatch(/three holes|3 holes|round got away/i);
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
      { key: 'all_around_strong', pattern: /not carried by one lucky area|balanced golf|support from multiple areas|several parts of your game held up|more than one reason the score stayed strong/i },
      { key: 'survival', pattern: /held-together round|damage never fully got away|not clean, but you kept it from fully slipping away|rough stretches never completely took over|did enough damage control|never fully unraveled/i },
      { key: 'penalty_damaged', pattern: /penalty trouble changed the score more than routine mistakes|penalty strokes changed the round more than routine mistakes did|penalties made the score climb faster|round got more expensive when penalty strokes entered the round|changed the score the quickest/i },
      { key: 'putting_leak', pattern: /mostly on the greens|too many strokes stayed behind|putting made it harder|needed more from the putter|chances stalled on the greens/i },
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

    expect(display.insights[1].body).toMatch(/score pattern is clearer than the cause/i);
    expect(display.insights[1].body).toMatch(/main reason will be easier to see/i);
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
    expect(par5.insights[2].body).toMatch(/keep leaning on par 5 scoring|using the par 5s as scoring chances|let the par 5s help the score again|par 5 mindset/i);
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

    expect(bounce.insights[0].body).toMatch(/recovered after mistakes|response after mistakes helped keep the round|did enough after the bad holes|mistakes happened, but the next holes were not automatic damage/i);
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
      /protecting against the big numbers|creating scoring chances and make the doubles harder|protect the good holes by keeping the costly ones closer to bogey|keep creating chances and make the couple of bad holes less expensive/i,
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
    expect(combined).not.toContain('â€”');
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
            label: 'Scoring upside with concentrated damage',
            detailText: 'You had 3 birdies and 2 double-or-worse holes.',
          },
        },
      }),
    );

    expect(display.insights[0].body).toMatch(/You shot 76 \(\+6\), which was 18\.6 strokes better than your recent average of 94\.6/i);
    expect(display.insights[0].body).toMatch(
      /enough good holes to outweigh a couple costly mistakes|good holes did more than enough to offset the costly ones|couple mistakes, this score was clearly ahead|costly holes showed up, but they did not define the round|good holes outweighed the damage/i,
    );
    expect(display.insights[1].body).toMatch(
      /With 27 putts, you converted enough chances to support the score|With 27 putts, you saved enough strokes to protect the score|27 putts helped turn chances into better numbers|With 27 putts, you gave the round a scoring boost/i,
    );
    expect(display.insights[2].body).toMatch(
      /keep giving yourself scoring chances while protecting against the big numbers|keep creating scoring chances and make the doubles harder to find|protect the good holes by keeping the costly ones closer to bogey|keep creating chances and make the couple of bad holes less expensive/i,
    );
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
            label: 'Scoring upside with concentrated damage',
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
            valueText: '1 double-or-worse hole',
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
              detailText: 'Two holes did most of the damage.',
            },
          },
        }),
      );
      expect(allCopy(display)).not.toContain('process area');
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
            valueText: '1 double-or-worse hole',
            detailText: 'One costly hole did most of the damage.',
          },
          hbhStory: {
            label: 'Damage concentration',
            detailText: 'You had 1 birdie and 1 double-or-worse hole.',
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

