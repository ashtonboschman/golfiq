type V3PromptControls = {
  actionType: 'track' | 'drill' | 'general';
  nextTrackStat: 'putts' | 'penalties' | 'GIR' | 'FIR' | null;
  drillSuggestion: string | null;
  allowCourseDifficultyMention: boolean;
  scoreCompact?: string;
  scoreDiffVsAvg?: number | null;
  totalSg?: number | null;
  scoreOnlyMode?: boolean;
  insight2Emoji: string;
  hasOpportunityFocus: boolean;
  focus: {
    bestLabel: string | null;
    opportunityLabel: string | null;
    shortGameInferred: boolean;
    opportunityIsWeak: boolean;
    opportunityImpactStrokesRounded: number | null;
  };
  present: {
    fir: boolean;
    gir: boolean;
    putts: boolean;
    penalties: boolean;
  };
};

function sanitizeWhitespace(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

const LEADING_INSIGHT_MARKERS_REGEX =
  /^(?:(?:\u2705|\u26A0\uFE0F|\u26A0|\u2139\uFE0F|\u2139|\uD83D\uDD25|âœ…|âš\s*ï¸|âš |â„¹\s*ï¸|â„¹|ðŸ”¥)\s*)+/u;

const BODY_EMOJI_OR_MOJIBAKE_REGEX =
  /(?:\p{Extended_Pictographic}|\uFE0F|\u200D|âœ…|âš\s*ï¸|âš |â„¹\s*ï¸|â„¹|ðŸ”¥|ðŸŽ¯|ðŸ›‘|ï¸|Â)/gu;

function sanitizeParsedMessageBody(text: string): string {
  return sanitizeWhitespace(String(text ?? ''))
    .replace(BODY_EMOJI_OR_MOJIBAKE_REGEX, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildRealizerPromptsV3(
  payloadForLLM: any,
  allowSgLanguage: boolean,
  controls: V3PromptControls
): { systemPrompt: string; userPrompt: string } {
  const systemLines = [
    'You are writing premium post-round golf insights.',
    'Use only the provided facts and context. Do not invent stats.',
    'Return ONLY valid JSON with this exact schema: {"messages":["...","...","..."]}.',
    'Each message must be 1-2 sentences and start with one emoji among \\u2705 \\u26A0\\uFE0F \\u2139\\uFE0F \\uD83D\\uDD25.',
    'Message 1 explains what defined the round.',
    'Message 1 sentence 1 should recap score context first (score and baseline context), then sentence 2 should explain the strongest area.',
    'Message 2 explains the main scoring implication for the next round.',
    'Message 3 gives one concrete next-round action.',
    'Do not just restate scorecard facts; interpret what most mattered for scoring.',
    'Write directly to the golfer using "you" and "your". Never use third-person terms like "the player".',
    'Do not include additional emoji or symbol markers in message text. Only the first leading emoji is allowed.',
    'Never use placeholder wording like "that area", "this area", "area area", "more stable area area", "tracked data", or "tracked stats".',
    'If a stat is null, treat it as missing and do not infer performance from it.',
    'Do not mention off-the-tee quality when FIR is missing.',
    'Do not mention approach quality or GIR when GIR is missing.',
    'Do not mention putting quality when putts are missing.',
    'Do not mention penalty quality when penalties are missing.',
    'Do not claim a personal best unless the provided facts explicitly support it.',
    'Avoid vague phrasing like "solid ball striking", "overall performance", or "competitive edge".',
    'If focus.bestLabel is present, Message 1 must explicitly name that area.',
    'If focus.bestLabel is present and the corresponding tracked count exists, include that count in Message 1 (for example: "35 putts", "7 greens in regulation", "5 fairways hit", "4 penalties").',
    'If focus.bestLabel is present, Message 1 must stay scoped to that area and must not add a different area as a caveat.',
    'If focus.opportunityLabel is present, Message 2 must explicitly name that area.',
    'If focus.opportunityIsWeak is true, Message 2 must describe impact using concrete scoring language (for example: cost, lost, leak, drag, or strokes).',
    'If focus.opportunityIsWeak is false, Message 2 must frame that area as a secondary area to build, not as lost strokes or missed strokes.',
    'If focus.opportunityIsWeak is false, Message 2 should read like a second positive takeaway and must not use stroke-saving phrasing.',
    'If focus.opportunityIsWeak is false, do not describe that area as weak or weaker, and do not use phrases like "room for improvement".',
    'When focus.opportunityLabel is present and the corresponding tracked count exists, include that count in Message 2 (for example: "38 putts", "4 penalties", "7 greens in regulation", "5 fairways hit").',
    'If focus.opportunityIsWeak is true and focus.opportunityImpactStrokesRounded is provided, express Message 2 impact as an approximate rounded value (for example "~2 strokes"), not a decimal.',
    'Do not stack approximation markers (for example, avoid "around ~2" or "approximately ~2"). Use either "~2" or "around 2", not both.',
    'If the opportunity area is measured (not inferred short game), avoid uncertainty wording like "likely" or "suggests".',
    'If focus.shortGameInferred is true, use uncertainty wording like "likely" or "suggests".',
    'If action_type is "track", Message 3 must explicitly tell the user to track the required stat and why that improves next-round insight precision.',
    'If action_type is "drill" and drillSuggestion is present, Message 3 sentence 1 must use that drillSuggestion verbatim after "Next round focus:".',
    'If action_type is "drill", Message 3 must include a second sentence that explains why the drill helps scoring.',
    'If tracked stats are missing and no opportunity area is provided, keep Message 2 neutral and avoid assigning a specific weakness area.',
    'If scoreOnlyMode is true, Message 1 must focus on outcome context using scoreCompact and scoreDiffVsAvg when available.',
    'If scoreOnlyMode is true, Message 1 and Message 2 must serve different purposes and must not repeat the same phrasing.',
    'If scoreOnlyMode is true, do not attribute performance to a specific skill area (off the tee, approach, putting, penalties, short game).',
    'If scoreOnlyMode is true, Message 2 must not use area-building phrasing like "build on this area".',
    'Do not mention internal key names.',
  ];

  if (!controls.allowCourseDifficultyMention) {
    systemLines.push('Do not mention course difficulty, slope, rating, or describe the course as challenging.');
  } else {
    systemLines.push('Course difficulty context is optional; if used, keep it to one short clause and do not let it replace area-based analysis.');
  }

  if (!allowSgLanguage) {
    systemLines.push('Do not mention strokes gained, SG, residual, or breakdown.');
  }

  const systemPrompt = systemLines.join('\n');
  const userPrompt = [
    'CONTROLS:',
    JSON.stringify(controls, null, 2),
    '',
    'ROUND FACTS:',
    JSON.stringify(payloadForLLM, null, 2),
  ].join('\n');

  return { systemPrompt, userPrompt };
}

export function normalizeRealizerParsedOutputV3(parsed: any): [string, string, string] | null {
  const stripKnownEmojiPrefix = (s: string): string =>
    sanitizeParsedMessageBody(
      sanitizeWhitespace(String(s ?? '')).replace(LEADING_INSIGHT_MARKERS_REGEX, '').trim(),
    );

  const normalizeMessages = (arr: any[]): [string, string, string] | null => {
    if (!Array.isArray(arr) || arr.length !== 3 || !arr.every((m) => typeof m === 'string')) return null;
    const cleaned = arr.map((m) => stripKnownEmojiPrefix(String(m)));
    if (!cleaned.every((m) => m.length > 0)) return null;
    return [cleaned[0], cleaned[1], cleaned[2]];
  };

  // Preferred schema: { messages: ["...", "...", "..."] }
  if (parsed && typeof parsed === 'object') {
    const direct = normalizeMessages((parsed as any)?.messages);
    if (direct) return direct;

    // Alternate schema: { insight1:{text}, insight2:{text}, insight3:{text} }
    const i1 = (parsed as any)?.insight1?.text;
    const i2 = (parsed as any)?.insight2?.text;
    const i3 = (parsed as any)?.insight3?.text;
    const alt = normalizeMessages([i1, i2, i3]);
    if (alt) return alt;
  }

  // Top-level array schema: ["...", "...", "..."]
  const topArray = normalizeMessages(parsed as any[]);
  if (topArray) return topArray;

  // Raw text fallback: accept three non-empty lines, or first three emoji-prefixed lines.
  if (typeof parsed === 'string') {
    const raw = String(parsed ?? '').trim();
    if (!raw) return null;
    const lines = raw
      .split(/\r?\n+/)
      .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
      .filter(Boolean);
    if (lines.length >= 3) {
      const emojiLines = lines.filter((l) => LEADING_INSIGHT_MARKERS_REGEX.test(l));
      const picked = (emojiLines.length >= 3 ? emojiLines : lines).slice(0, 3);
      const parsedLines = normalizeMessages(picked);
      if (parsedLines) return parsedLines;
    }
  }

  return null;
}

