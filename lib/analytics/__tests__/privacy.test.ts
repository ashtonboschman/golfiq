jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    capture: jest.fn(),
    identify: jest.fn(),
    register: jest.fn(),
  },
}));

jest.mock('@/lib/platform', () => ({
  getBillingPlatform: () => 'web_stripe',
  isNativeApp: () => false,
  isNativeIOS: () => false,
}));

import {
  buildAnalyticsPersonProperties,
  buildClientAnalyticsCommonProps,
} from '@/lib/analytics/client';
import { POSTHOG_PRIVACY_CONFIG } from '@/lib/analytics/privacy';

describe('PostHog privacy defaults', () => {
  it('disables automatic interaction, page, and session recording', () => {
    expect(POSTHOG_PRIVACY_CONFIG).toEqual({
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
    });
  });

  it('keeps person properties pseudonymous and subscription-focused', () => {
    const properties = buildAnalyticsPersonProperties({
      id: '42',
      subscription_tier: 'premium',
      subscription_status: 'active',
      subscription_provider: 'apple',
      auth_provider: 'google',
      email: 'golfer@example.com',
      first_name: 'Test',
      last_name: 'Golfer',
      city: 'Winnipeg',
      timezone: 'America/Winnipeg',
    } as never);

    expect(properties).toEqual({
      plan_tier: 'premium',
      subscription_status: 'active',
      subscription_provider: 'apple',
      auth_provider: 'google',
    });
    expect(properties).not.toHaveProperty('email');
    expect(properties).not.toHaveProperty('first_name');
    expect(properties).not.toHaveProperty('last_name');
    expect(properties).not.toHaveProperty('city');
    expect(properties).not.toHaveProperty('timezone');
  });

  it('does not duplicate direct identity or location fields on events', () => {
    const properties = buildClientAnalyticsCommonProps({
      pathname: '/dashboard',
      user: {
        id: '42',
        subscription_tier: 'free',
        auth_provider: 'password',
        email: 'golfer@example.com',
        first_name: 'Test',
        last_name: 'Golfer',
        city: 'Winnipeg',
        timezone: 'America/Winnipeg',
      },
      isLoggedIn: true,
    } as never);

    expect(properties).not.toHaveProperty('user_id');
    expect(properties).not.toHaveProperty('email');
    expect(properties).not.toHaveProperty('first_name');
    expect(properties).not.toHaveProperty('last_name');
    expect(properties).not.toHaveProperty('city');
    expect(properties).not.toHaveProperty('user_timezone');
  });
});

