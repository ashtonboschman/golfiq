import { captureServerEvent } from '@/lib/analytics/server';

describe('server analytics delivery', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalProjectKey = process.env.POSTHOG_PROJECT_KEY;
  const originalPublicProjectKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
    if (originalProjectKey === undefined) delete mutableEnv.POSTHOG_PROJECT_KEY;
    else mutableEnv.POSTHOG_PROJECT_KEY = originalProjectKey;
    if (originalPublicProjectKey === undefined) delete mutableEnv.NEXT_PUBLIC_POSTHOG_KEY;
    else mutableEnv.NEXT_PUBLIC_POSTHOG_KEY = originalPublicProjectKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('keeps a provider delivery failure best-effort instead of rejecting the caller', async () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.POSTHOG_PROJECT_KEY = 'test-project-key';
    delete mutableEnv.NEXT_PUBLIC_POSTHOG_KEY;
    global.fetch = jest.fn().mockRejectedValue(new Error('provider unavailable'));

    await expect(captureServerEvent({
      event: 'round_add_completed',
      distinctId: 'synthetic-user',
      properties: { round_id: 'synthetic-round' },
    })).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
