import {
  getSubscriptionProvider,
  hasPremiumEntitlement,
  isPremium,
  isPremiumUser,
  isLifetime,
  isFree,
  canAccessAICoach,
  canAccessFullLeaderboard,
  hasUnlimitedAnalytics,
  getAnalyticsHistoryLimit,
  getLeaderboardLimit,
  isSubscriptionActive,
  isSubscriptionCancelled,
  isSubscriptionPastDue,
  isSubscriptionExpired,
  getDaysUntilExpiry,
  getTierDisplayName,
  getStatusDisplayName,
  getTierBadgeColor,
  getStatusBadgeColor,
  isActivePremiumStatus,
} from "../../subscription";

describe("subscription utils", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-02-04T10:15:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("determines premium access", () => {
    expect(isPremium("premium", "active")).toBe(true);
    expect(isPremium("premium", "trialing")).toBe(true);
    expect(isPremium("lifetime", "active")).toBe(true);
    expect(isPremium("premium", "cancelled")).toBe(false);
    expect(isPremium("free", "active")).toBe(false);
  });

  it("handles premium user objects", () => {
    expect(isPremiumUser({ subscriptionTier: "premium" })).toBe(true);
    expect(isPremiumUser({ subscriptionTier: "free", subscriptionStatus: "active" })).toBe(false);
  });

  it("checks tier helpers", () => {
    expect(isLifetime("lifetime")).toBe(true);
    expect(isFree("free")).toBe(true);
  });

  it("feature access mirrors premium check", () => {
    expect(canAccessAICoach("premium", "active")).toBe(true);
    expect(canAccessFullLeaderboard("free", "active")).toBe(false);
    expect(hasUnlimitedAnalytics("free", "active")).toBe(false);
  });

  it("returns correct limits", () => {
    expect(getAnalyticsHistoryLimit("free", "active")).toBe(90);
    expect(getAnalyticsHistoryLimit("premium", "active")).toBeNull();
    expect(getLeaderboardLimit("free", "active")).toBe(10);
    expect(getLeaderboardLimit("premium", "active")).toBeNull();
  });

  it("checks subscription statuses", () => {
    expect(isSubscriptionActive("active")).toBe(true);
    expect(isSubscriptionCancelled("cancelled")).toBe(true);
    expect(isSubscriptionPastDue("past_due")).toBe(true);
    expect(isActivePremiumStatus("trialing")).toBe(true);
    expect(isActivePremiumStatus("expired")).toBe(false);
  });

  it("evaluates provider-neutral entitlement state", () => {
    expect(
      hasPremiumEntitlement({
        subscriptionTier: "premium",
        subscriptionStatus: "active",
        subscriptionProvider: "stripe",
      })
    ).toBe(true);

    expect(
      hasPremiumEntitlement({
        subscriptionTier: "premium",
        subscriptionStatus: "cancelled",
        subscriptionProvider: "apple",
      })
    ).toBe(false);

    expect(
      hasPremiumEntitlement({
        subscriptionTier: "lifetime",
        subscriptionStatus: "cancelled",
        subscriptionProvider: "manual",
      })
    ).toBe(true);
  });

  it("derives a provider when explicit provider is missing", () => {
    expect(
      getSubscriptionProvider({
        subscriptionTier: "premium",
        subscriptionProvider: "revenuecat_web",
      })
    ).toBe("revenuecat_web");

    expect(
      getSubscriptionProvider({
        subscriptionTier: "premium",
        stripeCustomerId: "cus_123",
      })
    ).toBe("stripe");

    expect(
      getSubscriptionProvider({
        subscriptionTier: "premium",
        appleOriginalTransactionId: "orig_123",
      })
    ).toBe("apple");

    expect(
      getSubscriptionProvider({
        subscriptionTier: "lifetime",
      })
    ).toBe("manual");
  });

  it("checks expiration", () => {
    expect(isSubscriptionExpired(null, "premium")).toBe(false);
    expect(isSubscriptionExpired(new Date("2026-02-03T10:15:00.000Z"), "premium")).toBe(true);
    expect(isSubscriptionExpired(new Date("2026-02-05T10:15:00.000Z"), "premium")).toBe(false);
    expect(isSubscriptionExpired(new Date("2026-02-05T10:15:00.000Z"), "free")).toBe(false);
    expect(isSubscriptionExpired(new Date("2026-02-05T10:15:00.000Z"), "lifetime")).toBe(false);
  });

  it("computes days until expiry", () => {
    expect(getDaysUntilExpiry(null, "premium")).toBeNull();
    expect(getDaysUntilExpiry(new Date("2026-02-05T10:15:00.000Z"), "free")).toBeNull();
    expect(getDaysUntilExpiry(new Date("2026-02-06T10:15:00.000Z"), "premium")).toBe(2);
  });

  it("returns display names", () => {
    expect(getTierDisplayName("free")).toBe("Free");
    expect(getStatusDisplayName("past_due")).toBe("Past Due");
  });

  it("returns badge colors", () => {
    expect(getTierBadgeColor("premium")).toBe("#2D6CFF");
    expect(getStatusBadgeColor("active")).toBe("#2ecc71");
  });
});
