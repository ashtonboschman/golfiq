export const ANALYTICS_EVENTS = {
  signupCompleted: 'signup_completed',
  loginCompleted: 'login_completed',
  loginFailed: 'login_failed',
  passwordResetRequested: 'password_reset_requested',
  passwordResetCompleted: 'password_reset_completed',
  emailVerificationCompleted: 'email_verification_completed',
  roundAddStarted: 'round_add_started',
  roundLoggingModeSelected: 'round_logging_mode_selected',
  roundAddCompleted: 'round_add_completed',
  roundAddAbandoned: 'round_add_abandoned',
  roundEditCompleted: 'round_edit_completed',
  roundDeleteCompleted: 'round_delete_completed',
  roundStatsViewed: 'round_stats_viewed',
  firstRoundCompleted: 'first_round_completed',
  thirdRoundCompleted: 'third_round_completed',
  insightsViewed: 'insights_viewed',
  insightModeChanged: 'insight_mode_changed',
  insightRegenerated: 'insight_regenerated',
  dashboardFocusViewed: 'dashboard_focus_viewed',
  dashboardFocusCtaClicked: 'dashboard_focus_cta_clicked',
  dashboardFocusModeChanged: 'dashboard_focus_mode_changed',
  paywallViewed: 'paywall_viewed',
  pricingPageViewed: 'pricing_page_viewed',
  upgradeCtaClicked: 'upgrade_cta_clicked',
  checkoutStarted: 'checkout_started',
  checkoutCompleted: 'checkout_completed',
  checkoutFailed: 'checkout_failed',
  friendRequestSent: 'friend_request_sent',
  friendRequestAccepted: 'friend_request_accepted',
  friendRemoved: 'friend_removed',
  leaderboardViewed: 'leaderboard_viewed',
  apiRequestFailed: 'api_request_failed',
  appErrorShown: 'app_error_shown',
  pwaUpdateToastShown: 'pwa_update_toast_shown',
  pwaInstallPromptShown: 'pwa_install_prompt_shown',
  pwaInstallAccepted: 'pwa_install_accepted',
  pwaUpdateApplied: 'pwa_update_applied',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type PlanTier = 'free' | 'premium' | 'lifetime' | 'unknown';
export type AuthProvider = 'password' | 'google' | 'apple' | 'unknown';
export type AppSurface = 'web' | 'pwa';
export type AnalyticsEnvironment =
  | 'development'
  | 'test'
  | 'staging'
  | 'production';

export type CommonAnalyticsProps = {
  source_page: string;
  plan_tier: PlanTier;
  auth_provider: AuthProvider;
  is_logged_in: boolean;
  app_surface: AppSurface;
  environment: AnalyticsEnvironment;
  app_version: string;
};

export function normalizePlanTier(raw: string | null | undefined): PlanTier {
  if (raw === 'free' || raw === 'premium' || raw === 'lifetime') return raw;
  return 'unknown';
}

export function normalizeAuthProvider(
  raw: string | null | undefined,
): AuthProvider {
  if (raw === 'google' || raw === 'apple' || raw === 'password') return raw;
  if (raw === 'credentials') return 'password';
  return 'unknown';
}

export function getAnalyticsEnvironment(): AnalyticsEnvironment {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'test') return 'test';
  if (nodeEnv === 'development') return 'development';

  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'preview') return 'staging';
  if (vercelEnv === 'production') return 'production';

  return nodeEnv === 'production' ? 'production' : 'development';
}

export function getAnalyticsAppVersion(): string {
  return (
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    'dev'
  );
}
