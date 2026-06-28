type LatestAutosaveQueueOptions<TValue, TResult> = {
  save: (value: TValue) => Promise<TResult>;
  onSaving?: (value: TValue) => void;
  onSaved?: (value: TValue, result: TResult, hasNewerPendingValue: boolean) => void;
  onError?: (error: unknown, value: TValue) => void;
};

export type LatestAutosaveQueue<TValue> = {
  enqueue: (value: TValue) => void;
  flush: () => Promise<boolean>;
  hasWork: () => boolean;
};

export function createLatestAutosaveQueue<TValue, TResult>(
  options: LatestAutosaveQueueOptions<TValue, TResult>,
): LatestAutosaveQueue<TValue> {
  let pendingValue: TValue | undefined;
  let hasPendingValue = false;
  let activeFlush: Promise<boolean> | null = null;

  const drain = async () => {
    while (hasPendingValue) {
      const value = pendingValue as TValue;
      pendingValue = undefined;
      hasPendingValue = false;
      options.onSaving?.(value);

      let result: TResult;
      try {
        result = await options.save(value);
      } catch (error) {
        // A newer complete payload supersedes the failed one. Otherwise retain
        // the failed value so an explicit retry can send it again.
        if (!hasPendingValue) {
          pendingValue = value;
          hasPendingValue = true;
        }
        options.onError?.(error, value);
        return false;
      }

      options.onSaved?.(value, result, hasPendingValue);
    }

    return true;
  };

  const flush = () => {
    if (activeFlush) return activeFlush;

    const run = drain().finally(() => {
      if (activeFlush === run) {
        activeFlush = null;
      }
    });
    activeFlush = run;
    return run;
  };

  return {
    enqueue(value) {
      pendingValue = value;
      hasPendingValue = true;
    },
    flush,
    hasWork() {
      return hasPendingValue || activeFlush !== null;
    },
  };
}
