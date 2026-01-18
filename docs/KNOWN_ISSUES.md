# GolfIQ Known Issues & Bug Tracker

**Last Updated:** 2026-01-07

---

## 🐛 Active Bugs
- go through all of backend api and make sure implicit type any is not used. Vercel deployment is giving errors. (I went through and added 'any' to A LOT of variables to get it working. We can refactor this to actual types later)
- flashing edit screen when navigating to the stats page (we can look at this later)
- Success message way too quick on courses/search page after adding a course (might need to add delay again for page switch or something idk)
- Subscription confirmation page needs work. 
- Subscription doesn’t auto apply anymore after the free trial update.
- Info tool tip popup is behind the filter button. I want the popup above the dropdown if dropdown is closed, but dropdown to be above eveything if that is open.
- Upgrade modal did not popup after 3 rounds
- Limit max input value fir (0 - # of non-par3 holes) and gir (0 - # of holes) on quick mode advanced stats (should we add a new column to tees table to auto calculate #ofnonpar3 holes upon course insert? Could be useful to speed up queries)
- Add/edit rounds page should show both Quick and HBH buttons side by side like leaderboard (with same active highlighting) so users can see both options to have a better idea that there are options.
- User_leaderboard_stats toPar stats need to be updated on round insert/update/delete like the totalScore columns do (best_score, average_score)
- Stats don’t show on friend card when accepting request until after refresh. Also make sure if user hcp is null we display '-' and not 0. That could be misleading.
- Forgot password page return to login button too long and not completely theme matching (using link maybe we use button like everything else in the app? Lets check all files for links and make them buttons to match the app I think.)
- Back to login button maybe on reset password page
- Verify email page button and vertical spacing (lets make sure all login/register/verify-email/forgot-password/reset-password are styled the exact same so it all is uniform). I have made the styling good for login and register page so copy that to other pages.
- Round stats number coloring needs work (logic for green and red) I made vs par to green < 0 <= primary-text < 19 <= red. I think we can follow the same for fir, gir, putts, penalties. FIR: red < 20% <= primary-text < 50% <= green. GIR: red < 20% <= primary-text < 50% <= green. Putts/hole: green < 2 <= primary-text < 3 <= red. Penalties: green < 1 <= primary-text < 3 <= red. 
- Cancel from add / edit round needs confirmation to avoid accidental data deletion
- Update course search results from rounds/add and edit to include location string like we have on courseCard so we can differentiate between same named courses. We'll see if we need this or not.
- Look into buttons for score/putts/penalties input. Not sure what we should do for this.
- Look into competitor exporting to see if we can import easily
- have profile info editable by default (remove edit profile button) and when user changes a stat, render the cancel/save buttons. If user tries to navigate away from page warn them that changes are not saved.
- sometimes have to press logout button or settings button twice.
- need to add timezone to user (can get from location) so date on add round is correct
- Change password needs eye icon, lets copy what we have from register page and use the same logic and icons
- Dual color trend fir gir
- Edit other people’s rounds from their dashboard throwing db error (need to make sure edit/delete buttons are only rendered if current user = round.user)
- Make sure if location is enabled we reload the page
- lets

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
