import { createLatestAutosaveQueue } from '@/lib/rounds/latestAutosaveQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('createLatestAutosaveQueue', () => {
  it('serializes saves and persists a newer value after the active request', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const save = jest
      .fn<Promise<string>, [string]>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const savedValues: string[] = [];
    const queue = createLatestAutosaveQueue({
      save,
      onSaved: (value) => savedValues.push(value),
    });

    queue.enqueue('score 4');
    const flush = queue.flush();
    expect(save).toHaveBeenCalledTimes(1);

    queue.enqueue('score 5');
    const overlappingFlush = queue.flush();
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve('saved 4');
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('score 5');

    second.resolve('saved 5');
    await expect(flush).resolves.toBe(true);
    await expect(overlappingFlush).resolves.toBe(true);
    expect(savedValues).toEqual(['score 4', 'score 5']);
    expect(queue.hasWork()).toBe(false);
  });

  it('keeps only the latest queued value when an older request fails', async () => {
    const first = deferred<string>();
    const save = jest
      .fn<Promise<string>, [string]>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce('saved latest');
    const queue = createLatestAutosaveQueue({ save });

    queue.enqueue('old notes');
    const failedFlush = queue.flush();
    queue.enqueue('latest notes');
    first.reject(new Error('offline'));

    await expect(failedFlush).resolves.toBe(false);
    expect(queue.hasWork()).toBe(true);

    await expect(queue.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, 'latest notes');
    expect(queue.hasWork()).toBe(false);
  });

  it('retains a failed value for retry when no newer value exists', async () => {
    const save = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('saved');
    const queue = createLatestAutosaveQueue({ save });

    queue.enqueue('score 6');
    await expect(queue.flush()).resolves.toBe(false);
    await expect(queue.flush()).resolves.toBe(true);

    expect(save).toHaveBeenNthCalledWith(1, 'score 6');
    expect(save).toHaveBeenNthCalledWith(2, 'score 6');
  });
});
