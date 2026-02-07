type PlannerLike = {
  insights: Record<'insight1' | 'insight2' | 'insight3', { emoji: string; maxSentences?: number }>;
  allowedNumbers: number[];
  action: { type: 'track' | 'drill' | 'general'; stat: 'putts' | 'penalties' | 'GIR' | 'FIR' | null; drill?: string | null };
  focus?: {
    bestName: 'off_tee' | 'approach' | 'putting' | 'penalties' | 'short_game' | null;
    opportunityName: 'off_tee' | 'approach' | 'putting' | 'penalties' | 'short_game' | null;
    shortGameInferred: boolean;
    opportunityIsWeak?: boolean;
    opportunityImpactStrokesRounded: number | null;
  };
  allowSgLanguage: boolean;
  present: {
    fir: boolean;
    gir: boolean;
    putts: boolean;
    penalties: boolean;
  };
};

type RealizedLike = {
  insight1: { emoji: string; text: string };
  insight2: { emoji: string; text: string };
  insight3: { emoji: string; text: string };
};

function sanitizeWhitespace(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function splitSentencesSimple(text: string): string[] {
  const t = sanitizeWhitespace(text);
  if (!t) return [];
  const parts = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}

function mentionsStat(text: string, stat: PlannerLike['action']['stat']): boolean {
  if (!stat) return false;
  if (stat === 'putts') return /\b(putt|putts|putting)\b/i.test(text);
  if (stat === 'penalties') return /\b(penalt(y|ies)|penalty)\b/i.test(text);
  if (stat === 'GIR') return /\b(gir|green(s)? in regulation)\b/i.test(text);
  if (stat === 'FIR') return /\b(fir|fairway|fairways)\b/i.test(text);
  return false;
}

function areaMentionRegex(area: NonNullable<NonNullable<PlannerLike['focus']>['bestName']>): RegExp {
  if (area === 'off_tee') return /\b(off the tee|off-the-tee|tee shot|driver|driving|fairway|fairways|fir)\b/i;
  if (area === 'approach') return /\b(approach|approach play|approach shots|iron play|greens? in regulation|gir)\b/i;
  if (area === 'putting') return /\b(putt|putts|putting|on the green|on the greens)\b/i;
  if (area === 'penalties') return /\b(penalt(y|ies)|penalty|hazard|ob|out of bounds)\b/i;
  return /\b(short game|around the green|chip|chips|chipping|pitch|pitches|pitching|up-and-down)\b/i;
}

function mentionsOtherAreas(
  text: string,
  focus: NonNullable<NonNullable<PlannerLike['focus']>['bestName']>
): boolean {
  const areas: Array<NonNullable<NonNullable<PlannerLike['focus']>['bestName']>> = [
    'off_tee',
    'approach',
    'putting',
    'penalties',
    'short_game',
  ];
  return areas.some((a) => a !== focus && areaMentionRegex(a).test(text));
}

function hasDrillKeywordOverlap(text: string, drill: string | null | undefined): boolean {
  const source = sanitizeWhitespace(drill ?? '').toLowerCase();
  if (!source) return true;
  const stop = new Set(['next', 'round', 'focus', 'the', 'and', 'with', 'that', 'this', 'from', 'your', 'into', 'then', 'for', 'more', 'over']);
  const tokens = source
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !stop.has(t));
  if (tokens.length === 0) return true;
  const hay = sanitizeWhitespace(text).toLowerCase();
  let hit = 0;
  for (const t of new Set(tokens)) {
    if (hay.includes(t)) hit += 1;
    if (hit >= 2) return true;
  }
  return false;
}

function hasOpportunitySupportCount(
  text: string,
  focus: NonNullable<PlannerLike['focus']>['opportunityName'],
  present: PlannerLike['present']
): boolean {
  if (!focus) return true;
  if (focus === 'putting' && present.putts) {
    return /\b\d+\s+putts?\b/i.test(text);
  }
  if (focus === 'penalties' && present.penalties) {
    return /\b\d+\s+penalt(?:y|ies)\b/i.test(text);
  }
  if (focus === 'approach' && present.gir) {
    return /\b\d+\s+(?:greens?\s+in\s+regulation|gir)\b/i.test(text);
  }
  if (focus === 'off_tee' && present.fir) {
    return /\b\d+\s+(?:fairways?\s+hit|fairways?|fir)\b/i.test(text);
  }
  // short_game has no direct tracked count in this payload model.
  return true;
}

function hasBestSupportCount(
  text: string,
  focus: NonNullable<PlannerLike['focus']>['bestName'],
  present: PlannerLike['present']
): boolean {
  if (!focus) return true;
  if (focus === 'putting' && present.putts) {
    return /\b\d+\s+putts?\b/i.test(text);
  }
  if (focus === 'penalties' && present.penalties) {
    return /\b\d+\s+penalt(?:y|ies)\b/i.test(text);
  }
  if (focus === 'approach' && present.gir) {
    return /\b\d+\s+(?:greens?\s+in\s+regulation|gir)\b/i.test(text);
  }
  if (focus === 'off_tee' && present.fir) {
    return /\b\d+\s+(?:fairways?\s+hit|fairways?|fir)\b/i.test(text);
  }
  // short_game has no direct tracked count in this payload model.
  return true;
}

export function validateRealizedInsightsV3(
  plan: PlannerLike,
  realized: RealizedLike
): { ok: true } | { ok: false; reason: string } {
  const keys: Array<'insight1' | 'insight2' | 'insight3'> = ['insight1', 'insight2', 'insight3'];
  const allowedEmoji = ['✅', '⚠️', 'ℹ️', '🔥'];
  const scoreFragmentStart = /^\s*\d+\s*\(\s*[+-]?\d+/i;
  const internalKeyMentions = /\b(to_par|score_display|par_phrase)\b/i;
  const templateLabels = /\b(primary opportunity|secondary focus|handicap milestone|round summary)\b/i;
  const sgTerms = /\b(strokes\s+gained|strokes-gained|residual|breakdown|sg)\b/i;
  const thirdPersonTerms = /\b(the player|player's|player)\b/i;
  const secondPersonTerms = /\b(you|your)\b/i;
  const vagueTerms = /\b(ball striking|overall performance|competitive edge|room for improvement)\b/i;
  const decimalNumber = /\b\d+\.\d+\b/;
  const uncertaintyTerms = /\b(likely|suggests|may|most likely)\b/i;
  const weaknessImpactTerms = /\b(cost|costing|lost|loss|leak|drag|hurt|missed\s+strokes?)\b/i;
  const nonWeakStrokeSavingsTerms = /\b(save|saved|saving|gain|gained|gaining|recover|recovered|recovering)\b[^.]*\bstrokes?\b/i;
  const nonWeakNegativeTerms = /\b(weak|weaker|weakest|room for improvement|needs improvement|needs work|struggle|struggled|struggling)\b/i;
  const stackedApprox = /\b(?:around|about|roughly|nearly|approximately|approx\.?)\s*~\s*\d+\b|~\s*(?:around|about|roughly|nearly|approximately|approx\.?)\s*\d+\b/i;
  const badCostPhrase = /\bcan have cost(?:ing)?\b/i;
  const placeholderTerms = /\b(that area|area area|more stable area area|tracked data|tracked stats)\b/i;
  const anyAreaMention = /\b(off the tee|off-the-tee|tee shot|driver|driving|fairway|fairways|fir|approach|approach play|approach shots|iron play|greens?\s+in\s+regulation|gir|putt|putts|putting|penalt(y|ies)|penalty|hazard|ob|out of bounds|short game|around the green|chip|chips|chipping|pitch|pitches|pitching|up-and-down)\b/i;
  const scoreOnlyMode = !plan.present.fir && !plan.present.gir && !plan.present.putts && !plan.present.penalties;

  for (const k of keys) {
    const item = realized[k];
    if (!item || typeof item !== 'object') return { ok: false, reason: `Missing ${k}` };
    if (!allowedEmoji.includes(item.emoji)) return { ok: false, reason: `Invalid emoji for ${k}` };
    if (item.emoji !== plan.insights[k].emoji) return { ok: false, reason: `Emoji mismatch for ${k}` };
    if (typeof item.text !== 'string' || !item.text.trim()) return { ok: false, reason: `Empty text for ${k}` };

    const t = sanitizeWhitespace(item.text);
    if (/[✅⚠️ℹ️🔥]/.test(t)) return { ok: false, reason: `Emoji found inside ${k} text` };
    if (scoreFragmentStart.test(t)) return { ok: false, reason: `Starts with a score fragment in ${k}` };
    if (internalKeyMentions.test(t)) return { ok: false, reason: `Internal key mention in ${k}` };
    if (templateLabels.test(t)) return { ok: false, reason: `Template label in ${k}` };
    if (!plan.allowSgLanguage && sgTerms.test(t)) return { ok: false, reason: `SG terminology forbidden in ${k}` };
    if (thirdPersonTerms.test(t)) return { ok: false, reason: `Third-person phrasing in ${k}` };
    if (!secondPersonTerms.test(t)) return { ok: false, reason: `Missing second-person phrasing in ${k}` };
    if (vagueTerms.test(t)) return { ok: false, reason: `Vague phrasing in ${k}` };
    if ((k === 'insight1' || k === 'insight2') && decimalNumber.test(t)) {
      return { ok: false, reason: `Use rounded values (no decimals) in ${k}` };
    }
    if (placeholderTerms.test(t)) {
      return { ok: false, reason: `Placeholder wording in ${k}` };
    }
    if (k === 'insight2' && stackedApprox.test(t)) {
      return { ok: false, reason: 'Do not stack approximation markers in insight2 (e.g., "around ~2")' };
    }
    if (k === 'insight2' && badCostPhrase.test(t)) {
      return { ok: false, reason: 'Insight 2 uses invalid cost phrasing ("can have cost")' };
    }

    const sentences = splitSentencesSimple(t);
    const maxSentences = plan.insights[k].maxSentences ?? 2;
    if (sentences.length > maxSentences) return { ok: false, reason: `Too many sentences in ${k}` };
  }

  // Never reference missing advanced stats in explanatory insights.
  for (const k of ['insight1', 'insight2'] as const) {
    const t = sanitizeWhitespace(realized[k].text);

    if (!plan.present.fir && /\b(off the tee|off-the-tee|tee shot|driver|driving|fairway|fairways|fir)\b/i.test(t)) {
      return { ok: false, reason: `${k} references FIR/off-the-tee while FIR is missing` };
    }
    if (!plan.present.gir && /\b(approach|approach play|approach shots|iron play|green(s)? in regulation|gir)\b/i.test(t)) {
      return { ok: false, reason: `${k} references GIR/approach while GIR is missing` };
    }
    if (!plan.present.putts && /\b(putt|putts|putting|on the green|on the greens)\b/i.test(t)) {
      return { ok: false, reason: `${k} references putting while putts are missing` };
    }
    if (!plan.present.penalties && /\b(penalt(y|ies)|penalty|hazard|ob|out of bounds)\b/i.test(t)) {
      return { ok: false, reason: `${k} references penalties while penalties are missing` };
    }
  }

  if (scoreOnlyMode) {
    for (const k of ['insight1', 'insight2'] as const) {
      const t = sanitizeWhitespace(realized[k].text);
      if (/\b(this area|that area)\b/i.test(t)) {
        return { ok: false, reason: `${k} uses placeholder area wording in score-only mode` };
      }
      if (anyAreaMention.test(t)) {
        return { ok: false, reason: `${k} attributes a specific area in score-only mode` };
      }
    }
  }

  // Enforce focus alignment when the planner has a specific SG focus/opportunity.
  if (plan.focus?.bestName) {
    const t1 = sanitizeWhitespace(realized.insight1.text);
    if (!areaMentionRegex(plan.focus.bestName).test(t1)) {
      return { ok: false, reason: 'Insight 1 missing planned focus area' };
    }
    if (mentionsOtherAreas(t1, plan.focus.bestName)) {
      return { ok: false, reason: 'Insight 1 references areas outside planned focus' };
    }
    if (!hasBestSupportCount(t1, plan.focus.bestName, plan.present)) {
      return { ok: false, reason: 'Insight 1 missing supporting tracked count for planned focus area' };
    }
  }
  if (plan.focus?.opportunityName) {
    const t2 = sanitizeWhitespace(realized.insight2.text);
    const opportunityIsWeak = Boolean(plan.focus.opportunityIsWeak);
    if (!areaMentionRegex(plan.focus.opportunityName).test(t2)) {
      return { ok: false, reason: 'Insight 2 missing planned opportunity area' };
    }
    if (opportunityIsWeak) {
      if (!/\b(cost|costing|lost|loss|leak|drag|hurt|strokes?)\b/i.test(t2)) {
        return { ok: false, reason: 'Insight 2 missing concrete impact language' };
      }
    } else {
      if (weaknessImpactTerms.test(t2)) {
        return { ok: false, reason: 'Insight 2 uses weakness language for a non-weak opportunity' };
      }
      if (nonWeakStrokeSavingsTerms.test(t2) || /\b(?:around|about|roughly|nearly|approximately|approx\.?|~)\s*\d+\s*strokes?\b/i.test(t2)) {
        return { ok: false, reason: 'Insight 2 uses stroke-saving language for a non-weak opportunity' };
      }
      if (nonWeakNegativeTerms.test(t2)) {
        return { ok: false, reason: 'Insight 2 uses negative wording for a non-weak opportunity' };
      }
    }
    if (!hasOpportunitySupportCount(t2, plan.focus.opportunityName, plan.present)) {
      return { ok: false, reason: 'Insight 2 missing supporting tracked count for planned opportunity area' };
    }
    if (plan.focus.shortGameInferred && !uncertaintyTerms.test(t2)) {
      return { ok: false, reason: 'Insight 2 must use uncertainty wording for inferred short game' };
    }
    if (!plan.focus.shortGameInferred && uncertaintyTerms.test(t2)) {
      return { ok: false, reason: 'Insight 2 should be definitive for measured opportunity areas' };
    }
    if (opportunityIsWeak && !plan.focus.shortGameInferred && plan.focus.opportunityImpactStrokesRounded != null) {
      const n = plan.focus.opportunityImpactStrokesRounded;
      const approxN = new RegExp(`(?:~\\s*${n}\\b|about\\s+${n}\\b|around\\s+${n}\\b|roughly\\s+${n}\\b|nearly\\s+${n}\\b|approximately\\s+${n}\\b|approx\\.?\\s+${n}\\b)`, 'i');
      if (!approxN.test(t2) || !/\bstrokes?\b/i.test(t2)) {
        return { ok: false, reason: 'Insight 2 must use approximate rounded stroke impact (e.g., "~2 strokes")' };
      }
    }
  }

  // If tracking is required, enforce a clear tracking ask tied to the planned stat.
  if (plan.action.type === 'track') {
    const t = sanitizeWhitespace(realized.insight3.text);
    if (!/\b(track|record|log|capture|count|enter|note)\b/i.test(t)) {
      return { ok: false, reason: 'Insight 3 missing tracking action' };
    }
    if (!mentionsStat(t, plan.action.stat)) {
      return { ok: false, reason: 'Insight 3 missing planned stat mention' };
    }
  } else if (plan.action.type === 'drill') {
    const t = sanitizeWhitespace(realized.insight3.text);
    if (!/\b(next round focus|focus)\b/i.test(t)) {
      return { ok: false, reason: 'Insight 3 missing focus framing' };
    }
    if (!/\b(practice|drill|run|hit|repeat|use|aim|start)\b/i.test(t)) {
      return { ok: false, reason: 'Insight 3 missing concrete drill action' };
    }
    if (!hasDrillKeywordOverlap(t, plan.action.drill)) {
      return { ok: false, reason: 'Insight 3 does not match planned drill suggestion' };
    }
    const s = splitSentencesSimple(t);
    if (s.length < 2) {
      return { ok: false, reason: 'Insight 3 drill mode requires a second sentence explaining why it helps' };
    }
    if (!/\b(help|improve|reduce|lower|protect|build|stabilize|tighten)\b/i.test(s[1] ?? '')) {
      return { ok: false, reason: 'Insight 3 second sentence missing drill impact explanation' };
    }
  }

  return { ok: true };
}
