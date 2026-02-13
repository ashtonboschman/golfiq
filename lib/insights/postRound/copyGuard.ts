export const BANNED_TOKENS: readonly string[] = [
  'consider',
  'could',
  'might',
  'seems',
  'challenge',
  'needs more focus',
  'significant impact',
  'crucial',
  'moving forward',
  'opportunity for success',
  'enhance scoring',
  'decision-making on the greens',
  'improve your efficiency',
  'keep a close eye on',
  'round context',
  '—',
  '–',
  '&mdash;',
];

export function assertNoBannedCopy(
  text: string,
  context: { messageKey: string; outcome: string; variantIndex: number },
): void {
  if (process.env.NODE_ENV === 'production') return;

  const lower = String(text ?? '').toLowerCase();
  const token = BANNED_TOKENS.find((candidate) => lower.includes(candidate.toLowerCase()));
  if (!token) return;

  throw new Error(
    `Banned copy token "${token}" in ${context.messageKey} (${context.outcome}) variant ${context.variantIndex}: ${text}`,
  );
}
