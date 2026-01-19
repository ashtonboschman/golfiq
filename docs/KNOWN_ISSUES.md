# GolfIQ Known Issues & Bug Tracker

**Last Updated:** 2026-01-07

---

## 🐛 Active Bugs
- flashing edit screen when navigating to the stats page (we can look at this later)
- Upgrade modal did not popup after 3 rounds. Not popping up at all
- have profile info editable by default (remove edit profile button) and when user changes a stat, render the cancel/save buttons. If user tries to navigate away from page warn them that changes are not saved.
- sometimes have to press logout button or settings button twice.
- need to add timezone to user (can get from location) so date on add round is correct
- Make sure if location is enabled we reload the page on courses. Or we wait for their input before proceeding.
- upgrade modal flashes when logging out


## 📋 Planned Features (Not Yet Implemented)

### Phase 2: Achievement System (Next Up!)
- [ ] 17 achievements with 5-tier progression
- [ ] Toast notifications on unlock
- [ ] Achievements page
- [ ] Profile badge display

### Phase 3: AI Coach MVP
- [ ] Post-round AI recap
- [ ] Dashboard AI insights widget
- [ ] Chat interface with rate limiting

### Phase 4: PWA & Polish
- [ ] Progressive Web App setup
- ✅ Email verification on registration
- ✅ Forgot password functionality
- ✅ Settings page completion

---

## ✅ Recently Completed

### Bug Fixes & Features (2026-01-13)
- ✅ 14-Day Free Trial System
  - Added trialEndDate field to User model
  - Updated isPremium() function to check trial status
  - Stripe checkout automatically includes 7-day trial for new subscribers
  - Webhook handlers set trial_end_date from Stripe subscription
  - useSubscription hook includes trial information
  - Pricing page shows "7-day free trial included!" on monthly plan
  - Trial users get full premium access during trial period
- ✅ Premium theme system (11 themes: 2 free, 9 premium)
  - Database schema updated with theme field in user_profiles table
  - ThemeContext loads user theme from database on login
  - Theme selector in settings page with premium gate
  - All themes apply dark theme for unauthenticated users
  - Fixed BigInt serialization issue in profile API
  - Removed localStorage conflicts for multi-user scenarios
- ✅ Unified dropdown system with react-select
  - Created shared selectStyles.ts for consistent theming
  - Converted all native select elements to react-select
  - Updated pages: settings, profile, dashboard, rounds, courses
  - Theme-specific chevron colors for all 11 themes
  - Fixed disabled form element opacity consistency
- ✅ Premium users blocked from pricing page
  - Added subscription check to pricing page
  - Automatic redirect to settings for premium users
  - Prevents accidental subscription attempts from premium users

### Bug Fixes (2026-01-11)
- ✅ Dashboard trend graphs interactivity improvements
  - Added visible dots to all data points on both Score Trend and FIR/GIR charts
  - Increased dot size (r: 4) and active dot size (r: 6) for better visibility
  - Added strokeWidth (2px) for clearer lines and dots
  - Added activeDot prop for better hover/click interaction
  - Added cursor visual feedback to tooltips
  - Fixed data point mapping by pre-formatting dates with unique keys (datetime + index)
  - X-axis shows all dates with 45-degree angle rotation to prevent overlap
  - All data points (1-20) are now clickable and show correct score/percentage values
  - Charts cleanly display all 20 rounds for premium users and 5 for free users
  - Rounds now use datetime instead of date, ensuring unique timestamps going forward
- ✅ Location-based sorting for courses page
  - Database-level distance calculation using Haversine formula
  - Courses sorted by proximity to user's current location
  - Secondary alphabetical sort for courses at same distance
  - Distance displayed on course cards (e.g., "4.1 km away")
  - Graceful fallback to alphabetical sorting if geolocation unavailable
- ✅ Leaderboard Global/Friends toggle buttons styling
  - Added .stats-tabs and .stats-tab CSS classes
  - Inactive buttons: white background with dark text
  - Active button: blue background (#3498db) matching btn-toggle class
  - Hover states for both active and inactive tabs
- ✅ Rounds page pagination with infinite scroll
  - Added pagination support to rounds API (limit and page parameters)
  - Implemented infinite scroll using IntersectionObserver
  - Loads 20 rounds at a time for better performance
  - Debounced search functionality with server-side filtering
  - Prevents performance issues as users accumulate more rounds
- ✅ Leaderboard pagination with infinite scroll
  - Added pagination support to leaderboard API (50 users per page)
  - Implemented infinite scroll using IntersectionObserver
  - Maintains free user limits (top 100 + user context) with pagination
  - Premium users and friends scope get full pagination support
  - Improved performance for large leaderboards

### Phase 1: Subscription Gates & Premium CTAs (2026-01-07)
- ✅ Global leaderboard limited to top 100 + user ±5 for free users
- ✅ Dashboard analytics limited to last 20 rounds for free users
- ✅ Google AdSense integration (dashboard, rounds, courses, leaderboard)
- ✅ Premium conversion CTAs:
  - ✅ Upgrade modal at rounds 3, 8, 13, 18, 23+ with dynamic messaging
  - ✅ Export limit reached CTA in Settings
  - ✅ AI Coach page premium gate
- ✅ Data export system (1 CSV/month free, unlimited for premium)
- ✅ UX bug fixes:
  - ✅ Date picker timezone bug (off-by-one error)
  - ✅ Par auto-loading when tee is selected

### Subscription System (2026-01-06)
- ✅ Database schema (SubscriptionTier, SubscriptionStatus, SubscriptionEvent, LifetimeGrant)
- ✅ Stripe integration (checkout, portal, webhooks)
- ✅ Pricing page with 3 tiers (Free, Premium $5.99/mo or $49.99/yr, Lifetime)
- ✅ PremiumGate component for feature gating
- ✅ useSubscription hook
- ✅ SubscriptionBadge component
- ✅ Admin scripts for lifetime grants
- ✅ Complete documentation

---

## 🔧 Technical Debt

### Code Quality
- [ ] Add TypeScript strict mode checks
- [ ] Implement error boundaries for React components
- [ ] Add loading states for all async operations
- [ ] Standardize API error responses

### Testing
- [ ] Unit tests for handicap calculation
- [ ] Integration tests for API routes
- [ ] E2E tests for critical user flows
- [ ] Stripe webhook testing

### Performance
- [ ] Implement Redis caching for hot data
- [ ] Optimize dashboard stats queries
- [ ] Add database query logging
- [ ] Profile and optimize slow API routes

### Security
- [ ] Add rate limiting to API routes
- [ ] Implement CSRF protection
- [ ] Add input sanitization for user-generated content
- [ ] Security audit before launch

---

## 📝 Notes

### Bug Reporting Template
```markdown
## Bug Title

**Priority:** High/Medium/Low
**Status:** 🔴 Not Started / 🟡 In Progress / 🟢 Fixed
**Reported:** YYYY-MM-DD
**Assigned:** Name

### Description
Clear description of the bug

### Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

### Expected Behavior
What should happen

### Actual Behavior
What actually happens

### Screenshots/Logs
If applicable

### Proposed Solution
How to fix it
```

---

## 🎯 Next Sprint Priorities

1. **Phase 2: Achievement System** (engagement critical)
   - Create achievement database schema
   - Build achievement calculator engine
   - Implement achievement UI components
2. **Phase 3: AI Coach MVP** (conversion driver)
   - Set up OpenAI integration
   - Build post-round recap feature
   - Create dashboard AI widget

---

## Change Log

### 2026-01-07
- Created KNOWN_ISSUES.md to replace Current errors.txt
- Migrated existing issues and recent completions
- Added bug reporting template
- Organized by priority and phase
