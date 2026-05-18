const ROUND_ADD_DRAFT_VERSION = 1;

function normalizeUserId(userId: string | number | bigint | null | undefined): string | null {
  if (userId == null) return null;
  const normalized = String(userId).trim();
  return normalized.length > 0 ? normalized : null;
}

export function getRoundAddDraftKey(userId: string | number | bigint | null | undefined): string | null {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  return `golfiq:round:add:draft:v${ROUND_ADD_DRAFT_VERSION}:${normalizedUserId}`;
}

export function clearRoundAddDraft(userId: string | number | bigint | null | undefined): void {
  if (typeof window === 'undefined') return;
  const key = getRoundAddDraftKey(userId);
  if (!key) return;

  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}
