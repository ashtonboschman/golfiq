import { validateRealizedInsightsV3 } from "../validate";

type Plan = Parameters<typeof validateRealizedInsightsV3>[0];
type Realized = Parameters<typeof validateRealizedInsightsV3>[1];

function makePlan(overrides?: Partial<Plan>): Plan {
  return {
    insights: {
      insight1: { emoji: "✅", maxSentences: 2 },
      insight2: { emoji: "⚠️", maxSentences: 2 },
      insight3: { emoji: "ℹ️", maxSentences: 2 },
    },
    allowedNumbers: [90, 18, 7, 38, 2, 10, 25, 40, 3],
    action: {
      type: "drill",
      stat: null,
      drill: "Lag putt 10 balls from 25 to 40 feet and aim to leave them inside 3 feet.",
    },
    focus: {
      bestName: "approach",
      opportunityName: "putting",
      shortGameInferred: false,
      opportunityIsWeak: true,
      opportunityImpactStrokesRounded: 2,
    },
    allowSgLanguage: true,
    present: { fir: true, gir: true, putts: true, penalties: true },
    ...overrides,
  };
}

function makeRealized(overrides?: Partial<Realized>): Realized {
  return {
    insight1: {
      emoji: "✅",
      text: "You scored 90 and your approach stood out with 7 greens in regulation.",
    },
    insight2: {
      emoji: "⚠️",
      text: "Your putting cost around 2 strokes with 38 putts, which raised your score.",
    },
    insight3: {
      emoji: "ℹ️",
      text: "Next round focus: Lag putt 10 balls from 25 to 40 feet and aim to leave them inside 3 feet. This helps you improve speed control and lower scores.",
    },
    ...overrides,
  };
}

describe("validateRealizedInsightsV3", () => {
  it("passes a valid realized payload", () => {
    const plan = makePlan();
    const realized = makeRealized();
    expect(validateRealizedInsightsV3(plan, realized)).toEqual({ ok: true });
  });

  it("fails when emoji does not match planned emoji", () => {
    const plan = makePlan();
    const realized = makeRealized({
      insight2: { emoji: "✅", text: "Your putting cost around 2 strokes with 38 putts." },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("Emoji mismatch for insight2");
  });

  it("fails when second-person phrasing is missing", () => {
    const plan = makePlan();
    const realized = makeRealized({
      insight1: { emoji: "✅", text: "Approach stood out with 7 greens in regulation." },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("Missing second-person phrasing");
  });

  it("fails when a missing stat area is referenced", () => {
    const plan = makePlan({
      present: { fir: true, gir: true, putts: false, penalties: true },
    });
    const realized = makeRealized({
      insight2: { emoji: "⚠️", text: "Your putting cost around 2 strokes with 38 putts." },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("references putting while putts are missing");
  });

  it("fails in score-only mode when skill areas are attributed", () => {
    const plan = makePlan({
      present: { fir: false, gir: false, putts: false, penalties: false },
      focus: {
        bestName: null,
        opportunityName: null,
        shortGameInferred: false,
        opportunityIsWeak: false,
        opportunityImpactStrokesRounded: null,
      },
    });
    const realized = makeRealized({
      insight1: { emoji: "✅", text: "You scored 90 and your approach was strong." },
      insight2: { emoji: "⚠️", text: "You lost strokes with putting today." },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("references GIR/approach while GIR is missing");
  });

  it("fails when non-weak opportunity uses weakness language", () => {
    const plan = makePlan({
      insights: {
        insight1: { emoji: "✅", maxSentences: 2 },
        insight2: { emoji: "✅", maxSentences: 2 },
        insight3: { emoji: "ℹ️", maxSentences: 2 },
      },
      focus: {
        bestName: "approach",
        opportunityName: "putting",
        shortGameInferred: false,
        opportunityIsWeak: false,
        opportunityImpactStrokesRounded: null,
      },
    });
    const realized = makeRealized({
      insight2: { emoji: "✅", text: "Your putting was weak and cost 2 strokes with 38 putts." },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("weakness language for a non-weak opportunity");
  });

  it("fails when inferred short game message does not use uncertainty wording", () => {
    const plan = makePlan({
      focus: {
        bestName: "approach",
        opportunityName: "short_game",
        shortGameInferred: true,
        opportunityIsWeak: true,
        opportunityImpactStrokesRounded: 3,
      },
      present: { fir: true, gir: true, putts: true, penalties: true },
    });
    const realized = makeRealized({
      insight2: {
        emoji: "⚠️",
        text: "Your short game cost around 3 strokes and dragged your score.",
      },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("must use uncertainty wording");
  });

  it("fails when track action does not include track verb + stat", () => {
    const plan = makePlan({
      action: { type: "track", stat: "putts", drill: null },
      insights: {
        insight1: { emoji: "✅", maxSentences: 2 },
        insight2: { emoji: "⚠️", maxSentences: 2 },
        insight3: { emoji: "ℹ️", maxSentences: 2 },
      },
    });
    const realized = makeRealized({
      insight3: {
        emoji: "ℹ️",
        text: "Next round focus: use a calm routine on the greens. This helps you stay consistent.",
      },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("missing tracking action");
  });

  it("fails drill mode when second sentence impact explanation is missing", () => {
    const plan = makePlan();
    const realized = makeRealized({
      insight3: {
        emoji: "ℹ️",
        text: "Next round focus for you: Lag putt 10 balls from 25 to 40 feet and aim to leave them inside 3 feet.",
      },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("requires a second sentence");
  });

  it("fails weak opportunity when rounded stroke impact language is missing", () => {
    const plan = makePlan({
      focus: {
        bestName: "approach",
        opportunityName: "putting",
        shortGameInferred: false,
        opportunityIsWeak: true,
        opportunityImpactStrokesRounded: 2,
      },
    });
    const realized = makeRealized({
      insight2: {
        emoji: "⚠️",
        text: "Your putting had 38 putts and hurt your score today.",
      },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("approximate rounded stroke impact");
  });

  it("fails measured opportunity when uncertainty wording is used", () => {
    const plan = makePlan({
      focus: {
        bestName: "approach",
        opportunityName: "putting",
        shortGameInferred: false,
        opportunityIsWeak: true,
        opportunityImpactStrokesRounded: 2,
      },
    });
    const realized = makeRealized({
      insight2: {
        emoji: "⚠️",
        text: "Your putting likely cost about 2 strokes with 38 putts.",
      },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("should be definitive");
  });

  it("fails score-only mode when placeholder area wording is used", () => {
    const plan = makePlan({
      present: { fir: false, gir: false, putts: false, penalties: false },
      focus: {
        bestName: null,
        opportunityName: null,
        shortGameInferred: false,
        opportunityIsWeak: false,
        opportunityImpactStrokesRounded: null,
      },
    });
    const realized = makeRealized({
      insight1: { emoji: "✅", text: "You scored 90 and this area should improve." },
      insight2: { emoji: "⚠️", text: "You can lower scores by working on that area." },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("Placeholder wording in insight2");
  });

  it("fails drill mode when focus framing is missing", () => {
    const plan = makePlan({
      action: {
        type: "drill",
        stat: null,
        drill: "Lag putt 10 balls from 25 to 40 feet and aim to leave them inside 3 feet.",
      },
    });
    const realized = makeRealized({
      insight3: {
        emoji: "ℹ️",
        text: "You should lag putt 10 balls from 25 to 40 feet and leave them inside 3 feet. This helps you improve speed control.",
      },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("missing focus framing");
  });

  it("fails when unexpected emoji is present inside body text", () => {
    const plan = makePlan();
    const realized = makeRealized({
      insight1: {
        emoji: "✅",
        text: "You scored 90 and your approach stood out with 7 greens in regulation ✅.",
      },
    });
    const out = validateRealizedInsightsV3(plan, realized);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("Emoji found inside insight1 text");
  });
});
