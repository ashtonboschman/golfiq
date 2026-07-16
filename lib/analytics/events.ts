export const ANALYTICS_EVENTS = {
  onboardingStarted: 'onboarding_started',
  onboardingStepViewed: 'onboarding_step_viewed',
  onboardingStepCompleted: 'onboarding_step_completed',
  onboardingGoalSelected: 'onboarding_goal_selected',
  onboardingCompleted: 'onboarding_completed',
  onboardingSignupStarted: 'onboarding_signup_started',
  onboardingLoginStarted: 'onboarding_login_started',
  onboardingSkipped: 'onboarding_skipped',
  postSignupTransitionViewed: 'post_signup_transition_viewed',
  postSignupLogRoundClicked: 'post_signup_log_round_clicked',
  postSignupDashboardClicked: 'post_signup_dashboard_clicked',
  addRoundCtaClicked: 'add_round_cta_clicked',
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
  secondRoundCompleted: 'second_round_completed',
  thirdRoundCompleted: 'third_round_completed',
  insightsViewed: 'insights_viewed',
  roundInsightsViewed: 'round_insights_viewed',
  roundIdentityShown: 'round_identity_shown',
  firstRoundPayoffShown: 'first_round_payoff_shown',
  roundIdentityCtaClicked: 'round_identity_cta_clicked',
  roundIdentityModifierShown: 'round_identity_modifier_shown',
  insightModeChanged: 'insight_mode_changed',
  dashboardFocusViewed: 'dashboard_focus_viewed',
  dashboardFocusCtaClicked: 'dashboard_focus_cta_clicked',
  dashboardFocusModeChanged: 'dashboard_focus_mode_changed',
  insightsTabClicked: 'insights_tab_clicked',
  overallCardViewed: 'overall_card_viewed',
  gameTrendConclusionViewed: 'game_trend_conclusion_viewed',
  paywallViewed: 'paywall_viewed',
  pricingPageViewed: 'pricing_page_viewed',
  upgradeCtaClicked: 'upgrade_cta_clicked',
  checkoutStarted: 'checkout_started',
  checkoutCompleted: 'checkout_completed',
  checkoutFailed: 'checkout_failed',
  friendRequestSent: 'friend_request_sent',
  friendRequestAccepted: 'friend_request_accepted',
  friendRemoved: 'friend_removed',
  feedbackSubmitted: 'feedback_submitted',
  feedbackSubmitFailed: 'feedback_submit_failed',
  leaderboardViewed: 'leaderboard_viewed',
  apiRequestFailed: 'api_request_failed',
  appErrorShown: 'app_error_shown',
  pwaUpdateToastShown: 'pwa_update_toast_shown',
  pwaInstallPromptShown: 'pwa_install_prompt_shown',
  pwaInstallAccepted: 'pwa_install_accepted',
  pwaUpdateApplied: 'pwa_update_applied',
  gpsAvailable: 'gps_available',
  gpsToggleViewed: 'gps_toggle_viewed',
  gpsEnabledForRound: 'gps_enabled_for_round',
  gpsLocationAllowed: 'gps_location_allowed',
  gpsLocationDenied: 'gps_location_denied',
  gpsMapLoaded: 'gps_map_loaded',
  gpsMapFailed: 'gps_map_failed',
  gpsHoleViewed: 'gps_hole_viewed',
  gpsLogScoreTapped: 'gps_log_score_tapped',
  gpsMappingRequested: 'gps_mapping_requested',
  gpsRoundCompleted: 'gps_round_completed',
  gpsSecondRoundCompleted: 'gps_second_round_completed',
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
  user_id?: string;
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  subscription_status?: string;
  subscription_provider?: string;
  user_city?: string;
  user_timezone?: string;
  plan_tier: PlanTier;
  auth_provider: AuthProvider;
  is_logged_in: boolean;
  app_surface: AppSurface;
  billing_platform?: string;
  is_native_app?: boolean;
  is_native_ios?: boolean;
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
