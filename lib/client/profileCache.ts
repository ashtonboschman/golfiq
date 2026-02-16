type CachedProfileResponse = any;

const PROFILE_CACHE_TTL_MS = 30_000;

const profileCache = new Map<string, { data: CachedProfileResponse; fetchedAt: number }>();
const inFlightProfileRequests = new Map<string, Promise<CachedProfileResponse | null>>();

export async function fetchProfileCached(userId: string, force = false): Promise<CachedProfileResponse | null> {
  if (!userId) return null;

  const now = Date.now();
  const cached = profileCache.get(userId);

  if (!force && cached && now - cached.fetchedAt < PROFILE_CACHE_TTL_MS) {
    return cached.data;
  }

  if (!force) {
    const inFlight = inFlightProfileRequests.get(userId);
    if (inFlight) {
      return inFlight;
    }
  }

  const request = (async () => {
    const res = await fetch('/api/users/profile');
    if (!res.ok) return null;
    const data = await res.json();
    profileCache.set(userId, {
      data,
      fetchedAt: Date.now(),
    });
    return data;
  })();

  inFlightProfileRequests.set(userId, request);
  try {
    return await request;
  } finally {
    inFlightProfileRequests.delete(userId);
  }
}

export function clearProfileCache(userId?: string) {
  if (userId) {
    profileCache.delete(userId);
    inFlightProfileRequests.delete(userId);
    return;
  }

  profileCache.clear();
  inFlightProfileRequests.clear();
}
