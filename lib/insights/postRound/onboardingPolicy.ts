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

  if (input.roundNumber === 1) {
    return {
      messages: [
        withGuard(`You shot ${scoreLine}. That puts your first round on the board and sets a clear baseline.`, 'OB-1'),
        withGuard('Good start. Early on, the goal is context. Two more rounds give enough history for patterns to start forming.', 'OB-1'),
        withGuard(
          'Next round: Log your score again. If you can, track fairways, greens, putts, and penalties so it is clearer where strokes are coming from.',
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
            `You shot ${scoreLine}. That is ${absDeltaText} ${strokeLabel} better than your first round, a step in the right direction.`,
            'OB-2-BETTER',
          ),
          withGuard(
            'Two rounds are enough to see movement, but not the full picture. One more round adds the context that makes direction clearer.',
            'OB-2-BETTER',
          ),
          withGuard(
            'Next round: Log your score again. If you can, track fairways, greens, putts, and penalties so it is clearer what is driving the improvement.',
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
           `You shot ${scoreLine}. That is ${absDeltaText} ${strokeLabel} higher than your first round, a move in the opposite direction.`,
            'OB-2-WORSE',
          ),
          withGuard(
            'Two rounds are enough to see movement, but not the full picture. One more round adds the context that makes direction clearer.',
            'OB-2-WORSE',
          ),
          withGuard(
            'Next round: Log your score again. If you can, track fairways, greens, putts, and penalties so it is clearer what is pushing the score up.',
            'OB-2-WORSE',
          ),
        ],
        messageLevels: ['success', 'info', 'info'],
        outcomes: ['OB-2-WORSE', 'OB-2-WORSE', 'OB-2-WORSE'],
      };
    }

    return {
      messages: [
        withGuard(
          `You shot ${scoreLine}, matching your first round. That is an early sign of consistency.`,
          'OB-2-SAME',
        ),
        withGuard(
          'Two rounds are enough to see movement, but not the full picture. One more round adds the context that makes direction clearer.',
          'OB-2-SAME',
        ),
        withGuard(
          'Next round: Log your score again. If you can, track fairways, greens, putts, and penalties so it is clearer what is keeping the score steady.',
          'OB-2-SAME',
        ),
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
          `You shot ${scoreLine}. That is ${absDeltaText} ${strokeLabel} better than last round, a step in the right direction.`,
          'OB-3-BETTER',
        ),
        withGuard(
          'Three rounds are now logged. That is enough history for patterns to start showing up with more confidence, and it establishes your first handicap.',
          'OB-3-BETTER',
        ),
        withGuard(
          'Next round: Full post-round insights start. If you can, track fairways, greens, putts, and penalties so it is clearer what is driving the improvement.',
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
          `You shot ${scoreLine}. That is ${absDeltaText} ${strokeLabel} higher than last round, a move in the opposite direction.`,
          'OB-3-WORSE',
        ),
        withGuard(
          'Three rounds are now logged. That is enough history for patterns to start showing up with more confidence, and it establishes your first handicap.',
          'OB-3-WORSE',
        ),
        withGuard(
          'Next round: Full post-round insights start. If you can, track fairways, greens, putts, and penalties so it is clearer what is pushing the score up.',
          'OB-3-WORSE',
        ),
      ],
      messageLevels: ['success', 'info', 'info'],
      outcomes: ['OB-3-WORSE', 'OB-3-WORSE', 'OB-3-WORSE'],
    };
  }

  return {
    messages: [
      withGuard(
        `You shot ${scoreLine}, matching last round. That is a sign of consistency.`,
        'OB-3-SAME',
      ),
      withGuard(
        'Three rounds are now logged. That is enough history for patterns to start showing up with more confidence, and it establishes your first handicap.',
        'OB-3-SAME',
      ),
      withGuard(
        'Next round: Full post-round insights start. If you can, track fairways, greens, putts, and penalties so it is clearer what is keeping the score steady.',
        'OB-3-SAME',
      ),
    ],
    messageLevels: ['success', 'info', 'info'],
    outcomes: ['OB-3-SAME', 'OB-3-SAME', 'OB-3-SAME'],
  };
}
