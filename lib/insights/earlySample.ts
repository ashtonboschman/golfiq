export const EARLY_SIGNAL_STANDARD_COPY =
  'GolfIQ can spot early signals from your first rounds. A few more rounds will make the picture clearer.';

export const TRENDS_STARTING_TO_FORM_COPY = 'Still early, but a pattern is starting to show.';

export function getEarlySampleMessage(roundCount: number | null | undefined): string | null {
  if (roundCount == null || !Number.isFinite(roundCount)) return null;
  if (roundCount <= 2) return EARLY_SIGNAL_STANDARD_COPY;
  if (roundCount === 3) return TRENDS_STARTING_TO_FORM_COPY;
  return null;
}
