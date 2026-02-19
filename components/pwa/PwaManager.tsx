'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type PwaConfig = {
  enabled: boolean;
  version: string;
  source: 'default' | 'db' | 'db_error';
};

const TARGET_PATHS = new Set(['/dashboard', '/insights']);
const CACHE_PREFIX = 'golfiq-';
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'golfiq_pwa_install_dismissed_until';
const INSTALLED_KEY = 'golfiq_pwa_install_completed';
const SESSIONS_KEY = 'golfiq_pwa_sessions';
const PAGES_KEY = 'golfiq_pwa_pages_seen';
const SESSION_MARKER_KEY = 'golfiq_pwa_session_active';
const UPDATE_PENDING_KEY = 'golfiq_pwa_update_pending';
const PWA_CONFIG_CACHE_KEY = 'golfiq_pwa_config_cache';
const PWA_CONFIG_CACHE_TS_KEY = 'golfiq_pwa_config_cache_ts';
const PWA_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const SHOW_UPDATE_PROMPT = false;
const DEFAULT_SW_VERSION =
  process.env.NEXT_PUBLIC_SW_VERSION ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  'dev';
const FALLBACK_CONFIG: PwaConfig = {
  enabled: process.env.NODE_ENV !== 'production',
  version: DEFAULT_SW_VERSION,
  source: 'default',
};

function getNow(): number {
  return Date.now();
}

function parseIntSafe(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSeenPages(raw: string | null): Set<string> {
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((value): value is string => typeof value === 'string'));
    return new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function isIosSafariBrowser(): boolean {
  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|opios/.test(ua);
  return isIos && isSafari;
}

function isStandaloneDisplay(): boolean {
  const iOSStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia('(display-mode: standalone)').matches || iOSStandalone === true;
}

async function clearGolfiqCaches() {
  if (!('caches' in window)) return;
  const names = await caches.keys();
  await Promise.all(
    names.map((name) => (name.startsWith(CACHE_PREFIX) ? caches.delete(name) : Promise.resolve(false))),
  );
}

async function disableServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  await clearGolfiqCaches();
}

export default function PwaManager() {
  const posthog = usePostHog();
  const pathname = usePathname();

  const [config, setConfig] = useState<PwaConfig | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [supportsNativeInstallPrompt] = useState(
    () =>
      typeof window !== 'undefined' &&
      ('BeforeInstallPromptEvent' in window || 'onbeforeinstallprompt' in window),
  );
  const [isStandalone, setIsStandalone] = useState(
    () =>
      typeof window !== 'undefined' &&
      (isStandaloneDisplay() || localStorage.getItem(INSTALLED_KEY) === '1'),
  );
  const [isIosSafari] = useState(() => typeof window !== 'undefined' && isIosSafariBrowser());
  const [dismissedUntil, setDismissedUntil] = useState(
    () => (typeof window !== 'undefined' ? parseIntSafe(localStorage.getItem(DISMISS_KEY)) : 0),
  );
  const [sessionCount, setSessionCount] = useState(
    () => (typeof window !== 'undefined' ? parseIntSafe(localStorage.getItem(SESSIONS_KEY)) : 0),
  );
  const [pageVisitCount, setPageVisitCount] = useState(
    () => (typeof window !== 'undefined' ? parseSeenPages(localStorage.getItem(PAGES_KEY)).size : 0),
  );
  const [updateReady, setUpdateReady] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updatePending, setUpdatePending] = useState(
    () => typeof window !== 'undefined' && sessionStorage.getItem(UPDATE_PENDING_KEY) === '1',
  );

  const updateToastTrackedRef = useRef(false);
  const installPromptTrackedRef = useRef('');

  const installEligible = useMemo(() => {
    if (updateReady) return false;
    if (!TARGET_PATHS.has(pathname)) return false;
    if (isStandalone) return false;
    if (dismissedUntil > getNow()) return false;
    if (sessionCount < 2 && pageVisitCount < 3) return false;
    if (deferredPrompt) return true;
    if (supportsNativeInstallPrompt) return false;
    return isIosSafari;
  }, [
    updateReady,
    pathname,
    isStandalone,
    dismissedUntil,
    sessionCount,
    pageVisitCount,
    deferredPrompt,
    supportsNativeInstallPrompt,
    isIosSafari,
  ]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleControllerChange = () => {
      sessionStorage.removeItem(UPDATE_PENDING_KEY);
      setUpdatePending(false);
      setUpdateReady(false);
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  useEffect(() => {
    if (!config) return;

    if (!config.enabled) {
      disableServiceWorkers().catch(() => undefined);
      window.setTimeout(() => {
        setUpdateReady(false);
        setDeferredPrompt(null);
      }, 0);
      return;
    }

    let cancelled = false;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(config.version)}`);
        if (cancelled) return;

        setUpdateRegistration(registration);
        if (updatePending && registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.setTimeout(() => window.location.reload(), 1200);
          return;
        }

        if (registration.waiting) {
          setUpdateReady(true);
          if (SHOW_UPDATE_PROMPT && !updateToastTrackedRef.current) {
            updateToastTrackedRef.current = true;
            posthog.capture('pwa_update_toast_shown', { version: config.version, source: config.source });
          }
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReady(true);
              setUpdateRegistration(registration);
              if (SHOW_UPDATE_PROMPT && !updateToastTrackedRef.current) {
                updateToastTrackedRef.current = true;
                posthog.capture('pwa_update_toast_shown', { version: config.version, source: config.source });
              }
            }
          });
        });
      } catch (error) {
        console.warn('[PWA] Service worker registration failed:', error);
      }
    };

    register();
    return () => {
      cancelled = true;
    };
  }, [config, posthog, updatePending]);

  useEffect(() => {
    const init = async () => {
      const cachedRaw = sessionStorage.getItem(PWA_CONFIG_CACHE_KEY);
      const cachedTs = parseIntSafe(sessionStorage.getItem(PWA_CONFIG_CACHE_TS_KEY));
      if (cachedRaw && cachedTs && getNow() - cachedTs < PWA_CONFIG_CACHE_TTL_MS) {
        try {
          setConfig(JSON.parse(cachedRaw) as PwaConfig);
          return;
        } catch {
          sessionStorage.removeItem(PWA_CONFIG_CACHE_KEY);
          sessionStorage.removeItem(PWA_CONFIG_CACHE_TS_KEY);
        }
      }

      try {
        const response = await fetch('/api/pwa/config', { cache: 'no-store' });
        if (!response.ok) {
          setConfig(FALLBACK_CONFIG);
          return;
        }
        const nextConfig = (await response.json()) as PwaConfig;
        setConfig(nextConfig);
        sessionStorage.setItem(PWA_CONFIG_CACHE_KEY, JSON.stringify(nextConfig));
        sessionStorage.setItem(PWA_CONFIG_CACHE_TS_KEY, String(getNow()));
      } catch {
        setConfig(FALLBACK_CONFIG);
      }
    };

    init();
  }, []);

  useEffect(() => {
    const syncSessionCount = () => {
      const markedInstalled = localStorage.getItem(INSTALLED_KEY) === '1';
      if (markedInstalled) setIsStandalone(true);

      const hasSessionMarker = sessionStorage.getItem(SESSION_MARKER_KEY) === '1';
      const currentSessions = parseIntSafe(localStorage.getItem(SESSIONS_KEY));
      if (hasSessionMarker) {
        setSessionCount(currentSessions);
        return;
      }

      const nextSessions = currentSessions + 1;
      localStorage.setItem(SESSIONS_KEY, String(nextSessions));
      sessionStorage.setItem(SESSION_MARKER_KEY, '1');
      setSessionCount(nextSessions);
    };
    syncSessionCount();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      localStorage.setItem(INSTALLED_KEY, '1');
      setIsStandalone(true);
      setDeferredPrompt(null);
      posthog.capture('pwa_install_accepted', { via: 'appinstalled_event' });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [posthog]);

  useEffect(() => {
    const seen = parseSeenPages(localStorage.getItem(PAGES_KEY));
    seen.add(pathname);
    localStorage.setItem(PAGES_KEY, JSON.stringify(Array.from(seen)));
    const syncPageCount = () => setPageVisitCount(seen.size);
    syncPageCount();
  }, [pathname]);

  useEffect(() => {
    if (!installEligible) {
      installPromptTrackedRef.current = '';
      return;
    }

    const mode = deferredPrompt ? 'native_prompt' : 'ios_fallback';
    const marker = `${pathname}:${mode}`;
    if (installPromptTrackedRef.current === marker) return;

    installPromptTrackedRef.current = marker;
    posthog.capture('pwa_install_prompt_shown', {
      path: pathname,
      mode,
      sessions: sessionCount,
      pages_seen: pageVisitCount,
    });
  }, [installEligible, deferredPrompt, pathname, posthog, sessionCount, pageVisitCount]);

  const dismissInstallPrompt = () => {
    const nextDismissedUntil = getNow() + DISMISS_MS;
    localStorage.setItem(DISMISS_KEY, String(nextDismissedUntil));
    setDismissedUntil(nextDismissedUntil);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      dismissInstallPrompt();
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, '1');
      setIsStandalone(true);
      posthog.capture('pwa_install_accepted', { via: 'beforeinstallprompt', platform: choice.platform });
      return;
    }

    dismissInstallPrompt();
  };

  const handleApplyUpdate = async () => {
    posthog.capture('pwa_update_applied', { version: config?.version ?? DEFAULT_SW_VERSION });
    setUpdateReady(false);
    sessionStorage.setItem(UPDATE_PENDING_KEY, '1');
    setUpdatePending(true);

    const waitingWorker = updateRegistration?.waiting;
    if (!waitingWorker) {
      window.location.reload();
      return;
    }

    let didReload = false;
    const reload = () => {
      if (didReload) return;
      didReload = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    window.setTimeout(reload, 1500);
  };

  return (
    <>
      {SHOW_UPDATE_PROMPT && updateReady && (
        <div className="pwa-update-toast" role="status" aria-live="polite">
          <p>Update available.</p>
          <button className="btn btn-accent" type="button" onClick={handleApplyUpdate}>
            Refresh
          </button>
        </div>
      )}

      {installEligible && (
        <div className="pwa-install-card" role="dialog" aria-live="polite" aria-label="Install GolfIQ app">
          <div className="pwa-install-copy">
            <strong>Install GolfIQ</strong>
            {deferredPrompt ? (
              <span>Add GolfIQ to your home screen for faster access.</span>
            ) : (
              <span>On iPhone/iPad, tap Share, then Add to Home Screen.</span>
            )}
          </div>
          <div className="pwa-install-actions">
            {deferredPrompt ? (
              <button className="btn btn-accent" type="button" onClick={handleInstallClick}>
                Install
              </button>
            ) : null}
            <button className="btn btn-cancel" type="button" onClick={dismissInstallPrompt}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}
