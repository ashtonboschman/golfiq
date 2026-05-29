import type {
  RoundIdentity,
  RoundIdentityDisplayAreaEvidence,
} from '@/lib/insights/roundIdentity/types';

type AreaKey = NonNullable<RoundIdentityDisplayAreaEvidence['area']>;

const DAMAGE_MODIFIERS = new Set(['one_hole_damage', 'blow_up_stretch']);

const M1_SCORE_ONLY_BASELINE_VARIANTS = [
  'This starts your baseline. Add one or two optional stats next round so GolfIQ can explain what shaped the number.',
  'This starts your baseline. Even one extra stat next round gives GolfIQ a clearer read on why this score happened.',
  'This starts your baseline. Add a couple of stats like putts or greens next round so GolfIQ can explain more than the final number.',
] as const;

const M1_BREAKTHROUGH_CLEAN_VARIANTS = [
  'This was a true breakthrough score that finished clearly above your usual range.',
  'This round landed well outside your normal scoring range in the right direction.',
  'This was the kind of score that shows real progress, not just a small step forward.',
  'This one clearly separated itself from your recent rounds.',
  'This was a true step forward compared with where your scores have been.',
] as const;

const M1_BREAKTHROUGH_DAMAGE_VARIANTS = [
  'This was a true breakthrough score, with enough good holes to outweigh a couple costly mistakes.',
  'This round still broke through because the good holes did more than enough to offset the costly ones.',
  'Even with a couple mistakes, this score was clearly ahead of your usual range.',
  'The costly holes showed up, but they did not define the round, and the score still broke through.',
  'This was a breakthrough round because the good holes outweighed the damage.',
] as const;

const M1_VOLATILE_OR_BIG_VARIANTS = [
  'Good holes were there, but the big-number holes did too much of the damage.',
  'The round had playable stretches, but the costly holes pulled too much of the score upward.',
  'There were good pieces in the round, but the bad holes got too expensive.',
  'A few costly holes carried too much of the score.',
  'The round was not all bad, but the big holes carried too much weight.',
] as const;

const M1_CLEAN_CONTROL_VARIANTS = [
  'This round stayed stable because damage never stacked for long.',
  'This was a controlled round because the costly holes never piled up.',
  'You kept the round from getting messy, and that gave the score structure.',
  'The round worked because the damage stayed limited.',
  'This was steady, controlled scoring without the kind of mistakes that change the whole card.',
] as const;

const M1_APPROACH_CARRIED_VARIANTS = [
  'Approach play set the tone for how this round scored.',
  'The round was built around the quality of your approach play.',
  'Your approach game gave the round its structure.',
  'Approach shots did enough work to shape the round in a positive way.',
  'The score was supported by what you did into the greens.',
] as const;

const M1_PUTTING_SAVED_VARIANTS = [
  'Putting quality protected scoring momentum through the round.',
  'The putter did a lot of work to keep the score moving.',
  'Putting helped protect the round when other parts of the game needed support.',
  'Putting gave the round its biggest help.',
  'Putting kept the round from getting away from you.',
] as const;

const M1_TEE_CONTROLLED_VARIANTS = [
  'Playability off the tee made the rest of each hole easier to manage.',
  'Tee shots gave the round cleaner starts and kept pressure off the rest of the hole.',
  'The round was easier to manage because the ball stayed playable off the tee.',
  'Good enough tee-shot control helped keep the scorecard under control.',
  'The tee game gave you more holes that started from manageable spots.',
] as const;

const M1_SHORT_GAME_RESCUE_VARIANTS = [
  'Recovery shots kept missed greens from turning into bigger damage.',
  'The short game helped keep missed greens from becoming round-changing mistakes.',
  'Recovery around the green did enough to protect the score.',
  'The short game gave the round a safety net when greens were missed.',
  'Around the greens, you limited enough damage to keep the round together.',
] as const;

const M1_STEADY_SCORING_VARIANTS = [
  'This was a steady round with limited momentum swings.',
  'The score came from staying fairly even rather than riding big highs and lows.',
  'This round stayed mostly under control without too many sharp swings.',
  'The scorecard was steady enough to keep the round from getting away.',
  'This was more about consistency than one dramatic stretch.',
] as const;

const M1_ALL_AROUND_STRONG_VARIANTS = [
  'This round was not carried by one lucky area. Multiple parts of your game supported the score.',
  'This was balanced golf. More than one part of your game helped the score.',
  'The score had support from multiple areas instead of depending on one standout stat.',
  'This round worked because several parts of your game held up at the same time.',
  'There was more than one reason the score stayed strong.',
] as const;

const M1_SURVIVAL_VARIANTS = [
  'This was more of a held-together round than a clean one. The damage never fully got away.',
  'This round was not clean, but you kept it from fully slipping away.',
  'The score stayed manageable because the rough stretches never completely took over.',
  'You did enough damage control to keep the round from becoming worse.',
  'This was a grind, but the scorecard never fully unraveled.',
] as const;

const M1_PENALTY_DAMAGED_NORMAL_VARIANTS = [
  'Penalty trouble changed the score more than routine mistakes.',
  'Penalty strokes changed the round more than routine mistakes did.',
  'The penalties made the score climb faster than the rest of the round suggested.',
  'This round got more expensive when penalty strokes entered the round.',
  'Penalty trouble was the part that changed the score the quickest.',
] as const;

const M1_PENALTY_DAMAGED_REPEATED_VARIANTS = [
  'Penalties and big numbers shaped the round more than routine mistakes.',
  'The round changed quickly when penalties and big numbers showed up.',
  'Most of the scoring damage came from penalties and costly holes.',
  'This was less about small misses and more about the holes where penalties and doubles stacked up.',
  'Penalty strokes and big holes did most of the scoring damage.',
] as const;

const M1_PUTTING_LEAK_VARIANTS = [
  'The score got away mostly on the greens. The chances were there, but the finish was not sharp enough.',
  'Too many strokes stayed on the greens.',
  'Putting made it harder to turn decent holes into better numbers.',
  'The round needed more from the putter than it got.',
  'Too many chances stalled on the greens, and that showed up in the score.',
] as const;

const M1_SCORING_CHANCE_MISSED_VARIANTS = [
  'You created enough chances for the score to be lower. The story was conversion, not opportunity.',
  'The chances were there, but enough of them slipped away to hold the score back.',
  'This round had scoring chances, but they did not turn into enough lower numbers.',
  'You gave yourself enough looks to score better, but the finish was missing.',
  'The round was closer to a lower score than the final number suggests, but the chances needed better conversion.',
] as const;

const M1_APPROACH_LEAK_VARIANTS = [
  'Approach misses created too much pressure and pushed the round into recovery mode.',
  'The round got harder because too many approaches left work to do.',
  'Missed greens put the score under pressure too often.',
  'Approach play left the round relying on too many recovery shots.',
  'Too many holes became harder than they needed to be after the approach shot.',
] as const;

const M1_TEE_TROUBLE_VARIANTS = [
  'Too many holes started from recovery spots, which made scoring harder than it needed to be.',
  'The round got harder because too many holes started from awkward positions.',
  'Tee-shot trouble put pressure on the rest of too many holes.',
  'Too many tee shots left the round playing from defense.',
  'The scorecard got tougher because the first shot did not set up enough clean holes.',
] as const;

const M1_SHORT_GAME_PRESSURE_VARIANTS = [
  'The round leaned on too many difficult saves, and that pressure added up.',
  'Too many holes needed recovery work around the green, and that made the score harder to protect.',
  'The short game was under pressure too often for the round to stay clean.',
  'Too many missed greens turned into difficult saves.',
  'The round asked for too many up-and-downs, and that pressure showed up in the score.',
] as const;

const M1_EVERYTHING_LEAKED_VARIANTS = [
  'No single issue explains this one. A few areas leaked at the same time, which made the score hard to protect.',
  'This was not one clear problem. Too many parts of the game leaked at once.',
  'The score came from several smaller problems stacking together.',
  'There was not one clean fix from this round. Multiple areas made the score harder to hold.',
  'The round got away because more than one part of the game was under pressure.',
] as const;

const M2_SCORE_ONLY_BASELINE_VARIANTS = [
  'This round gives GolfIQ a starting point for future comparisons.',
  'This score gives you a starting point to compare against next time.',
  'This one starts the baseline, and future rounds will make the pattern clearer.',
  'The score is logged. A few more details next round will make the why easier to explain.',
] as const;

const M2_STRENGTH_PUTTING_VARIANTS = [
  "Putting was the round's biggest edge. With {putts} putts, you converted enough chances to support the score.",
  'The putter gave the round its biggest lift. With {putts} putts, you saved enough strokes to protect the score.',
  'Putting did real work for the score. {putts} putts helped turn chances into better numbers.',
  'Putting was a strength. With {putts} putts, you gave the round a scoring boost.',
] as const;

const M2_STRENGTH_APPROACH_VARIANTS = [
  'Approach play gave the round structure. Hitting {made} of {total} greens helped keep the score from depending on saves.',
  'Approach shots did enough work to support the score. {made} of {total} greens gave you a stronger base.',
  'Green-hitting helped shape the round. {made} of {total} greens kept pressure off the short game.',
  'The approach game gave you enough chances. Hitting {made} of {total} greens made the score easier to protect.',
] as const;

const M2_STRENGTH_OFF_TEE_VARIANTS = [
  'Tee shots kept the round playable. You found {made} of {total} fairways, which helped keep pressure off the rest of the hole.',
  'The tee game gave you enough clean starts. Finding {made} of {total} fairways kept more holes manageable.',
  'Off the tee, the ball stayed playable often enough to support the score.',
  'Tee-shot control helped the round stay organized by keeping more holes in front of you.',
] as const;

const M2_STRENGTH_SHORT_GAME_VARIANTS = [
  'The short game helped limit damage. Missed greens did not hurt as much because recovery shots kept you in the hole.',
  'Around the greens, you did enough to keep the score from slipping further.',
  'The short game gave the round a safety net when greens were missed.',
  'Recovery shots helped protect the round when the approach game left work to do.',
] as const;

const M2_STRENGTH_PENALTIES_VARIANTS = [
  'Risk control quietly supported the score. Keeping penalty trouble down protected your scoring momentum.',
  'Avoiding penalty trouble helped keep the round from getting expensive.',
  'The round stayed cleaner because penalty strokes did not pile up.',
  'Keeping the ball in play protected the score more than it might show at first glance.',
] as const;

const M2_STRENGTH_GENERIC_VARIANTS = [
  'The clearest takeaway is how the score came together, not one isolated stat.',
  'The score tells a broader story than one single area.',
  'This round was shaped by the overall pattern more than one obvious stat.',
  'No single stat carried the full explanation, but the score still had a clear pattern.',
] as const;

const M2_LEAK_PENALTIES_VARIANTS = [
  'Penalty strokes were the clearest leak. {penaltySentence}',
  'Penalty trouble was the clearest leak. {penaltySentence}',
  'The penalties made the round more expensive than it needed to be. {penaltySentence}',
  'Penalty strokes changed the score quickly. {penaltySentence}',
] as const;

const M2_LEAK_OFF_TEE_VARIANTS = [
  'Tee shots made the round harder than it needed to be. When the ball starts from recovery spots, everything after that gets tougher.',
  'The round was under pressure early on too many holes because of tee-shot trouble.',
  'Too many tee shots left the rest of the hole playing from defense.',
  'The first shot created too much work, and that pressure carried into the score.',
] as const;

const M2_LEAK_APPROACH_VARIANTS = [
  'Approach play created most of the pressure. Too many missed greens left the round relying on recovery shots.',
  'The approach game left too much work around the greens.',
  'Missed greens put the score under pressure too often.',
  'Too many approach shots left the round depending on saves instead of scoring chances.',
] as const;

const M2_LEAK_PUTTING_VARIANTS = [
  'Putting was the clearest leak. The chances were there, but too many strokes stayed on the greens.',
  'The greens held the score back. Too many chances needed one stroke more than they should have.',
  'Putting made it harder to finish holes cleanly.',
  'Too much of the score stayed on the greens, and that kept the number higher.',
] as const;

const M2_LEAK_SHORT_GAME_VARIANTS = [
  'Short-game pressure was the clearest leak. Too many misses left difficult saves for par.',
  'Around the greens, the round needed too many tough saves.',
  'The short game could not erase enough of the missed-green pressure.',
  'Too many recovery shots left difficult next putts, and that added up.',
] as const;

const M2_LEAK_GENERIC_VARIANTS = [
  'The score pattern is clearer than the cause right now. Add one more reliable stat next round and the main reason will be easier to see.',
  'The score tells part of the story, but one more tracked area would make the cause clearer.',
  'The score gives a partial read, but one more tracked area would make the main cause clearer.',
  'One more tracked area next round would make the main reason behind the score much clearer.',
] as const;

const M2_EVERYTHING_FALLBACK_VARIANTS = [
  'The useful takeaway is to simplify. Pick the easiest leak to control first instead of trying to fix everything at once.',
  'The next step is choosing one leak to clean up first instead of chasing the whole round.',
  'There was not one clean fix here. Start with the easiest mistake to control and keep the rest simple.',
  'When multiple areas leak at once, the best move is to simplify the next round.',
] as const;

const M2_ALL_AROUND_BALANCE_VARIANTS = [
  'The strength was balance. No single area had to carry the round because multiple parts of your game held up.',
  'This was balanced golf. More than one part of your game supported the score.',
  'The round worked because several areas helped at the same time.',
  'No single area had to rescue the score because the whole round had support.',
] as const;

const M2_GENERIC_SUMMARY_VARIANTS = [
  'The score pattern is clearer than the cause right now. Add one more reliable stat next round and the main reason will be easier to see.',
  'The score tells part of the story, but one more tracked area would make the cause clearer.',
  'The score gives a partial read, but one more tracked area would make the main cause clearer.',
  'One more tracked area next round would make the main reason behind the score much clearer.',
] as const;

const M3_EXPLAIN_VARIANTS = [
  'Add one or two optional stats next round so GolfIQ can explain more than just the score.',
  'Add a couple of stats next round, like putts or greens, so GolfIQ can explain what shaped the score.',
  'Even one extra stat next round gives GolfIQ a clearer read on why the score landed there.',
] as const;

const M3_REPEAT_DAMAGE_COUPLE_VARIANTS = [
  'Next round, keep giving yourself scoring chances while protecting against the big numbers. Clean up the couple of doubles, and this kind of round can go even lower.',
  'Next round, keep creating scoring chances and make the doubles harder to find.',
  'Next round, protect the good holes by keeping the costly ones closer to bogey.',
  'Next round, keep creating chances and make the couple of bad holes less expensive.',
] as const;

const M3_REPEAT_DAMAGE_ONE_VARIANTS = [
  'Next round, keep giving yourself scoring chances while protecting against the big numbers. Clean up the one costly hole, and the score can move even lower.',
  'Next round, keep creating scoring chances and make the one bad hole less expensive.',
  'Next round, protect the round when one hole starts going sideways.',
  'Next round, keep the good scoring pattern and stop one hole from carrying too much weight.',
] as const;

const M3_REPEAT_PAR3_VARIANTS = [
  'Next round, treat par 3s as score-protection holes first and avoid compounding mistakes there.',
  'Next round, play the par 3s for the middle of the green before chasing pins.',
  'Next round, make par 3s boring first. A safe target there can protect the whole card.',
  'Next round, give the par 3s more respect and take the clean number.',
] as const;

const M3_REPEAT_PAR5_VARIANTS = [
  'Next round, keep leaning on par 5 scoring while protecting the holes where par is a good result.',
  'Next round, keep using the par 5s as scoring chances without forcing the risky shot.',
  'Next round, let the par 5s help the score again, but stay patient when the chance is not there.',
  'Next round, keep the par 5 mindset that gave the score a lift.',
] as const;

const M3_REPEAT_SLOW_START_STRONG_FINISH_VARIANTS = [
  'Next round, bring the same calm you found late in the round into the first few holes.',
  'Next round, try to start with the same rhythm you found near the finish.',
  'Next round, use the late-round version of your game earlier.',
  'Next round, treat the opening holes like the stretch where you settled in.',
] as const;

const M3_REPEAT_FAST_START_SLOW_FINISH_VARIANTS = [
  'Next round, carry your early-round discipline into the finish so the cushion lasts.',
  'Next round, protect the good start by keeping the same decisions late.',
  'Next round, when the round starts well, stay patient through the closing holes.',
  'Next round, keep the early rhythm from turning into late pressure.',
] as const;

const M3_REPEAT_BOUNCE_VARIANTS = [
  'Next round, keep using that bounce-back response after mistakes. It protected the round.',
  'Next round, keep resetting after mistakes instead of letting one hole turn into two.',
  'Next round, trust the reset after a bad hole. That response matters.',
  'Next round, keep the same response when a mistake shows up.',
] as const;

const M3_REPEAT_REPEATED_BOGEYS_VARIANTS = [
  'Next round, stop the bogey stretches early by resetting to the safest target on the next hole.',
  'Next round, break up the bogey runs before they become the whole story.',
  'Next round, after one bogey, make the next hole simple and reset the round.',
  'Next round, protect against bogeys stacking quietly across the round.',
] as const;

const M3_REPEAT_NO_DAMAGE_VARIANTS = [
  'Next round, keep the same damage control and let the score build from clean holes.',
  'Next round, repeat the clean-card mindset before chasing anything extra.',
  'Next round, keep avoiding the mistake that changes the whole card.',
  'Next round, let the score build from another low-damage round.',
] as const;

const M3_REPEAT_GOOD_SCORE_BAD_PROCESS_VARIANTS = [
  'Next round, keep the scoring result but tighten the part of the game that was least stable.',
  'Next round, keep the scoring result and clean up the area that looked least stable.',
  'Next round, take the result, but do not ignore the part of the round that still looked shaky.',
  'Next round, repeat the scoring result and make the weakest part a little cleaner.',
] as const;

const M3_REPEAT_BAD_SCORE_GOOD_PROCESS_VARIANTS = [
  'Next round, keep building on the area that held up. The score can catch up quickly when that repeats.',
  'Next round, do not lose the part that worked just because the score was frustrating.',
  'Next round, keep the part that held up and give the score another chance to catch up.',
  'Next round, carry forward the area that held up and clean up around it.',
] as const;

const M3_REPEAT_AREA_VARIANTS = [
  'Next round, keep leaning on {areaLabel} and see if it shows up again.',
  'Next round, make {areaLabel} the thing you try to repeat first.',
  'Next round, keep trusting {areaLabel} and see if it carries over.',
  'Next round, look for the same {areaLabel} strength before changing too much.',
] as const;

const M3_REPEAT_GENERIC_VARIANTS = [
  'Next round, try to repeat the same scoring pattern before chasing anything new.',
  'Next round, look for the same pattern again before changing too much.',
  'Next round, keep the plan simple and see if the same pattern holds.',
  'Next round, repeat the parts that worked before adding new fixes.',
] as const;

const M3_FIX_APPROACH_VARIANTS = [
  'Next round, prioritize getting approaches on or near the green, even when the pin is tempting.',
  'Next round, aim for the part of the green that keeps the miss playable.',
  'Next round, make the approach goal simple: on the green or near it.',
  'Next round, choose approach targets that reduce the need for a tough save.',
] as const;

const M3_FIX_BIG_3PLUS_VARIANTS = [
  'Next round, protect against the big-number holes first. When trouble is in play, choose the target with the most room and keep the next shot simple.',
  'Next round, make the recovery shot boring. After one mistake, get back in play before chasing the green.',
  'Next round, protect bogey first when a hole starts going sideways. That keeps one mistake from turning into three.',
  'Next round, choose the safe exit earlier. The goal is keeping bad holes from becoming round-changing holes.',
] as const;

const M3_FIX_BIG_2_VARIANTS = [
  'Next round, protect against the couple of big-number holes. Keep the risky shots simple before they turn into doubles or worse.',
  'Next round, treat the risky holes with more patience. One safer decision can keep a double from becoming the story.',
  'Next round, when trouble shows up, take the boring shot back into play first.',
  "Next round, keep the couple of costly holes from becoming the round's main story.",
] as const;

const M3_FIX_BIG_ONE_VARIANTS = [
  'Next round, protect against the one hole that can turn a normal score into a big number.',
  'Next round, when one hole starts going sideways, make the next shot the safe one.',
  'Next round, keep the damage to one mistake instead of letting the hole snowball.',
  "Next round, keep one bad hole from becoming the round's main memory.",
] as const;

const M3_FIX_PENALTIES_VARIANTS = [
  'Next round, choose the target with the most room when trouble is in play.',
  'Next round, aim away from the penalty first and let the score come from staying in play.',
  'Next round, when trouble is close, make the safer target the default.',
  'Next round, keep the ball in play first. The aggressive line is not worth it if penalty is in play.',
] as const;

const M3_FIX_PUTTING_VARIANTS = [
  'Next round, focus on first-putt pace and leave distance before worrying about makes.',
  'Next round, make speed control the first putting goal.',
  'Next round, protect against the three-putt first and let the makes come after that.',
  'Next round, leave the first putt closer before chasing every make.',
] as const;

const M3_FIX_OFF_TEE_VARIANTS = [
  'Next round, keep tee shots playable before chasing distance.',
  'Next round, make the first goal off the tee simple: keep the ball in play.',
  'Next round, choose the club or target that keeps the hole in front of you.',
  'Next round, playable beats perfect off the tee.',
] as const;

const M3_FIX_SHORT_GAME_VARIANTS = [
  'Next round, choose the recovery shot that leaves the simplest next putt.',
  'Next round, make the short-game goal simple: leave the next putt manageable.',
  'Next round, take the recovery shot that removes the big miss first.',
  'Next round, play the short-game shot that keeps double out of play.',
] as const;

const M3_FIX_GENERIC_VARIANTS = [
  'Next round, fix one clear leak first and keep the rest of the plan simple.',
  'Next round, pick the easiest leak to clean up and do not chase everything at once.',
  'Next round, make one fix the priority instead of rebuilding the whole round.',
  'Next round, keep the plan simple and clean up the clearest leak first.',
] as const;

const M3_BUILD_FIRST_WITH_STRONG_VARIANTS = [
  'Next round, watch whether this same {areaLabel} strength shows up again. One more similar round will make this pattern much clearer.',
  'Next round, look for the same {areaLabel} strength again. That will tell you if it is starting to repeat.',
  'Next round, keep an eye on {areaLabel}. One more round like this makes the pattern easier to trust.',
  'Next round, see if {areaLabel} shows up again before changing too much.',
] as const;

const M3_BUILD_FIRST_NO_STRONG_VARIANTS = [
  'Next round, add one or two optional stats so GolfIQ can build a clearer pattern from this starting point.',
  'Next round, add a couple of basics like putts or greens so the round story gets clearer.',
  'Next round, track one extra area and the insight will have more to work with.',
  'Next round, one or two extra stats will help separate what happened from why it happened.',
] as const;

const M3_BUILD_WEAKEST_VARIANTS = [
  'Next round, clean up {areaLabel} first and keep the rest of the plan simple.',
  'Next round, start with {areaLabel}. Tighten that up before chasing fixes everywhere else.',
  'Next round, make {areaLabel} the first checkpoint and keep the rest of the round simple.',
  'Next round, make {areaLabel} the first priority and keep the rest simple.',
] as const;

const M3_BUILD_STRONGEST_VARIANTS = [
  'Next round, keep leaning on {areaLabel} and check whether it repeats.',
  'Next round, look for {areaLabel} again and see if it holds up.',
  'Next round, keep trusting {areaLabel} and let another round confirm it.',
  'Next round, make {areaLabel} the part you try to carry forward.',
] as const;

const M3_BUILD_GENERIC_VARIANTS = [
  'Next round, watch whether the same pattern shows up again. One more round will make the read clearer.',
  'Next round, look for the same pattern again before changing too much.',
  'Next round, keep tracking the same basics. One more round will make this pattern easier to trust.',
  'Next round, give the pattern one more round before making a big conclusion.',
] as const;

function pickVariant(identity: RoundIdentity, variants: readonly string[], salt: string): string {
  if (!identity.inputHash) return variants[0];
  const seed = `${identity.inputHash}:${salt}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return variants[hash % variants.length];
}

function pickTemplate<TContext>(
  identity: RoundIdentity,
  salt: string,
  variants: ReadonlyArray<(ctx: TContext) => string>,
): (ctx: TContext) => string {
  if (!identity.inputHash) return variants[0];
  const seed = `${identity.inputHash}:${salt}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return variants[hash % variants.length];
}

function ensurePeriod(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinSentences(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .map((part) => ensurePeriod(part))
    .join(' ');
}

function buildLeadWithBaseline(lead: string, baselineDeltaText?: string | null): string {
  if (!baselineDeltaText) return lead;
  const cleanedBaseline = baselineDeltaText.trim().replace(/\.$/, '');
  if (/^You shot /i.test(lead)) {
    return `${lead}, which was ${cleanedBaseline}`;
  }
  return `${lead}. ${cleanedBaseline}`;
}

function parsePutts(detailText?: string): { total: number | null; perHole: string | null } {
  if (!detailText) return { total: null, perHole: null };
  const totalMatch = detailText.match(/Putts:\s*(\d+)/i);
  const perHoleMatch = detailText.match(/\(([\d.]+)\s*per hole\)/i);
  return {
    total: totalMatch ? Number(totalMatch[1]) : null,
    perHole: perHoleMatch ? perHoleMatch[1] : null,
  };
}

function parseGir(detailText?: string): { made: number | null; total: number | null } {
  if (!detailText) return { made: null, total: null };
  const match = detailText.match(/Greens in regulation:\s*(\d+)\s*\/\s*(\d+)/i);
  return {
    made: match ? Number(match[1]) : null,
    total: match ? Number(match[2]) : null,
  };
}

function parseFairways(detailText?: string): { made: number | null; total: number | null } {
  if (!detailText) return { made: null, total: null };
  const match = detailText.match(/Fairways hit:\s*(\d+)(?:\s*\/\s*(\d+))?/i);
  return {
    made: match ? Number(match[1]) : null,
    total: match?.[2] ? Number(match[2]) : null,
  };
}

function parsePenalties(detailText?: string): number | null {
  if (!detailText) return null;
  const match = detailText.match(/Penalty strokes:\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function parseDoubleOrWorseCount(text?: string): number | null {
  if (!text) return null;
  const match = text.match(/(\d+)\s+double-or-worse hole/i);
  return match ? Number(match[1]) : null;
}

function countWord(count: number): string {
  if (count === 1) return 'One';
  if (count === 2) return 'Two';
  if (count === 3) return 'Three';
  if (count === 4) return 'Four';
  if (count === 5) return 'Five';
  if (count === 6) return 'Six';
  if (count === 7) return 'Seven';
  if (count === 8) return 'Eight';
  if (count === 9) return 'Nine';
  if (count === 10) return 'Ten';
  return String(count);
}

function getBigNumberCount(identity: RoundIdentity): number | null {
  const weakest = identity.displayEvidence?.weakestArea;
  const hbhStory = identity.displayEvidence?.hbhStory;
  return (
    parseDoubleOrWorseCount(weakest?.valueText) ??
    parseDoubleOrWorseCount(weakest?.detailText) ??
    parseDoubleOrWorseCount(hbhStory?.detailText)
  );
}

function getPenaltyCount(identity: RoundIdentity): number | null {
  const weakest = identity.displayEvidence?.weakestArea;
  const strongest = identity.displayEvidence?.strongestArea;
  return parsePenalties(weakest?.detailText) ?? parsePenalties(strongest?.detailText);
}

function getCountText(count: number | null | undefined): string {
  if (count == null || count <= 0) return 'A couple';
  if (count === 1) return 'One';
  if (count === 2) return 'A couple';
  return countWord(count);
}

function getCountTextLower(count: number | null | undefined): string {
  return getCountText(count).toLowerCase();
}

function hasRepeatedDamageDominance(identity: RoundIdentity): boolean {
  const bigNumberCount = getBigNumberCount(identity);
  const penaltyCount = getPenaltyCount(identity);
  if (bigNumberCount != null && bigNumberCount >= 3) return true;
  if (penaltyCount != null && penaltyCount >= 3) return true;
  if (identity.primaryKey === 'penalty_damaged' && bigNumberCount != null && bigNumberCount >= 2) return true;
  return false;
}

function areaLabel(area: AreaKey): string {
  if (area === 'putting') return 'putting';
  if (area === 'approach') return 'approach play';
  if (area === 'off_tee') return 'tee-shot control';
  if (area === 'short_game') return 'short-game recovery';
  if (area === 'penalties') return 'risk control';
  if (area === 'big_numbers') return 'damage control';
  if (area === 'scoring') return 'scoring control';
  return 'this pattern';
}

function goodScoreBadProcessAreaLine(identity: RoundIdentity): string {
  const area = identity.displayEvidence?.weakestArea?.area;
  if (area === 'approach') return 'The score improved, but approach play still left too much work.';
  if (area === 'off_tee') return 'The score improved, but tee shots still left too many holes playing from defense.';
  if (area === 'putting') return 'The score improved, but putting still left strokes on the greens.';
  if (area === 'short_game') return 'The score improved, but the short game still had too much cleanup work.';
  if (area === 'penalties') {
    return 'The score improved, but penalty strokes still made the round harder than it needed to be.';
  }
  if (area === 'big_numbers') return 'The score improved, but the costly holes still carried too much of the score.';
  return 'The score improved, but one part of the game still needs attention.';
}

function hasDamageSignal(identity: RoundIdentity): boolean {
  return identity.modifiers.some((modifier) => DAMAGE_MODIFIERS.has(modifier));
}

function hasModifier(identity: RoundIdentity, key: RoundIdentity['modifiers'][number]): boolean {
  return identity.modifiers.includes(key);
}

function shouldSuppressRepeatedBogeysInM1(identity: RoundIdentity): boolean {
  const bigNumberCount = getBigNumberCount(identity);
  const penaltyCount = getPenaltyCount(identity);
  return (
    identity.primaryKey === 'penalty_damaged' ||
    identity.primaryKey === 'big_number' ||
    (bigNumberCount != null && bigNumberCount >= 2) ||
    (penaltyCount != null && penaltyCount >= 2)
  );
}

function summaryLowercaseIfSafe(summary: string): string | null {
  const trimmed = summary.trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z]/.test(trimmed)) return null;
  if (/^[A-Z]{2}/.test(trimmed)) return null;
  if (/^You\b/.test(trimmed)) return null;
  const lowered = `${trimmed[0].toLowerCase()}${trimmed.slice(1)}`;
  return lowered;
}

function selectM1AddOn(identity: RoundIdentity, options?: { allowHBH?: boolean; primaryCoversRepeatedDamage?: boolean }): string | null {
  const allowHBH = options?.allowHBH ?? true;
  const primaryCoversRepeatedDamage = options?.primaryCoversRepeatedDamage ?? false;
  const repeatedDamageDominance = hasRepeatedDamageDominance(identity);
  const hbhStoryText = identity.evidenceLevel === 'hole_by_hole' ? identity.displayEvidence?.hbhStory?.detailText : null;

  if (hasModifier(identity, 'one_hole_damage') && !repeatedDamageDominance && !hbhStoryText) {
    return pickVariant(
      identity,
      [
        'One hole did more damage than the rest of the round.',
        'Most of the damage came from one costly hole.',
        'One hole changed the round more than the others.',
        'The round was mostly manageable outside one costly hole.',
      ],
      'm1-addon-one-hole-damage',
    );
  }

  if (hasModifier(identity, 'blow_up_stretch') && !repeatedDamageDominance && !hbhStoryText) {
    return pickVariant(
      identity,
      [
        'The damage came in a stretch instead of being spread evenly.',
        'One rough stretch changed the shape of the round.',
        'The round got away during a short stretch of costly holes.',
        'A few holes in a row did more damage than the rest of the round.',
      ],
      'm1-addon-blow-up-stretch',
    );
  }

  if (allowHBH && hbhStoryText) return hbhStoryText;

  if (hasModifier(identity, 'slow_start_strong_finish')) {
    return pickVariant(
      identity,
      [
        'The round got better as it went, which is a useful signal.',
        'The finish was stronger than the start, which gives you something to build from.',
        'You found a better rhythm later in the round.',
        'The late holes were cleaner than the early ones.',
      ],
      'm1-addon-slow-start-strong-finish',
    );
  }

  if (hasModifier(identity, 'fast_start_slow_finish')) {
    return pickVariant(
      identity,
      [
        'The start gave you a cushion, but the finish gave some of it back.',
        'The round started cleaner than it finished.',
        'You had the round moving early, but the closing holes added pressure back.',
        'The front part of the round was stronger than the finish.',
      ],
      'm1-addon-fast-start-slow-finish',
    );
  }

  if (hasModifier(identity, 'bounce_back') && !repeatedDamageDominance) {
    return pickVariant(
      identity,
      [
        'You recovered after mistakes instead of letting one hole turn into a full stretch.',
        'The response after mistakes helped keep the round from fully slipping.',
        'You did enough after the bad holes to keep the round from snowballing.',
        'The mistakes happened, but the next holes were not automatic damage.',
      ],
      'm1-addon-bounce-back',
    );
  }

  if (hasModifier(identity, 'par_3_problem')) {
    return pickVariant(
      identity,
      [
        'Par 3s created more pressure than the rest of the round.',
        'The par 3s were where the scorecard got most uncomfortable.',
        'The shorter holes played tougher than they should have.',
        'Par 3 scoring added more stress than expected.',
      ],
      'm1-addon-par3',
    );
  }

  if (hasModifier(identity, 'par_5_scoring')) {
    return pickVariant(
      identity,
      [
        'Par 5 scoring helped keep the round moving.',
        'The par 5s gave the round some needed help.',
        'You got enough out of the par 5s to support the round.',
        'The longer scoring holes helped balance the round.',
      ],
      'm1-addon-par5',
    );
  }

  if (hasModifier(identity, 'repeated_bogeys') && !shouldSuppressRepeatedBogeysInM1(identity)) {
    return pickVariant(
      identity,
      [
        'This was not one disaster hole. The score leaked through repeated bogeys.',
        'The score slipped through steady bogeys more than one blow-up.',
        'Bogeys kept adding up even without one huge mistake.',
        'The damage came from repeated small leaks instead of one round-changing hole.',
      ],
      'm1-addon-repeated-bogeys',
    );
  }

  if (hasModifier(identity, 'no_damage')) {
    return pickVariant(
      identity,
      [
        'You avoided the kind of big number that usually changes the whole card.',
        'The round stayed clean because the big mistake never arrived.',
        'Avoiding doubles or worse gave the round a stable floor.',
        'The round held together because the damage stayed small.',
      ],
      'm1-addon-no-damage',
    );
  }

  if (hasModifier(identity, 'good_score_bad_process')) {
    const variant = pickTemplate(identity, 'm1-addon-good-score-bad-process', [
      () => 'The score was strong, but one part of the game still needs watching.',
      () => goodScoreBadProcessAreaLine(identity),
      () => 'The score held up, but one part of the game still looked shaky.',
      () => 'This was a good result with one part of the round still worth tightening.',
    ]);
    return variant({});
  }

  if (hasModifier(identity, 'bad_score_good_process')) {
    return pickVariant(
      identity,
      [
        'The score does not tell the whole story. There was at least one area worth building from.',
        'The score was frustrating, but one part of the game still held up.',
        'The score was not what you wanted, but there was something useful underneath it.',
        'This was not a wasted round. One part of the game gave you something to keep.',
      ],
      'm1-addon-bad-score-good-process',
    );
  }

  if (!primaryCoversRepeatedDamage && repeatedDamageDominance) {
    return 'Penalties and big numbers shaped the round more than routine mistakes.';
  }

  return null;
}

function applyTemplate(template: string, replacements: Record<string, string | number>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => String(replacements[key] ?? ''));
}

function buildM2BigNumberFirst(identity: RoundIdentity, count: number | null | undefined, saltPrefix: string): string {
  const countText = getCountText(count);
  const countTextLower = getCountTextLower(count);
  const variantFns: Array<(ctx: { countText: string; countTextLower: string }) => string> = [
    ({ countText: c }) => `${c} holes did most of the damage.`,
    ({ countText: c }) => `${c} holes carried too much of the score.`,
    ({ countTextLower: c }) => `The round got away on ${c} costly holes.`,
    ({ countText: c }) => `${c} holes changed the score more than the rest of the round.`,
  ];
  if (count === 1) {
    variantFns[0] = () => 'One costly hole did most of the damage.';
    variantFns[1] = () => 'One costly hole carried too much of the score.';
    variantFns[3] = () => 'One costly hole changed the score more than the rest of the round.';
  }
  if (count === 2) {
    variantFns[0] = () => 'A couple holes did most of the damage.';
    variantFns[1] = () => 'A couple holes carried too much of the score.';
    variantFns[3] = () => 'A couple costly holes changed the score more than the rest of the round.';
  }
  const variant = pickTemplate(identity, `${saltPrefix}-${count ?? 'na'}`, variantFns);
  return variant({ countText, countTextLower });
}

function buildM2BigNumberSecond(identity: RoundIdentity, count: number | null | undefined, saltPrefix: string): string {
  const variants = [
    'Doubles pushed the score higher than it needed to be.',
    'Those holes were the difference between a manageable score and a frustrating one.',
    'Keeping those holes closer to bogey would change the round quickly.',
    'The score climbed fastest when those holes got away.',
  ] as const;
  return pickVariant(identity, variants, `${saltPrefix}-${count ?? 'na'}`);
}

function buildM2PenaltyBigSecond(identity: RoundIdentity, count: number | null | undefined): string {
  return pickVariant(
    identity,
    [
      'Penalties and doubles made the score climb quickly.',
      'The penalties made those holes harder to contain.',
      'Once penalty strokes entered the hole, doubles became much harder to avoid.',
      'Penalty strokes turned those holes into the ones that shaped the round.',
    ],
    `m2-penalty-big-number-second-${count ?? 'na'}`,
  );
}

function buildM2ApproachBigSecond(identity: RoundIdentity, count: number | null | undefined): string {
  return pickVariant(
    identity,
    [
      'Missed greens made those holes harder to contain.',
      'Approach misses left too much recovery work on those holes.',
      'The damage started when the approaches left the hole under pressure.',
      'Those holes became expensive because the green was not reached soon enough.',
    ],
    `m2-approach-big-number-second-${count ?? 'na'}`,
  );
}

export function buildStoryCard(identity: RoundIdentity): string {
  const scoreText = identity.displayEvidence?.scoreText;
  const baselineDeltaText = identity.displayEvidence?.baselineDeltaText;

  if (identity.primaryKey === 'score_only_baseline') {
    return joinSentences([
      scoreText ? `You shot ${scoreText}` : 'Score recorded',
      pickVariant(identity, M1_SCORE_ONLY_BASELINE_VARIANTS, 'm1-score-only-baseline'),
    ]);
  }

  const lead = scoreText ? `You shot ${scoreText}` : identity.summary;
  const leadWithBaseline = buildLeadWithBaseline(lead, baselineDeltaText);
  const opening = baselineDeltaText ? leadWithBaseline : lead;

  if (identity.primaryKey === 'breakthrough') {
    const withDamage = hasDamageSignal(identity) || Boolean(identity.displayEvidence?.hbhStory?.detailText);
    const story = withDamage
      ? pickVariant(identity, M1_BREAKTHROUGH_DAMAGE_VARIANTS, 'm1-breakthrough-damage')
      : pickVariant(identity, M1_BREAKTHROUGH_CLEAN_VARIANTS, 'm1-breakthrough-clean');
    return joinSentences([
      opening,
      baselineDeltaText ? null : 'This round finished clearly ahead of your usual scoring range.',
      story,
      null,
    ]);
  }

  if (identity.primaryKey === 'volatile_scoring' || identity.primaryKey === 'big_number') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_VOLATILE_OR_BIG_VARIANTS, 'm1-volatile-big'),
      selectM1AddOn(identity, { allowHBH: true, primaryCoversRepeatedDamage: true }),
    ]);
  }

  if (identity.primaryKey === 'clean_control') {
    return joinSentences([opening, pickVariant(identity, M1_CLEAN_CONTROL_VARIANTS, 'm1-clean-control')]);
  }

  if (identity.primaryKey === 'approach_carried') {
    return joinSentences([opening, pickVariant(identity, M1_APPROACH_CARRIED_VARIANTS, 'm1-approach-carried')]);
  }

  if (identity.primaryKey === 'putting_saved') {
    return joinSentences([opening, pickVariant(identity, M1_PUTTING_SAVED_VARIANTS, 'm1-putting-saved')]);
  }

  if (identity.primaryKey === 'tee_controlled') {
    return joinSentences([opening, pickVariant(identity, M1_TEE_CONTROLLED_VARIANTS, 'm1-tee-controlled')]);
  }

  if (identity.primaryKey === 'short_game_rescue') {
    return joinSentences([opening, pickVariant(identity, M1_SHORT_GAME_RESCUE_VARIANTS, 'm1-short-game-rescue')]);
  }

  if (identity.primaryKey === 'steady_scoring') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_STEADY_SCORING_VARIANTS, 'm1-steady-scoring'),
      selectM1AddOn(identity, { allowHBH: false }),
    ]);
  }

  if (identity.primaryKey === 'all_around_strong') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_ALL_AROUND_STRONG_VARIANTS, 'm1-all-around-strong'),
      selectM1AddOn(identity, { allowHBH: false }),
    ]);
  }

  if (identity.primaryKey === 'survival') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_SURVIVAL_VARIANTS, 'm1-survival'),
      selectM1AddOn(identity, { allowHBH: false }),
    ]);
  }

  if (identity.primaryKey === 'penalty_damaged') {
    const repeatedDamage = hasRepeatedDamageDominance(identity);
    return joinSentences([
      opening,
      repeatedDamage
        ? pickVariant(identity, M1_PENALTY_DAMAGED_REPEATED_VARIANTS, 'm1-penalty-repeated-damage')
        : pickVariant(identity, M1_PENALTY_DAMAGED_NORMAL_VARIANTS, 'm1-penalty-damaged-normal'),
      repeatedDamage
        ? null
        : selectM1AddOn(identity, { allowHBH: false, primaryCoversRepeatedDamage: false }) ??
          'A few extra strokes changed the round quickly.',
    ]);
  }

  if (identity.primaryKey === 'putting_leak') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_PUTTING_LEAK_VARIANTS, 'm1-putting-leak'),
      selectM1AddOn(identity, { allowHBH: false }),
    ]);
  }

  if (identity.primaryKey === 'scoring_chance_missed') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_SCORING_CHANCE_MISSED_VARIANTS, 'm1-scoring-chance-missed'),
      selectM1AddOn(identity, { allowHBH: false }),
    ]);
  }

  if (identity.primaryKey === 'approach_leak') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_APPROACH_LEAK_VARIANTS, 'm1-approach-leak'),
      selectM1AddOn(identity, { allowHBH: false, primaryCoversRepeatedDamage: true }),
    ]);
  }

  if (identity.primaryKey === 'tee_trouble') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_TEE_TROUBLE_VARIANTS, 'm1-tee-trouble'),
      selectM1AddOn(identity, { allowHBH: false }),
    ]);
  }

  if (identity.primaryKey === 'short_game_pressure') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_SHORT_GAME_PRESSURE_VARIANTS, 'm1-short-game-pressure'),
      selectM1AddOn(identity, { allowHBH: false }),
    ]);
  }

  if (identity.primaryKey === 'everything_leaked') {
    return joinSentences([
      opening,
      pickVariant(identity, M1_EVERYTHING_LEAKED_VARIANTS, 'm1-everything-leaked'),
      selectM1AddOn(identity, { allowHBH: false }),
    ]);
  }

  const safeLower = summaryLowercaseIfSafe(identity.summary);
  const fallback = safeLower
    ? pickVariant(
        identity,
        [
          identity.summary,
          `The main story was simple: ${safeLower}`,
          `The round had a clear theme: ${safeLower}`,
          `The score pointed to this: ${safeLower}`,
        ],
        'm1-generic-fallback',
      )
    : identity.summary;
  return joinSentences([opening, fallback, selectM1AddOn(identity, { allowHBH: true })]);
}

function buildStrengthCardFromArea(identity: RoundIdentity, area: RoundIdentityDisplayAreaEvidence): string {
  if (area.area === 'putting') {
    const putts = parsePutts(area.detailText);
    const template = pickVariant(identity, M2_STRENGTH_PUTTING_VARIANTS, 'm2-strength-putting');
    if (putts.total != null) return applyTemplate(template, { putts: putts.total });
    return "Putting was the round's biggest edge. You converted enough chances to support the score.";
  }

  if (area.area === 'approach') {
    const gir = parseGir(area.detailText);
    const template = pickVariant(identity, M2_STRENGTH_APPROACH_VARIANTS, 'm2-strength-approach');
    if (gir.made != null && gir.total != null) return applyTemplate(template, { made: gir.made, total: gir.total });
    return 'Approach play gave the round structure. You created cleaner scoring chances with approach position.';
  }

  if (area.area === 'off_tee') {
    const fairways = parseFairways(area.detailText);
    if (fairways.made != null && fairways.total != null) {
      const template = pickVariant(identity, M2_STRENGTH_OFF_TEE_VARIANTS, 'm2-strength-off-tee');
      if (template.includes('{made}')) {
        return applyTemplate(template, { made: fairways.made, total: fairways.total });
      }
    }
    return pickVariant(identity, M2_STRENGTH_OFF_TEE_VARIANTS.slice(2), 'm2-strength-off-tee-fallback');
  }

  if (area.area === 'short_game') {
    return pickVariant(identity, M2_STRENGTH_SHORT_GAME_VARIANTS, 'm2-strength-short-game');
  }

  if (area.area === 'penalties') {
    return pickVariant(identity, M2_STRENGTH_PENALTIES_VARIANTS, 'm2-strength-penalties');
  }

  const first = pickVariant(identity, M2_STRENGTH_GENERIC_VARIANTS, 'm2-strength-generic');
  return joinSentences([first, area.detailText]);
}

function buildLeakCardFromArea(identity: RoundIdentity, area: RoundIdentityDisplayAreaEvidence): string {
  if (area.area === 'penalties') {
    const penalties = parsePenalties(area.detailText);
    const penaltySentence =
      penalties != null && penalties > 0
        ? `${penalties === 1 ? 'Even one penalty' : 'A couple penalties'} can turn manageable holes into big numbers.`
        : 'Penalty trouble can turn manageable holes into big numbers quickly.';
    const template = pickVariant(identity, M2_LEAK_PENALTIES_VARIANTS, 'm2-leak-penalties');
    return applyTemplate(template, { penaltySentence });
  }

  if (area.area === 'off_tee') {
    return pickVariant(identity, M2_LEAK_OFF_TEE_VARIANTS, 'm2-leak-off-tee');
  }

  if (area.area === 'approach') {
    return pickVariant(identity, M2_LEAK_APPROACH_VARIANTS, 'm2-leak-approach');
  }

  if (area.area === 'putting') {
    return pickVariant(identity, M2_LEAK_PUTTING_VARIANTS, 'm2-leak-putting');
  }

  if (area.area === 'short_game') {
    return pickVariant(identity, M2_LEAK_SHORT_GAME_VARIANTS, 'm2-leak-short-game');
  }

  if (area.area === 'big_numbers') {
    const count = parseDoubleOrWorseCount(area.valueText) ?? parseDoubleOrWorseCount(area.detailText);
    const first = buildM2BigNumberFirst(identity, count, 'm2-big-number-first');
    const second = buildM2BigNumberSecond(identity, count, 'm2-big-number-second');
    return joinSentences([first, second]);
  }

  return pickVariant(identity, M2_LEAK_GENERIC_VARIANTS, 'm2-leak-generic');
}

export function buildAreaCard(identity: RoundIdentity): string {
  if (identity.primaryKey === 'score_only_baseline') {
    return pickVariant(identity, M2_SCORE_ONLY_BASELINE_VARIANTS, 'm2-score-only-baseline');
  }

  const strongest = identity.displayEvidence?.strongestArea;
  const weakest = identity.displayEvidence?.weakestArea;
  const useLeakFraming = identity.tone === 'fix' || identity.primaryKey === 'penalty_damaged';

  if (identity.primaryKey === 'penalty_damaged' && weakest?.area === 'big_numbers') {
    const count = parseDoubleOrWorseCount(weakest.valueText) ?? parseDoubleOrWorseCount(weakest.detailText);
    const first = buildM2BigNumberFirst(identity, count, 'm2-penalty-big-number-first');
    const second = buildM2PenaltyBigSecond(identity, count);
    return joinSentences([first, second]);
  }

  if (identity.primaryKey === 'approach_leak' && weakest?.area === 'big_numbers') {
    const count = parseDoubleOrWorseCount(weakest.valueText) ?? parseDoubleOrWorseCount(weakest.detailText);
    const first = buildM2BigNumberFirst(identity, count, 'm2-approach-big-number-first');
    const second = buildM2ApproachBigSecond(identity, count);
    return joinSentences([first, second]);
  }

  if (useLeakFraming && weakest) return buildLeakCardFromArea(identity, weakest);
  if (strongest) return buildStrengthCardFromArea(identity, strongest);
  if (weakest) return buildLeakCardFromArea(identity, weakest);

  if (identity.primaryKey === 'everything_leaked') {
    return pickVariant(identity, M2_EVERYTHING_FALLBACK_VARIANTS, 'm2-everything-fallback');
  }

  if (identity.primaryKey === 'all_around_strong') {
    return pickVariant(identity, M2_ALL_AROUND_BALANCE_VARIANTS, 'm2-all-around-balance');
  }

  return pickVariant(identity, M2_GENERIC_SUMMARY_VARIANTS, 'm2-generic-summary');
}

function buildRepeatFocus(identity: RoundIdentity): string {
  const strongest = identity.displayEvidence?.strongestArea;
  const weakest = identity.displayEvidence?.weakestArea;

  if (weakest?.area === 'big_numbers' || hasDamageSignal(identity) || identity.primaryKey === 'big_number' || identity.primaryKey === 'volatile_scoring') {
    const doubles = parseDoubleOrWorseCount(weakest?.valueText) ?? parseDoubleOrWorseCount(identity.displayEvidence?.hbhStory?.detailText);
    if (doubles != null && doubles >= 2) {
      return pickVariant(identity, M3_REPEAT_DAMAGE_COUPLE_VARIANTS, 'm3-repeat-damage-couple');
    }
    return pickVariant(identity, M3_REPEAT_DAMAGE_ONE_VARIANTS, 'm3-repeat-damage-one');
  }

  if (hasModifier(identity, 'par_3_problem')) {
    return pickVariant(identity, M3_REPEAT_PAR3_VARIANTS, 'm3-repeat-par3');
  }
  if (hasModifier(identity, 'par_5_scoring')) {
    return pickVariant(identity, M3_REPEAT_PAR5_VARIANTS, 'm3-repeat-par5');
  }
  if (hasModifier(identity, 'slow_start_strong_finish')) {
    return pickVariant(identity, M3_REPEAT_SLOW_START_STRONG_FINISH_VARIANTS, 'm3-repeat-slow-start-strong-finish');
  }
  if (hasModifier(identity, 'fast_start_slow_finish')) {
    return pickVariant(identity, M3_REPEAT_FAST_START_SLOW_FINISH_VARIANTS, 'm3-repeat-fast-start-slow-finish');
  }
  if (hasModifier(identity, 'bounce_back')) {
    return pickVariant(identity, M3_REPEAT_BOUNCE_VARIANTS, 'm3-repeat-bounce');
  }
  if (hasModifier(identity, 'repeated_bogeys')) {
    return pickVariant(identity, M3_REPEAT_REPEATED_BOGEYS_VARIANTS, 'm3-repeat-bogeys');
  }
  if (hasModifier(identity, 'no_damage')) {
    return pickVariant(identity, M3_REPEAT_NO_DAMAGE_VARIANTS, 'm3-repeat-no-damage');
  }
  if (hasModifier(identity, 'good_score_bad_process')) {
    return pickVariant(identity, M3_REPEAT_GOOD_SCORE_BAD_PROCESS_VARIANTS, 'm3-repeat-good-score-bad-process');
  }
  if (hasModifier(identity, 'bad_score_good_process')) {
    return pickVariant(identity, M3_REPEAT_BAD_SCORE_GOOD_PROCESS_VARIANTS, 'm3-repeat-bad-score-good-process');
  }

  if (strongest) {
    const template = pickVariant(identity, M3_REPEAT_AREA_VARIANTS, 'm3-repeat-area');
    return applyTemplate(template, { areaLabel: areaLabel(strongest.area) });
  }

  return pickVariant(identity, M3_REPEAT_GENERIC_VARIANTS, 'm3-repeat-generic');
}

function buildFixFocus(identity: RoundIdentity): string {
  if (identity.primaryKey === 'approach_leak') {
    return pickVariant(identity, M3_FIX_APPROACH_VARIANTS, 'm3-fix-approach');
  }

  const weakest = identity.displayEvidence?.weakestArea;
  const bigNumberCount = getBigNumberCount(identity);
  const repeatedDamage = hasRepeatedDamageDominance(identity);
  if (repeatedDamage && bigNumberCount != null && bigNumberCount >= 3) {
    return pickVariant(identity, M3_FIX_BIG_3PLUS_VARIANTS, `m3-fix-big-3plus-${bigNumberCount}`);
  }
  if (bigNumberCount === 2) {
    return pickVariant(identity, M3_FIX_BIG_2_VARIANTS, `m3-fix-big-2-${bigNumberCount}`);
  }
  if (weakest?.area === 'penalties') {
    return pickVariant(identity, M3_FIX_PENALTIES_VARIANTS, 'm3-fix-penalties');
  }
  if (weakest?.area === 'putting') {
    return pickVariant(identity, M3_FIX_PUTTING_VARIANTS, 'm3-fix-putting');
  }
  if (weakest?.area === 'approach') {
    return pickVariant(identity, M3_FIX_APPROACH_VARIANTS, 'm3-fix-approach');
  }
  if (weakest?.area === 'off_tee') {
    return pickVariant(identity, M3_FIX_OFF_TEE_VARIANTS, 'm3-fix-off-tee');
  }
  if (weakest?.area === 'short_game') {
    return pickVariant(identity, M3_FIX_SHORT_GAME_VARIANTS, 'm3-fix-short-game');
  }
  if (weakest?.area === 'big_numbers') {
    return pickVariant(identity, M3_FIX_BIG_ONE_VARIANTS, `m3-fix-big-one-${bigNumberCount ?? 'na'}`);
  }
  return pickVariant(identity, M3_FIX_GENERIC_VARIANTS, 'm3-fix-generic');
}

function buildBuildFocus(identity: RoundIdentity): string {
  const strongest = identity.displayEvidence?.strongestArea;
  const weakest = identity.displayEvidence?.weakestArea;

  if (identity.sampleContext === 'first_round' && strongest) {
    const template = pickVariant(identity, M3_BUILD_FIRST_WITH_STRONG_VARIANTS, 'm3-build-first-strong');
    return applyTemplate(template, { areaLabel: areaLabel(strongest.area) });
  }
  if (identity.sampleContext === 'first_round') {
    return pickVariant(identity, M3_BUILD_FIRST_NO_STRONG_VARIANTS, 'm3-build-first-no-strong');
  }
  if (weakest) {
    const template = pickVariant(identity, M3_BUILD_WEAKEST_VARIANTS, 'm3-build-weakest');
    return applyTemplate(template, { areaLabel: areaLabel(weakest.area) });
  }
  if (strongest) {
    const template = pickVariant(identity, M3_BUILD_STRONGEST_VARIANTS, 'm3-build-strongest');
    return applyTemplate(template, { areaLabel: areaLabel(strongest.area) });
  }
  return pickVariant(identity, M3_BUILD_GENERIC_VARIANTS, 'm3-build-generic');
}

export function buildWatchCard(identity: RoundIdentity): string {
  if (identity.tone === 'explain') {
    return pickVariant(identity, M3_EXPLAIN_VARIANTS, 'sparse-watch');
  }
  if (identity.tone === 'repeat') return buildRepeatFocus(identity);
  if (identity.tone === 'fix') return buildFixFocus(identity);
  return buildBuildFocus(identity);
}

