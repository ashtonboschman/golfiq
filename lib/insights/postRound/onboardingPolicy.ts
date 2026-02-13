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

  if (input.roundNumber <= 1) {
    return {
      messages: [
        withGuard(`You logged your first round: ${scoreLine}. Nice start.`, 'OB-1'),
        withGuard(
          'GolfIQ post-round insights will get more specific once you have a small baseline. Log two more rounds to unlock trend-based feedback.',
          'OB-1',
        ),
        withGuard(
          'Next round focus: Keep logging your score. If you can, also track FIR, GIR, putts, and penalties so GolfIQ can compute your measured SG components once trends unlock.',
          'OB-1',
        ),
      ],
      messageLevels: ['success', 'info', 'info'],
      outcomes: ['OB-1', 'OB-1', 'OB-1'],
    };
  }

  const previousScore = input.previousScore ?? input.score;
  const delta = input.score - previousScore;
  const same = Math.abs(delta) < 0.1;
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
            `Round 2 logged: ${scoreLine}, better than your first round by ${absDeltaText} ${strokeLabel}.`,
            'OB-2-BETTER',
          ),
          withGuard(
            'Good signal. One more round and GolfIQ can start describing your early trend with more confidence.',
            'OB-2-BETTER',
          ),
          withGuard(
            'Next round focus: Log your score again to unlock trend insights. If possible, track FIR, GIR, putts, and penalties so GolfIQ can compute your measured SG components once trends unlock.',
            'OB-2-BETTER',
          ),
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
          withGuard(
            'Totally normal early on. One more round and GolfIQ can start describing your early trend with more confidence.',
            'OB-2-WORSE',
          ),
          withGuard(
            'Next round focus: Log your score again to unlock trend insights. If possible, track FIR, GIR, putts, and penalties so GolfIQ can compute your measured SG components once trends unlock.',
            'OB-2-WORSE',
          ),
        ],
        messageLevels: ['success', 'info', 'info'],
        outcomes: ['OB-2-WORSE', 'OB-2-WORSE', 'OB-2-WORSE'],
      };
    }

    return {
      messages: [
        withGuard(`Round 2 logged: ${scoreLine}, matching your first round.`, 'OB-2-SAME'),
        withGuard(
          'That consistency is useful. One more round and GolfIQ can start describing your early trend with more confidence.',
          'OB-2-SAME',
        ),
        withGuard(
          'Next round focus: Log your score again to unlock trend insights. If possible, track FIR, GIR, putts, and penalties so GolfIQ can compute your measured SG components once trends unlock.',
          'OB-2-SAME',
        ),
      ],
      messageLevels: ['success', 'info', 'info'],
      outcomes: ['OB-2-SAME', 'OB-2-SAME', 'OB-2-SAME'],
    };
  }

  if (better) {
    return {
      messages: [
        withGuard(
          `Round 3 logged: ${scoreLine}, better than last round by ${absDeltaText} ${strokeLabel}.`,
          'OB-3-BETTER',
        ),
        withGuard(
          'You now have enough rounds for trend-based insights. Your handicap is unlocked, and your measured breakdown will become more reliable as you keep logging.',
          'OB-3-BETTER',
        ),
        withGuard(
          'Next round focus: Full post-round insights unlock on your next round. Keep tracking FIR, GIR, putts, and penalties to maximize accuracy.',
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
          'You now have enough rounds for trend-based insights. Your handicap is unlocked, and your measured breakdown will become more reliable as you keep logging.',
          'OB-3-WORSE',
        ),
        withGuard(
          'Next round focus: Full post-round insights unlock on your next round. Keep tracking FIR, GIR, putts, and penalties to maximize accuracy.',
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
        'You now have enough rounds for trend-based insights. Your handicap is unlocked, and your measured breakdown will become more reliable as you keep logging.',
        'OB-3-SAME',
      ),
      withGuard(
        'Next round focus: Full post-round insights unlock on your next round. Keep tracking FIR, GIR, putts, and penalties to maximize accuracy.',
        'OB-3-SAME',
      ),
    ],
    messageLevels: ['success', 'info', 'info'],
    outcomes: ['OB-3-SAME', 'OB-3-SAME', 'OB-3-SAME'],
  };
}
