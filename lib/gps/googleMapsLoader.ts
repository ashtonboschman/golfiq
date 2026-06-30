'use client';

declare global {
  interface Window {
    __golfiqGoogleMapsPromise?: Promise<void>;
    __golfiqGoogleMapsLoaded?: () => void;
  }
}

const GOOGLE_MAPS_SCRIPT_ID = 'golfiq-google-maps-js';

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve();
  }

  if (window.__golfiqGoogleMapsPromise) {
    return window.__golfiqGoogleMapsPromise;
  }

  let resolveAttempt!: () => void;
  let rejectAttempt!: (reason: Error) => void;
  const attempt = new Promise<void>((resolve, reject) => {
    resolveAttempt = resolve;
    rejectAttempt = reject;
  });
  window.__golfiqGoogleMapsPromise = attempt;

  const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
  const script = existingScript ?? document.createElement('script');

  const handleLoaded = () => {
    script.removeEventListener('error', handleError);
    if (window.__golfiqGoogleMapsLoaded === handleLoaded) {
      delete window.__golfiqGoogleMapsLoaded;
    }
    resolveAttempt();
  };

  const handleError = () => {
    script.removeEventListener('error', handleError);
    script.remove();
    if (window.__golfiqGoogleMapsPromise === attempt) {
      delete window.__golfiqGoogleMapsPromise;
    }
    if (window.__golfiqGoogleMapsLoaded === handleLoaded) {
      delete window.__golfiqGoogleMapsLoaded;
    }
    rejectAttempt(new Error('Google Maps failed to load.'));
  };

  window.__golfiqGoogleMapsLoaded = handleLoaded;
  script.addEventListener('error', handleError);

  if (!existingScript) {
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      '&v=weekly&loading=async&callback=__golfiqGoogleMapsLoaded';
    document.head.appendChild(script);
  }

  return attempt;
}
