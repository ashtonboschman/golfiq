/** @jest-environment jsdom */

import { loadGoogleMaps } from '@/lib/gps/googleMapsLoader';

const SCRIPT_ID = 'golfiq-google-maps-js';

function currentScript() {
  return document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
}

function installLoadedGoogleMaps() {
  Object.defineProperty(window, 'google', {
    configurable: true,
    writable: true,
    value: {
      maps: {
        Map: class MockGoogleMap {},
      },
    },
  });
}

function completeCurrentAttempt() {
  installLoadedGoogleMaps();
  window.__golfiqGoogleMapsLoaded?.();
}

describe('loadGoogleMaps', () => {
  beforeEach(() => {
    currentScript()?.remove();
    Reflect.deleteProperty(window, 'google');
    delete window.__golfiqGoogleMapsPromise;
    delete window.__golfiqGoogleMapsLoaded;
  });

  afterEach(() => {
    currentScript()?.remove();
    Reflect.deleteProperty(window, 'google');
    delete window.__golfiqGoogleMapsPromise;
    delete window.__golfiqGoogleMapsLoaded;
  });

  it('shares one promise and one script across concurrent calls', async () => {
    const firstAttempt = loadGoogleMaps('test-key');
    const concurrentAttempt = loadGoogleMaps('test-key');

    expect(concurrentAttempt).toBe(firstAttempt);
    expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1);

    completeCurrentAttempt();
    await expect(Promise.all([firstAttempt, concurrentAttempt])).resolves.toEqual([undefined, undefined]);
  });

  it('caches a successful load without injecting another script', async () => {
    const firstAttempt = loadGoogleMaps('test-key');
    const script = currentScript();
    completeCurrentAttempt();
    await firstAttempt;

    await expect(loadGoogleMaps('test-key')).resolves.toBeUndefined();
    expect(currentScript()).toBe(script);
    expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1);
  });

  it('rejects concurrent callers and clears the failed attempt state', async () => {
    const firstAttempt = loadGoogleMaps('test-key');
    const concurrentAttempt = loadGoogleMaps('test-key');
    const firstRejection = expect(firstAttempt).rejects.toThrow('Google Maps failed to load.');
    const concurrentRejection = expect(concurrentAttempt).rejects.toThrow('Google Maps failed to load.');

    currentScript()?.dispatchEvent(new Event('error'));

    await firstRejection;
    await concurrentRejection;
    expect(window.__golfiqGoogleMapsPromise).toBeUndefined();
    expect(window.__golfiqGoogleMapsLoaded).toBeUndefined();
    expect(currentScript()).toBeNull();
  });

  it('injects and successfully loads a fresh script after failure', async () => {
    const failedAttempt = loadGoogleMaps('test-key');
    const failedScript = currentScript();
    const rejection = expect(failedAttempt).rejects.toThrow('Google Maps failed to load.');
    failedScript?.dispatchEvent(new Event('error'));
    await rejection;

    const retryAttempt = loadGoogleMaps('test-key');
    const retryScript = currentScript();
    expect(retryScript).not.toBe(failedScript);
    expect(retryScript).not.toBeNull();
    expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1);

    completeCurrentAttempt();
    await expect(retryAttempt).resolves.toBeUndefined();
  });

  it('returns loaded state without injecting a script', async () => {
    installLoadedGoogleMaps();

    await expect(loadGoogleMaps('test-key')).resolves.toBeUndefined();
    expect(currentScript()).toBeNull();
  });

  it('requests only the base Maps JavaScript API with existing loader parameters', () => {
    const attempt = loadGoogleMaps('test key');
    const script = currentScript();
    const scriptUrl = new URL(script?.src ?? '');

    expect(scriptUrl.origin).toBe('https://maps.googleapis.com');
    expect(scriptUrl.pathname).toBe('/maps/api/js');
    expect(scriptUrl.searchParams.get('key')).toBe('test key');
    expect(scriptUrl.searchParams.get('v')).toBe('weekly');
    expect(scriptUrl.searchParams.get('loading')).toBe('async');
    expect(scriptUrl.searchParams.get('callback')).toBe('__golfiqGoogleMapsLoaded');
    expect(scriptUrl.searchParams.has('libraries')).toBe(false);

    const rejection = expect(attempt).rejects.toThrow('Google Maps failed to load.');
    script?.dispatchEvent(new Event('error'));
    return rejection;
  });
});
