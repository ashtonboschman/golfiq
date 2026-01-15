# GolfIQ Development Roadmap

## Overview
GolfIQ is a smart golf stat tracking app with AI-powered coaching, social features, and gamified achievements.

## Technology Stack
- **Framework:** Next.js 16.1.1 with React 19.2.3
- **Database:** PostgreSQL (Supabase) + Prisma ORM 7.2.0
- **Authentication:** NextAuth with JWT
- **Payments:** Stripe (API 2025-12-15.clover)
- **AI:** OpenAI GPT-4o-mini (planned)
- **Ads:** Google AdSense
- **Styling:** CSS (App.css file)

---

## Phase 1: Core Subscription Gates ✅ **COMPLETE**

### Subscription Enforcement
- ✅ PremiumGate component (`components/PremiumGate.tsx`)
- ✅ Subscription check middleware for API routes
- ✅ Global leaderboard limited for free users (top 100 + user ±5)
- ✅ Dashboard analytics limited to last 20 rounds (free users)
- ✅ Data export tracking (1 CSV per month for free, unlimited for premium)
- ✅ Premium CTAs throughout app:
  - ✅ Upgrade modal at 3 rounds, then every 5 rounds (8, 13, 18, 23...)
  - ✅ Dynamic messaging based on round count
  - ✅ Export limit reached CTA in Settings
  - ✅ AI Coach page with premium gate

### Google AdSense Integration
- ✅ AdSense account created
- ✅ AdSense script added to layout
- ✅ `InlineAdBanner` component created
- ✅ Ads placed on: Dashboard (1), Rounds page (every 5), Courses (every 10), Leaderboard (bottom)
- ✅ Ads hidden for premium users

### Essential UX Fixes
- ✅ Forgot Password flow implemented
- ✅ Email verification on registration
- ✅ Tee auto-selection based on profile gender/default tee
- ✅ Date picker timezone bug fixed (off-by-one error)
- ✅ Par auto-loading when tee is selected

### Data Export System
- ✅ `DataExport` database table
- ✅ Export API endpoint (`/api/export/rounds`)
- ✅ CSV and JSON format support
- ✅ Monthly usage tracking
- ✅ Settings page export section

### Crowdsourced Course Import
- ✅ `ApiUsageLog` database table
- ✅ Rate limiting utility (`lib/utils/apiRateLimit.ts`)
- ✅ Golf Course API search endpoint with rate limiting (200/day)
- ✅ Tee validation (reject "Combo" and "/" tees)
- ✅ User-facing course search page (`/courses/search`)
- ✅ Navigation from courses page
- ✅ Duplicate course prevention

**Status:** Complete (2026-01-07)

---

## Phase 2: Achievement System (Week 2-3) 🏆

### Database & Backend
- [ ] Add achievement schema to Prisma
- [ ] Create seed data for 17 achievements
- [ ] Run migration
- [ ] Build achievement calculator engine
- [ ] Build achievement updater service (5-min grace period)
- [ ] Integrate with round save/edit API
- [ ] Create achievement API endpoints

### Frontend
- [ ] Build `AchievementToast` component
- [ ] Create achievements page
- [ ] Add achievements link to footer/header
- [ ] Show achievement badges on user profiles
- [ ] Add notification bell icon with unread count
- [ ] Add achievement preview on add/edit round page
- [ ] Add confirmation dialogs for rare achievements

**Estimated time:** 6-8 days

---

## Phase 3: MVP AI Features (Week 3-4) 🤖

### Setup
- [ ] Create OpenAI account and get API key
- [ ] Set up environment variables
- [ ] Create AI service wrapper

### Post-Round AI Recap
- [ ] Build prompt template for post-round analysis
- [ ] Create `AiInsight` database table
- [ ] Build `/api/ai/round-recap` endpoint
- [ ] Trigger on round save
- [ ] Display on round card and rounds page

### Dashboard AI Widget
- [ ] Build "Biggest Opportunity" calculator
- [ ] Add caching logic (24hr)
- [ ] Create dashboard widget component
- [ ] Premium gate the widget

### Basic AI Chat
- [ ] Create `AiChatMessage` and `AiUsageQuota` tables
- [ ] Build `/api/ai/chat` endpoint with rate limiting (20/month)
- [ ] Create chat interface page
- [ ] Add pre-loaded prompt buttons
- [ ] Implement conversation context

**Estimated time:** 8-10 days

---

## Phase 4: PWA & Polish (Week 4-5) 📱

### Progressive Web App
- [ ] Create `manifest.json`
- [ ] Add service worker for offline functionality
- [ ] Add PWA meta tags to layout
- [ ] Test installation on iOS/Android
- [ ] Add install instructions on login page

### Settings Page
- [ ] Build settings page layout
- [ ] Add subscription management (Stripe portal link)
- [ ] Add notification preferences
- [ ] Add contact/FAQ section
- [ ] Add data export button with monthly limit tracking

### Dashboard Improvements
- [ ] Add 9 vs 18 indicator on combined mode
- [ ] Add handicap history graph (premium)
- [ ] Add KPI comparison widget (recent vs overall)

**Estimated time:** 6-8 days

---

## Phase 5: Launch Prep (Week 5-6) 🎯

### Testing
- [ ] End-to-end user flow testing
- [ ] Subscription upgrade/downgrade testing
- [ ] Payment flow testing (Stripe test mode → production)
- [ ] Mobile responsiveness testing
- [ ] Achievement trigger testing

### Marketing & Onboarding
- [ ] Create landing page explaining features
- [ ] Build first-time user onboarding flow
- [ ] Add feature tour tooltips
- [ ] Create pricing page copy
- [ ] Set up analytics (Google Analytics / Mixpanel)

### Production Readiness
- [ ] Switch Stripe to production mode
- [ ] Set up error monitoring (Sentry)
- [ ] Configure production database backups
- [ ] Set up domain and SSL
- [ ] Create privacy policy & terms of service

**Estimated time:** 7-10 days

---

## Post-Launch: Phase 6+ (Month 2+) 🌟

### Immediate Post-Launch Tasks
- [ ] **AdSense Final Setup** (requires live site)
  - Wait for Google to verify domain (24-48 hours)
  - Create 4 ad units in AdSense dashboard
  - Update ad slot IDs in components
  - Redeploy with real ad unit IDs
  - Test ads appearing for free users
- [ ] Monitor error logs and fix critical bugs
- [ ] Track user feedback and feature requests
- [ ] Monitor subscription conversion rates

### Advanced AI Features
- [ ] Course matchup analysis
- [ ] Pre-round briefings
- [ ] Handicap trajectory forecasting
- [ ] ROI analysis dashboard
- [ ] Weather and time-of-day impact analysis
- [ ] Playing partner performance analysis

### Enhanced Features
- [ ] Course bookmarking system (5 free, unlimited premium)
- [ ] Advanced filtering/sorting on rounds and courses
- [ ] Round tagging (tournament, casual, scramble, custom)
- [ ] Custom date ranges for analytics
- [ ] Profile customization (premium themes, frames, badges)
- [ ] Annual recap generator
- [ ] Golf bag section (clubs & distances)

### Social Enhancements
- [ ] Activity feed from friends
- [ ] Head-to-head stat comparisons
- [ ] Friend notifications on milestones
- [ ] QR code friend adding
- [ ] Messages between friends
- [ ] Course-specific leaderboards

### Additional Features
- [ ] Stroke difference calculator for matches
- [ ] 9-hole course played as 18 option
- [ ] Round cost tracking
- [ ] User reviews and photos for courses
- [ ] Multiple theme options
- [ ] Customizable dashboard widgets (drag-and-drop)

---

## Summary Timeline

| Phase | Focus | Status | Duration |
|-------|-------|--------|----------|
| Phase 1 | Subscription gates & ads | ✅ Complete | 8-10 days |
| Phase 2 | Achievement system | 🔲 Pending | 6-8 days |
| Phase 3 | MVP AI features | 🔲 Pending | 8-10 days |
| Phase 4 | PWA & polish | 🔲 Pending | 6-8 days |
| Phase 5 | Launch prep | 🔲 Pending | 7-10 days |
| **Total** | **MVP to Launch** | **Phase 1 Done** | **~6-8 weeks** |

---

## Phase 1 Implementation Details

### Premium Conversion Strategy
**Upgrade Modal Triggers:**
- Round 3: First exposure to premium features
- Round 8, 13, 18, 23+: Every 5 rounds thereafter
- Dynamic messaging based on user progress
- Round 13+: Emphasizes 20-round analytics limit

**Subscription Tiers:**
- **Free**: Unlimited rounds, ads, 20-round analytics limit, 1 export/month, top 100 leaderboard
- **Premium ($4.99/mo or $39.99/yr)**: Ad-free, unlimited analytics, unlimited exports, full leaderboard, AI Coach access
- **Lifetime ($99 one-time)**: All premium features forever

### Files Created (Phase 1)
- `components/UpgradeModal.tsx` - Reusable upgrade modal with animations
- `lib/utils/dataExport.ts` - Data export utility functions
- `app/api/export/rounds/route.ts` - Rounds data export API endpoint

### Files Modified (Phase 1)
- `app/dashboard/page.tsx` - Added progressive upgrade modal system
- `app/settings/page.tsx` - Added data export section
- `app/rounds/add/page.tsx` - Fixed par auto-loading with tee selection
- `app/api/rounds/route.ts` - Fixed date parsing for create
- `app/api/rounds/[id]/route.ts` - Fixed date parsing for update
- `components/RoundCard.tsx` - Fixed date display
- `app/rounds/[id]/stats/page.tsx` - Fixed date display
- `app/pricing/page.tsx` - Removed free trial references
- `app/app.css` - Added UpgradeModal styles (lines 2205-2371)
- `prisma/schema.prisma` - Added DataExport model

---

## Success Metrics

### Pre-Launch
- ✅ Phase 1 completed
- [ ] All Phase 2-5 tasks completed
- [ ] Zero critical bugs
- [ ] Payment flow tested successfully
- [ ] Mobile app installation working

### Post-Launch (Month 1)
- **User Acquisition:** 100+ registered users
- **Conversion Rate:** 5%+ free-to-premium
- **Retention:** 40%+ weekly active users
- **AI Engagement:** 60%+ premium users use AI coach

### Post-Launch (Month 3)
- **User Acquisition:** 500+ registered users
- **Conversion Rate:** 8%+ free-to-premium
- **Retention:** 50%+ weekly active users
- **Achievement Engagement:** 70%+ users earn 3+ achievements

---

## Notes
- ✅ Phase 1 (business model enforcement) complete - ready for Phase 2
- AI features are premium-only to drive conversion
- Achievement system will be freemium to drive engagement
- PWA approach avoids App Store complexity initially
- Progressive conversion strategy: Show upgrade modal at strategic milestones without being annoying
