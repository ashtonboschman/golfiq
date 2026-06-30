# AGENTS.md

## Project Scope

GolfIQ is a Next.js App Router golf analytics app using Prisma/Postgres, NextAuth, PostHog, RevenueCat/Stripe billing paths, and a custom mobile-first UI. It also supports Capacitor/iOS shells.

GolfIQ is not a GPS-first golf app. Prioritize fast round entry, clear stats, deterministic insights, premium analytics, and golfer-native copy.

## Work Style

* Make small, targeted changes.
* Do not perform broad rewrites unless explicitly requested.
* Treat existing tests, especially stat and insight tests, as product specification.
* Before changing behavior, trace the route/page, shared `lib/*` helper, API contract, and matching tests.
* Prefer code that matches existing repo patterns over introducing new abstractions.
* If a change touches golf logic, billing, auth, subscriptions, insights, or round flows, explain the risk before making broad edits.
* If you create temporary helper files for Codex work, delete them before handoff once they are no longer needed so the working tree stays clean.

## Architecture Rules

* Prefer the existing architecture: client pages, API routes, and shared `lib/*` helpers.
* Do not introduce server actions unless explicitly requested.
* Reuse canonical helpers for golf logic, entitlement logic, analytics, and subscription checks.
* Do not duplicate handicap, strokes-gained, leaderboard, insight, or premium-gating math inside pages/components.
* Keep auth/session fields, subscription fields, entitlement checks, API responses, and client usage aligned.

## Database Rules

* Prisma models/fields use camelCase in code and map to snake_case database names with `@map` / `@@map`.
* Do not rename mapped Prisma fields casually.
* Treat `prisma/schema.prisma`, existing migrations, and Supabase SQL workflows as high-risk.
* For Prisma-managed database changes, follow the repo's historical pattern: create tracked Prisma migration folders under `prisma/migrations` instead of standalone manual SQL files whenever feasible.
* Use Prisma migrations as the source of truth for schema evolution. In this repo, prefer `npx prisma migrate deploy` for applying committed migrations because there is no separate dev migration environment yet.
* Do not auto-run `npx prisma migrate deploy`. Prepare the migration files, but leave the actual deploy command for the user to review, authorize, and run manually.
* Assume Supabase is the Postgres host.
* Do not introduce a new app-wide Supabase client pattern unless explicitly requested.

## UI Rules

* GolfIQ uses custom components, not shadcn/ui.
* Do not introduce shadcn/ui, Radix wrapper patterns, or a new component library unless explicitly requested.
* Preserve the current design system: shared semantic styling in `app/app.css` and existing helper classes.
* Reuse existing components and patterns from `components/`, `Layout`, `PremiumGate`, and shared style helpers.
* Use `lib/selectStyles.ts` for `react-select` styling patterns.
* For app UI work, prefer existing classes in `app/app.css`. If the needed styling does not exist, add or extend classes in `app/app.css` instead of introducing inline styles or Tailwind utilities.
* Use the shared spacing tokens in `app/app.css` for new components and UI changes, including `--gap`, `--gap-small`, `--padding`, `--padding-small`, and `--padding-large`. Do not introduce hard-coded spacing when an existing token represents the intended rhythm.
* Keep related screen-edge insets, sibling gaps, and component padding aligned through the same spacing tokens. Avoid mixing near-equivalent values such as 10px and 12px unless the visual difference is intentional and documented in the CSS.
* Do not introduce new Tailwind utility usage unless explicitly requested. If you touch a Tailwind-styled holdout, prefer converting it to the repo's `app.css` conventions.
* Avoid new inline styles for app UI unless the styling is truly runtime-driven, such as measured CSS custom properties or data-driven bar positioning. Email templates are an allowed exception.
* Keep UI mobile-first, clean, premium-feeling, and analytics-focused.
* Include loading, empty, locked, and error states when relevant.
* Button and CTA labels should use Title Case to match the app's existing style.

## Product Rules

* "Real" rounds drive handicap, leaderboard, dashboard stats, and overall insights.
* Simulator and practice rounds are intentionally excluded from handicap, leaderboard, dashboard aggregation, and overall insights unless a task explicitly changes that behavior.
* Free-tier behavior matters. Preserve dashboard caps, locked insight sections, premium themes, upgrade CTAs, and purchase flows.
* Round add/edit/live flows are stateful and fragile. Preserve local draft keys, live-round resume behavior, course/tee/hole fetch chains, and recovery flows unless the task specifically changes them.
* Insights should be deterministic, explainable, data-backed, and confidence-aware.
* Avoid generic AI-coach language. GolfIQ copy should sound golfer-native, specific, and useful.

## Analytics Rules

* Use shared PostHog helpers and event constants in `lib/analytics/*`.
* Preserve existing capture behavior and event props unless product requirements say otherwise.
* Add or update events for meaningful user actions, not purely visual state changes.

## Billing and Entitlements

* Billing is multi-provider. RevenueCat purchase links are active, while Stripe webhook, sync, and portal logic still exist.
* Do not assume subscription state is simple.
* Keep provider, entitlement, subscription status, session, and client gating behavior aligned.
* Treat subscription APIs, webhook handlers, and entitlement helpers as high-risk.

## Testing Rules

* Add or update focused tests when changing golf math, insights, auth, subscriptions, dashboard aggregation, API contracts, or premium gating.
* Prefer targeted Jest runs over broad watch-based commands.
* Do not remove or loosen tests just to make a change pass.

## High-Risk Areas

Check related routes, helpers, tests, and API contracts before modifying:

* `lib/utils/handicap.ts`
* `lib/utils/strokesGained.ts`
* `lib/utils/leaderboard.ts`
* `lib/insights/**`
* `lib/insights/postRound/policy.ts`
* `app/api/rounds/**`
* `app/api/insights/**`
* `lib/auth-config.ts`
* `app/api/webhooks/**`
* `lib/subscription.ts`
* `prisma/schema.prisma`
* `app/layout.tsx`
* `components/Layout.tsx`
* `app/app.css`

## Documentation Priority

If documentation conflicts with code, treat code and tests as authoritative unless the task is explicitly to update or correct documentation.

When adding supporting docs, prefer concise files that capture durable product rules:

* `docs/product-rules.md`
* `docs/stat-calculations.md`
* `docs/ui-patterns.md`
* `docs/premium-gating.md`
* `docs/analytics-events.md`
* `docs/round-flows.md`
* `docs/billing-providers.md`

