'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import AppBootVisual from '@/components/AppBootVisual';
import { useModalAccessibility } from '@/lib/ui/useModalAccessibility';
import { buildRoundShareData, roundShareAnalytics, roundShareText, type RoundShareData, type ShareRoundStats } from '@/lib/rounds/shareData';
import { renderShareImage, ROUND_SHARE_RENDER_VERSION } from '@/lib/rounds/renderShareImage';
import { canShareImage, isShareCancelled, shareImage } from '@/lib/rounds/shareImage';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { captureClientEvent } from '@/lib/analytics/client';

type Props = { roundId: string; isPremium: boolean; firstName?: string | null; lastName?: string | null; onClose: () => void };
type ReadyImage = { file: File; url: string; data: RoundShareData; stats: ShareRoundStats };
const analyticsContext = { sourcePage: 'round_details', isLoggedIn: true };

function shareImageAlt(data: RoundShareData) {
  const holes = data.scorecard
    ?.flatMap(band => band.holes)
    .map(hole => `hole ${hole.holeNumber}: ${hole.score} on par ${hole.par}${hole.yardage != null ? `, ${hole.yardage} yards` : ''}`)
    .join('; ');
  const summary = `GolfIQ recap${data.golferName ? ` for ${data.golferName}` : ''}: ${data.score}${data.relativeToPar ? ` (${data.relativeToPar})` : ''}, ${data.course}, ${data.context}.`;
  const scorecard = holes ? ` Hole-by-hole scores: ${holes}.` : '';
  const stats = data.stats.map(stat => `${stat.label} ${stat.value}`).join(', ');
  const strokesGained = data.strokesGained.map(stat => `${stat.label} ${stat.value}`).join(', ');
  return `${summary}${scorecard} ${stats}${strokesGained ? ` Strokes gained: ${strokesGained}.` : ''}`.trim();
}

export default function RoundSharePreview({ roundId, isPremium, firstName, lastName, onClose }: Props) {
  const renderVersion = ROUND_SHARE_RENDER_VERSION;
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState<ReadyImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState('');
  useModalAccessibility({ isOpen: true, dialogRef, initialFocusRef: cancelRef, onDismiss: onClose });

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setReady(null);
    setError(null);
    setNotice('');
    async function generate() {
      try {
        // Fresh ownership validation on every preview/retry.
        const statsResponse = await fetch(`/api/rounds/${roundId}/stats`, { cache: 'no-store', credentials: 'include', signal: controller.signal });
        if (!statsResponse.ok) throw new Error('Round unavailable');
        const { stats } = await statsResponse.json();
        const data = buildRoundShareData(stats, isPremium, { firstName, lastName });
        const blob = await renderShareImage(data);
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setReady({ file: new File([blob], 'golfiq-round.png', { type: 'image/png' }), url: objectUrl, data, stats });
      } catch {
        if (disposed) return;
        setError('Could not create your share image. Check your connection and try again.');
        captureClientEvent(ANALYTICS_EVENTS.roundShareFailed, { stage: 'generation' }, analyticsContext);
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void generate();
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [roundId, isPremium, firstName, lastName, attempt, renderVersion]);

  const invokeShare = async () => {
    if (!ready || busyRef.current) return;
    busyRef.current = true;
    setSharing(true);
    setError(null);
    setNotice('');
    captureClientEvent(ANALYTICS_EVENTS.roundShareInvoked, {
      ...roundShareAnalytics(ready.stats, ready.data), method: canShareImage(ready.file) ? 'share_sheet' : 'download',
    }, analyticsContext);
    try {
      await shareImage(ready.file, roundShareText(ready.data));
    } catch (cause) {
      if (isShareCancelled(cause)) setNotice('Sharing cancelled. Your image is ready when you are.');
      else {
        setError('Could not open sharing. Try again.');
        captureClientEvent(ANALYTICS_EVENTS.roundShareFailed, { ...roundShareAnalytics(ready.stats, ready.data), stage: 'sharing' }, analyticsContext);
      }
    } finally {
      busyRef.current = false;
      setSharing(false);
    }
  };

  return createPortal(
    <div className="round-share-overlay">
      <div ref={dialogRef} className="round-share-dialog" role="dialog" aria-modal="true" aria-label="Share Round" tabIndex={-1}>
        <div className="round-share-scroll">
          <div className="round-share-image" aria-busy={!ready && !error}>
            {ready ? <Image src={ready.url} alt={shareImageAlt(ready.data)} width={1080} height={1350} unoptimized /> :
              error ? <p>Image Unavailable</p> :
                <div className="round-share-loading" role="status" aria-live="polite" aria-label="Creating Your Share Image">
                  <AppBootVisual />
                </div>}
          </div>
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
        </div>
        <div className="modal-buttons">
          <button ref={cancelRef} className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {!ready && error ? <button className="btn btn-primary" onClick={() => setAttempt(value => value + 1)}>Retry</button> :
            <button className="btn btn-primary" disabled={!ready || sharing} onClick={invokeShare}>
              {sharing ? 'Opening Share…' : 'Share'}
            </button>}
        </div>
      </div>
    </div>, document.body,
  );
}
