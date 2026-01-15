# Google AdSense Setup Guide

## Overview
GolfIQ uses Google AdSense to monetize free-tier users while providing an ad-free experience for premium subscribers.

---

## Ad Placement Strategy

### Free Users See Ads:
- ✅ Dashboard (1 banner after stats)
- ✅ Rounds Page (inline every 5 rounds)
- ✅ Courses Page (inline every 10 courses)
- ✅ Leaderboard (bottom banner)

### Premium Users See:
- ✅ **No ads** (completely ad-free experience)

---

## Setup Steps

### 1. Apply for Google AdSense ✅

1. Go to [Google AdSense](https://www.google.com/adsense)
2. Sign in with Google account
3. Apply for AdSense account
4. Provide website URL: `https://yourdomain.com`
5. Wait for approval (can take 1-2 weeks)

### 2. Get Your Publisher ID ✅

Once approved:
1. Log into AdSense dashboard
2. Go to **Account** → **Account Information**
3. Copy your **Publisher ID** (format: `ca-pub-XXXXXXXXXXXXXXXX`)

**Your Publisher ID:** `ca-pub-6375440969561474`

### 3. Add Publisher ID to Environment ✅

Added to `.env` file:
```bash
NEXT_PUBLIC_ADSENSE_PUBLISHER_ID="ca-pub-6375440969561474"
```

**Important:** This must be `NEXT_PUBLIC_` prefixed to work in client components.

### 4. Add ads.txt File ✅

Created `public/ads.txt` with:
```
google.com, pub-6375440969561474, DIRECT, f08c47fec0942fa0
```

This file will be accessible at: `https://yourdomain.com/ads.txt`

### 5. Add Verification Meta Tag ✅

Added to `app/layout.tsx`:
```html
<meta name="google-adsense-account" content="ca-pub-6375440969561474" />
```

### 6. Create Ad Units

**⚠️ POST-LAUNCH ONLY:** This step requires your site to be live with a public domain. AdSense needs to verify and crawl your site before allowing ad unit creation.

**After launching your site**, in AdSense dashboard, create 4 ad units:

#### Dashboard Banner Ad
- **Name:** GolfIQ Dashboard Banner
- **Type:** Display ad
- **Size:** Responsive
- **Copy Ad Slot ID:** e.g., `1234567890`

#### Rounds Inline Ad
- **Name:** GolfIQ Rounds Inline
- **Type:** In-article ad
- **Size:** Responsive
- **Copy Ad Slot ID**

#### Courses Inline Ad
- **Name:** GolfIQ Courses Inline
- **Type:** In-feed ad
- **Size:** Responsive
- **Copy Ad Slot ID**

#### Leaderboard Bottom Banner
- **Name:** GolfIQ Leaderboard Banner
- **Type:** Display ad
- **Size:** Responsive (horizontal)
- **Copy Ad Slot ID**

### 7. Update Component Ad Slots

**⚠️ POST-LAUNCH ONLY:** After creating ad units (step 6), replace placeholder IDs in components:

**Dashboard:**
```tsx
<InlineAdBanner adSlot="YOUR_DASHBOARD_SLOT_ID" />
```

**Rounds:**
```tsx
<InlineAdBanner adSlot="YOUR_ROUNDS_SLOT_ID" />
```

**Courses:**
```tsx
<InlineAdBanner adSlot="YOUR_COURSES_SLOT_ID" />
```

**Leaderboard:**
```tsx
<InlineAdBanner adSlot="YOUR_LEADERBOARD_SLOT_ID" />
```

---

## Testing

### Development (No Ads)
Without `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` set, you'll see placeholders:
```
📢 Ad Placeholder
AdSense Publisher ID not configured
```

### Staging/Production
Once Publisher ID is added, ads will load for free users only.

**Important:** Don't click your own ads during testing! This can get your AdSense account banned.

---

## Ad Performance Optimization

### Best Practices

1. **Ad Placement:**
   - Place ads where users naturally pause (after content sections)
   - Don't place too many ads (reduces user experience)
   - Use responsive ad units (work on all screen sizes)

2. **Ad Types:**
   - **Display ads:** General banner ads
   - **In-article ads:** Blend with content
   - **In-feed ads:** Match your list items

3. **User Experience:**
   - Never show ads during critical flows (adding rounds, checkout)
   - Ads should be clearly separated from content
   - No pop-ups or interstitials

### Revenue Estimates

**Assumptions:**
- 1000 free users
- 10 page views per user per week
- $2 RPM (revenue per 1000 impressions)

**Monthly Revenue:**
```
1000 users × 10 views/week × 4 weeks × $2 RPM / 1000 = $80/month
```

With 5,000 free users: ~$400/month

---

## Troubleshooting

### Ads Not Showing

**Check:**
1. ✅ Publisher ID is correct in `.env`
2. ✅ Ad slot IDs are correct in components
3. ✅ AdSense script loads in browser Network tab
4. ✅ User is on free tier (premium users don't see ads)
5. ✅ AdSense account is approved and active

### Blank Ad Spaces

**Possible Causes:**
- New ad units take 24-48 hours to start serving
- Low fill rate (no ads available for your audience)
- Ad blockers (some users will block ads)

### Policy Violations

**Avoid:**
- ❌ Clicking your own ads
- ❌ Asking users to click ads
- ❌ Placing ads on pages with prohibited content
- ❌ Too many ads (cluttered experience)

---

## Ad Components Reference

### `<AdSense />`
Base AdSense component.

```tsx
<AdSense
  adSlot="1234567890"
  adFormat="auto"
  fullWidthResponsive={true}
/>
```

### `<InlineAdBanner />`
Wrapper that hides ads for premium users.

```tsx
<InlineAdBanner adSlot="1234567890" className="my-6" />
```

---

## Implementation Checklist

- [x] Apply for Google AdSense
- [x] Get approved
- [x] Add Publisher ID to `.env`
- [x] Add ads.txt file to public folder
- [x] Add verification meta tag to layout
- [x] AdSense script integrated in root layout
- [x] Ad components created (AdSense, InlineAdBanner)
- [x] Ads placed on dashboard, rounds, courses, leaderboard

**POST-LAUNCH CHECKLIST:**
- [ ] Deploy to production with public domain
- [ ] Wait for AdSense to verify site (can take 24-48 hours)
- [ ] Create 4 ad units in AdSense dashboard
- [ ] Update ad slot IDs in components (replace DASHBOARD_SLOT_ID, etc.)
- [ ] Redeploy with real ad slot IDs
- [ ] Test on production (verify ads show for free users)
- [ ] Test premium user (verify NO ads show)
- [ ] Monitor AdSense dashboard for revenue

---

## Revenue Tracking

### AdSense Dashboard Metrics

Monitor:
- **Page RPM:** Revenue per 1000 page views
- **Impressions:** Number of times ads were shown
- **Clicks:** Number of ad clicks
- **CTR:** Click-through rate (clicks/impressions)
- **Estimated Earnings:** Daily/monthly revenue

### Optimization Tips

If RPM is low:
1. Try different ad formats
2. Adjust ad placement
3. Enable Auto ads (let Google optimize)
4. Increase traffic to high-value pages

---

## Next Steps After Setup

1. **Monitor performance** for first 30 days
2. **A/B test** ad placements
3. **Analyze** which pages generate most revenue
4. **Optimize** based on data
5. **Consider** adding more ad units if RPM is high

---

## Support

- **AdSense Help:** https://support.google.com/adsense
- **Policy Center:** https://support.google.com/adsense/answer/48182
- **Community Forum:** https://support.google.com/adsense/community

---

## Change Log

### 2026-01-07
- Created AdSense setup infrastructure
- Added `<AdSense />` and `<InlineAdBanner />` components
- Integrated with root layout
- Ad placement strategy defined
