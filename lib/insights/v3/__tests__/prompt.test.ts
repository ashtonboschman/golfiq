import { buildRealizerPromptsV3, normalizeRealizerParsedOutputV3 } from "../prompt";

const baseControls = {
  actionType: "drill" as const,
  nextTrackStat: null,
  drillSuggestion: "Lag putt 10 balls from 25 to 40 feet and aim to leave them inside 3 feet.",
  allowCourseDifficultyMention: false,
  scoreCompact: "90 (+18)",
  scoreDiffVsAvg: -1.7,
  totalSg: -1.52,
  scoreOnlyMode: false,
  insight2Emoji: "⚠️",
  hasOpportunityFocus: true,
  focus: {
    bestLabel: "Approach",
    opportunityLabel: "Putting",
    shortGameInferred: false,
    opportunityIsWeak: true,
    opportunityImpactStrokesRounded: 2,
  },
  present: {
    fir: true,
    gir: true,
    putts: true,
    penalties: true,
  },
};

describe("buildRealizerPromptsV3", () => {
  it("includes SG suppression when SG language is disabled", () => {
    const { systemPrompt } = buildRealizerPromptsV3(
      { round: { score: 90 } },
      false,
      baseControls
    );

    expect(systemPrompt).toContain("Do not mention strokes gained, SG, residual, or breakdown.");
  });

  it("suppresses course-difficulty wording when disabled", () => {
    const { systemPrompt } = buildRealizerPromptsV3(
      { round: { score: 90 } },
      true,
      { ...baseControls, allowCourseDifficultyMention: false }
    );

    expect(systemPrompt).toContain("Do not mention course difficulty, slope, rating, or describe the course as challenging.");
  });

  it("allows optional course-difficulty wording when enabled", () => {
    const { systemPrompt } = buildRealizerPromptsV3(
      { round: { score: 90 } },
      true,
      { ...baseControls, allowCourseDifficultyMention: true }
    );

    expect(systemPrompt).toContain("Course difficulty context is optional; if used, keep it to one short clause and do not let it replace area-based analysis.");
  });

  it("serializes controls + facts in user prompt", () => {
    const payload = { round: { score: 90 }, history: { avg: 88.3 } };
    const { userPrompt } = buildRealizerPromptsV3(payload, true, baseControls);

    expect(userPrompt).toContain('"scoreCompact": "90 (+18)"');
    expect(userPrompt).toContain('"score": 90');
    expect(userPrompt).toContain('"avg": 88.3');
  });
});

describe("normalizeRealizerParsedOutputV3", () => {
  it("parses preferred {messages:[...]} schema", () => {
    const out = normalizeRealizerParsedOutputV3({
      messages: ["✅ First.", "⚠️ Second.", "ℹ️ Third."],
    });

    expect(out).toEqual(["First.", "Second.", "Third."]);
  });

  it("parses alternate insight object schema", () => {
    const out = normalizeRealizerParsedOutputV3({
      insight1: { text: "✅ First." },
      insight2: { text: "⚠️ Second." },
      insight3: { text: "ℹ️ Third." },
    });

    expect(out).toEqual(["First.", "Second.", "Third."]);
  });

  it("parses top-level array schema", () => {
    const out = normalizeRealizerParsedOutputV3(["✅ One.", "⚠️ Two.", "ℹ️ Three."]);
    expect(out).toEqual(["One.", "Two.", "Three."]);
  });

  it("parses raw line-based fallback with bullets", () => {
    const out = normalizeRealizerParsedOutputV3(
      "- ✅ First sentence.\n- ⚠️ Second sentence.\n- ℹ️ Third sentence."
    );

    expect(out).toEqual(["First sentence.", "Second sentence.", "Third sentence."]);
  });

  it("strips body emoji/mojibake and non-ascii artifacts", () => {
    const out = normalizeRealizerParsedOutputV3({
      messages: ["✅ First 😀 Ã¢Å“â€¦ text.", "⚠️ Second.", "ℹ️ Third."],
    });

    expect(out).toEqual(["First text.", "Second.", "Third."]);
  });

  it("returns null when it cannot parse three messages", () => {
    expect(normalizeRealizerParsedOutputV3({ messages: ["only one"] })).toBeNull();
    expect(normalizeRealizerParsedOutputV3("")).toBeNull();
  });
});

