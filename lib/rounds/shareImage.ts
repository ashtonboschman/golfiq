import { isNativeApp } from '@/lib/platform';

export function canShareImage(file: File): boolean {
  if (isNativeApp()) return true;
  try { return typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) === true; }
  catch { return false; }
}

export function isShareCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: string; message?: string };
  return value.name === 'AbortError' || value.message === 'Share canceled';
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not prepare the image.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

export function downloadShareImage(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Allow browsers time to consume the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function shareImage(file: File, text: string): Promise<void> {
  if (isNativeApp()) {
    const [{ Share }, { Filesystem, Directory }] = await Promise.all([
      import('@capacitor/share'), import('@capacitor/filesystem'),
    ]);
    const path = `golfiq-share-${crypto.randomUUID()}.png`;
    try {
      const { uri } = await Filesystem.writeFile({ path, directory: Directory.Cache, data: await base64(file) });
      await Share.share({ files: [uri], text, title: 'GolfIQ Round Recap' });
    } finally {
      // Includes cancellation/failure. Never persist the golfer's image in app documents.
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
    }
    return;
  }
  if (canShareImage(file)) {
    // Call directly from the click, with the File already prepared, to preserve user activation.
    await navigator.share({ files: [file], text, title: 'GolfIQ Round Recap' });
    return;
  }
  downloadShareImage(file);
}
