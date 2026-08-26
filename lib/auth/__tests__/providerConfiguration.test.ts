import {
  getAuthProviderConfiguration,
  getPublicAuthProviderAvailability,
} from '@/lib/auth/providerConfiguration';

describe('authentication provider configuration', () => {
  it('enables providers only when the credentials required by that platform are complete', () => {
    const configuration = getAuthProviderConfiguration({
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      APPLE_CLIENT_ID: 'ca.golfiq.web',
      APPLE_CLIENT_SECRET: 'apple-web-secret',
      APPLE_IOS_CLIENT_ID: 'ca.golfiq.app',
      APPLE_IOS_CLIENT_SECRET: 'apple-native-secret',
    });

    expect(getPublicAuthProviderAvailability(configuration)).toEqual({
      web: { google: true, apple: true },
      native: { google: true, apple: true },
    });
    expect(configuration.issues).toEqual([]);
  });

  it('reports public flags and partial credentials that would otherwise expose broken buttons', () => {
    const configuration = getAuthProviderConfiguration({
      GOOGLE_CLIENT_ID: 'google-client-id',
      NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: '1',
      NEXT_PUBLIC_AUTH_APPLE_ENABLED: '1',
      APPLE_CLIENT_ID: 'ca.golfiq.web',
      APPLE_IOS_CLIENT_ID: 'ca.golfiq.app',
    });

    expect(getPublicAuthProviderAvailability(configuration)).toEqual({
      web: { google: false, apple: false },
      native: { google: true, apple: false },
    });
    expect(configuration.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('GOOGLE_CLIENT_SECRET'),
      expect.stringContaining('Google web sign-in was publicly enabled'),
      expect.stringContaining('Apple web sign-in was publicly enabled'),
      expect.stringContaining('Apple web sign-in has a client ID'),
      expect.stringContaining('Apple native sign-in is configured incompletely'),
    ]));
  });

  it('does not let legacy public flags enable a provider by themselves', () => {
    const configuration = getAuthProviderConfiguration({
      NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: '1',
      NEXT_PUBLIC_AUTH_APPLE_ENABLED: '1',
    });

    expect(getPublicAuthProviderAvailability(configuration)).toEqual({
      web: { google: false, apple: false },
      native: { google: false, apple: false },
    });
  });
});
