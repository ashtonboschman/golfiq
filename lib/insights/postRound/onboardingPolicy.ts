import { assertNoBannedCopy } from '@/lib/insights/postRound/copyGuard';

export type OnboardingPolicyInput = {
  roundNumber: number;
  score: number;
  toPar: number;
  previousScore: number | null;
};

export type OnboardingPolicyOutput = {
  messages: [string, string, string];
  messageLevels: ['success' | 'info' | 'warning', 'success' | 'info' | 'warning', 'success' | 'info' | 'warning'];
  outcomes: [OnboardingOutcome, OnboardingOutcome, OnboardingOutcome];
};

type OnboardingOutcome =
  | 'OB-1'
  | 'OB-2-BETTER'
  | 'OB-2-SAME'
  | 'OB-2-WORSE'
  | 'OB-3-BETTER'
  | 'OB-3-SAME'
  | 'OB-3-WORSE';

function sanitizeWhitespace(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function formatToPar(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function strokeWord(value: number): string {
  return Math.abs(value - 1) < 0.001 ? 'stroke' : 'strokes';
}

function formatAbsDelta(value: number): string {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) return `${Math.round(rounded)}`;
  return rounded.toFixed(1);
}

function withGuard(message: string, outcome: string, variantIndex = 0): string {
  const text = sanitizeWhitespace(message);
  assertNoBannedCopy(text, { messageKey: 'onboarding', outcome, variantIndex });
  return text;
}

export function buildOnboardingPostRoundInsights(input: OnboardingPolicyInput): OnboardingPolicyOutput {
  if (!Number.isFinite(input.roundNumber) || input.roundNumber < 1 || input.roundNumber > 3) {
    throw new Error(`Unsupported onboarding round number: ${input.roundNumber}`);
  }

  const scoreLine = `${input.score} (${formatToPar(input.toPar)})`;
  const ctaBetter =
    'Next round: Log your score to unlock trend insights. If you can, track fairways, greens, putts, and penalties for a clearer read on what is working and where to keep building.';
  const ctaWorse =
    'Next round: Log your score to unlock trend insights. If you can, track fairways, greens, putts, and penalties for a clearer read on where shots are slipping and what to tighten first.';
  const ctaSame =
    'Next round: Log your score to unlock trend insights. If you can, track fairways, greens, putts, and penalties for a clearer read on what is stable and what could move the score.';

  if (input.roundNumber === 1) {
    return {
      messages: [
        withGuard(`Round 1 logged: ${scoreLine}.`, 'OB-1'),
        withGuard('Nice start. Two more rounds give you enough history for real trend feedback.', 'OB-1'),
        withGuard(
          'Next round: Log your score again. If you can, track fairways, greens, putts, and penalties for clearer insight into what helped and what hurt.',
          'OB-1',
        ),
      ],
      messageLevels: ['success', 'info', 'info'],
      outcomes: ['OB-1', 'OB-1', 'OB-1'],
    };
  }

  const previousScore = input.previousScore ?? input.score;
  const delta = input.score - previousScore;
  const better = delta < -0.1;
  const worse = delta > 0.1;
  const absDelta = Math.abs(delta);
  const absDeltaText = formatAbsDelta(delta);
  const strokeLabel = strokeWord(absDelta);

  if (input.roundNumber === 2) {
    if (better) {
      return {
        messages: [
          withGuard(
            `Round 2 logged: ${scoreLine}, ${absDeltaText} ${strokeLabel} better than your first round.`,
            'OB-2-BETTER',
          ),
          withGuard('Good move. One more round and your early trend will be much clearer.', 'OB-2-BETTER'),
          withGuard(ctaBetter, 'OB-2-BETTER'),
        ],
        messageLevels: ['success', 'info', 'info'],
        outcomes: ['OB-2-BETTER', 'OB-2-BETTER', 'OB-2-BETTER'],
      };
    }

    if (worse) {
      return {
        messages: [
          withGuard(
            `Round 2 logged: ${scoreLine}, ${absDeltaText} ${strokeLabel} higher than your first round.`,
            'OB-2-WORSE',
          ),
          withGuard('That happens. One more round and your starting trend will settle in.', 'OB-2-WORSE'),
          withGuard(ctaWorse, 'OB-2-WORSE'),
        ],
        messageLevels: ['success', 'info', 'info'],
        outcomes: ['OB-2-WORSE', 'OB-2-WORSE', 'OB-2-WORSE'],
      };
    }

    return {
      messages: [
        withGuard(`Round 2 logged: ${scoreLine}, matching your first round.`, 'OB-2-SAME'),
        withGuard('That early consistency is useful. One more round and the trend view unlocks.', 'OB-2-SAME'),
        withGuard(ctaSame, 'OB-2-SAME'),
      ],
      messageLevels: ['success', 'info', 'info'],
      outcomes: ['OB-2-SAME', 'OB-2-SAME', 'OB-2-SAME'],
    };
  }

  // Round 3
  if (better) {
    return {
      messages: [
        withGuard(
          `Round 3 logged: ${scoreLine}, ${absDeltaText} ${strokeLabel} better than last round.`,
          'OB-3-BETTER',
        ),
        withGuard(
          'Three rounds complete. Your trend view and handicap are now live, and the more you track, the sharper the breakdown gets.',
          'OB-3-BETTER',
        ),
        withGuard(
          'Next round: Full post-round insights start. Track fairways, greens, putts, and penalties for the clearest read on what is working and where to keep building.',
          'OB-3-BETTER',
        ),
      ],
      messageLevels: ['success', 'info', 'info'],
      outcomes: ['OB-3-BETTER', 'OB-3-BETTER', 'OB-3-BETTER'],
    };
  }

  if (worse) {
    return {
      messages: [
        withGuard(
          `Round 3 logged: ${scoreLine}, ${absDeltaText} ${strokeLabel} higher than last round.`,
          'OB-3-WORSE',
        ),
        withGuard(
          'Three rounds complete. Your trend view and handicap are now live, and the more you track, the sharper the breakdown gets.',
          'OB-3-WORSE',
        ),
        withGuard(
          'Next round: Full post-round insights start. Track fairways, greens, putts, and penalties for the clearest read on where shots are slipping and what to tighten first.',
          'OB-3-WORSE',
        ),
      ],
      messageLevels: ['success', 'info', 'info'],
      outcomes: ['OB-3-WORSE', 'OB-3-WORSE', 'OB-3-WORSE'],
    };
  }

  return {
    messages: [
      withGuard(`Round 3 logged: ${scoreLine}, matching last round.`, 'OB-3-SAME'),
      withGuard(
        'Three rounds complete. Your trend view and handicap are now live, and the more you track, the sharper the breakdown gets.',
        'OB-3-SAME',
      ),
      withGuard(
        'Next round: Full post-round insights start. Track fairways, greens, putts, and penalties for the clearest read on what is stable and what could move the score.',
        'OB-3-SAME',
      ),
    ],
    messageLevels: ['success', 'info', 'info'],
    outcomes: ['OB-3-SAME', 'OB-3-SAME', 'OB-3-SAME'],
  };
}
