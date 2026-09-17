/** @jest-environment jsdom */
import { canShareImage, downloadShareImage, isShareCancelled, shareImage } from '../shareImage';
import { isNativeApp } from '@/lib/platform';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

jest.mock('@/lib/platform', () => ({ isNativeApp: jest.fn(() => false) }));
jest.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: { writeFile: jest.fn(), deleteFile: jest.fn() } }));
jest.mock('@capacitor/share', () => ({ Share: { share: jest.fn() } }));

const file = new File(['png'], 'golfiq-round.png', { type: 'image/png' });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isNativeApp).mockReturnValue(false);
  Object.defineProperty(navigator, 'share', { configurable: true, value: jest.fn().mockResolvedValue(undefined) });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: jest.fn().mockReturnValue(true) });
  URL.createObjectURL = jest.fn(() => 'blob:share');
  URL.revokeObjectURL = jest.fn();
});

test('Web Share receives the prepared PNG File directly', async () => {
  const promise = shareImage(file, 'Round text');
  expect(navigator.share).toHaveBeenCalledWith({ files: [file], text: 'Round text', title: 'GolfIQ Round Recap' });
  await promise;
});
test('unsupported file sharing falls back to download and releases the URL', async () => {
  jest.useFakeTimers();
  jest.mocked(navigator.canShare).mockReturnValue(false);
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  expect(canShareImage(file)).toBe(false);
  await shareImage(file, 'text');
  expect(click).toHaveBeenCalled();
  expect(navigator.share).not.toHaveBeenCalled();
  jest.runAllTimers();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:share');
  click.mockRestore();
  jest.useRealTimers();
});
test('capability exceptions safely fall back', () => {
  jest.mocked(navigator.canShare).mockImplementation(() => { throw new Error('unsupported'); });
  expect(canShareImage(file)).toBe(false);
  expect(typeof downloadShareImage).toBe('function');
});
test.each([undefined, new Error('Share canceled'), new Error('Native failure')])('native uses a temporary PNG and cleans up on every outcome: %s', async error => {
  jest.mocked(isNativeApp).mockReturnValue(true);
  jest.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///cache/share.png' });
  jest.mocked(Filesystem.deleteFile).mockResolvedValue(undefined);
  if (error) jest.mocked(Share.share).mockRejectedValue(error);
  else jest.mocked(Share.share).mockResolvedValue({});
  const promise = shareImage(file, 'Round text');
  if (error) await expect(promise).rejects.toBe(error);
  else await promise;
  expect(Filesystem.writeFile).toHaveBeenCalledWith({ path: expect.stringMatching(/^golfiq-share-.*\.png$/), directory: 'CACHE', data: 'cG5n' });
  expect(Share.share).toHaveBeenCalledWith({ files: ['file:///cache/share.png'], text: 'Round text', title: 'GolfIQ Round Recap' });
  expect(Filesystem.deleteFile).toHaveBeenCalledWith({ path: expect.stringMatching(/^golfiq-share-.*\.png$/), directory: 'CACHE' });
});
test('recognizes browser and Capacitor cancellations without swallowing genuine failures', () => {
  expect(isShareCancelled(new DOMException('Cancelled', 'AbortError'))).toBe(true);
  expect(isShareCancelled(new Error('Share canceled'))).toBe(true);
  expect(isShareCancelled(new Error('Native failure'))).toBe(false);
});
