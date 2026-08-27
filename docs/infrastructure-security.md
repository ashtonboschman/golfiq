# Infrastructure security runbook

Last reviewed: 2026-08-27

This runbook covers the controls that cannot be proven from application code alone. Do not store passwords, API keys, recovery codes, personal phone numbers, or private email addresses in this file.

## Dependency advisory triage

The 2026-08-27 review upgraded compatible releases of Next.js, `eslint-config-next`, Prisma Client, the Prisma PostgreSQL adapter, and the Prisma CLI. A non-forced `npm audit fix` also refreshed compatible transitive packages.

Current result:

- No critical advisories.
- The deployed Next.js/runtime advisories reported before this review are resolved.
- The remaining three high-severity audit entries share one root advisory in `deepmerge-ts`, reached through `prisma` and `@prisma/config`.
- The remaining path is Prisma migration/configuration tooling, not the deployed application runtime. npm offers only a forced downgrade to Prisma 6, so that remediation is rejected as a breaking and inappropriate change.

Re-run `npm audit --omit=dev` with every dependency update and at least monthly. Upgrade the Prisma 7 line when it includes a patched `deepmerge-ts`. Do not use `npm audit fix --force` for this exception.

## Distributed authentication throttling

Vercel's automatic DDoS mitigation is active. The Hobby plan does not expose the configurable Firewall `Rate Limit` action, so GolfIQ uses `security_rate_limit_buckets` in Supabase/Postgres for shared authentication counters. `proxy.ts` also retains process-local limits as defense in depth and as a fail-open fallback if the shared database is temporarily unavailable.

The shared limiter applies these buckets. Client IP addresses and user-agent fallbacks are SHA-256 hashed before storage.

| Rule | Conditions | Limit | Purpose |
| --- | --- | --- | --- |
| Credentials sign-in | Method `POST`; Request Path equals `/api/auth/callback/credentials` | 10 requests per client per 15 minutes | Slow password guessing without affecting OAuth callbacks. |
| Public account recovery | Method `POST`; Request Path is any of `/api/users/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/verify-email`, `/api/auth/resend-verification` | 8 requests per client per 15 minutes | Protect registration, verification, and reset mail/token workflows. |
| Authenticated password change | Method `PUT`; Request Path equals `/api/users/change-password` | 5 requests per client per 15 minutes | Limit repeated password-change attempts. |

Rollout checklist:

- [x] Confirm the Vercel plan does not support the configurable Rate Limit action and implement shared Supabase/Postgres counters instead.
- [ ] Review and apply the tracked Prisma migration with `npx prisma migrate deploy`.
- [ ] Redeploy and verify one normal request for credentials sign-in, account recovery, and password change.
- [ ] Confirm Google/Apple OAuth routes and RevenueCat/Stripe webhooks remain unaffected.
- [ ] Confirm the eleventh credentials attempt, ninth public-auth attempt, and sixth password-change attempt each receive HTTP 429.
- [ ] Record the rule owner and review date in the private operations record.

If GolfIQ upgrades to Vercel Pro, migrate these limits to pre-function Firewall rate-limit rules after a log-only validation period. Keep the application limiter until the new rules have been verified in production.

## Google Maps browser key

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is intentionally visible to browsers. Its protection comes from restrictions, not secrecy. GolfIQ uses the Maps JavaScript API from pages served over HTTPS; the Capacitor iOS shell also loads `https://www.golfiq.ca`, so it uses the same HTTPS origin.

In Google Cloud Console, edit the browser key and verify:

- Application restriction: **Websites**.
- Allowed referrers: `https://www.golfiq.ca` and `https://www.golfiq.ca/*`.
- Add `https://golfiq.ca` and `https://golfiq.ca/*` only while the apex serves application pages rather than immediately redirecting every request.
- Do not authorize `*`, `*.vercel.app`, localhost, or arbitrary preview deployments on the production key. Use a separate development key if those origins need Maps.
- API restriction: **Maps JavaScript API** only. Add another API only after code usage is identified and tested.
- Set a conservative Maps quota and billing-budget alerts.
- Review key usage by API and referrer after restricting it, and rotate only if unauthorized use is observed.

The loader sends `auth_referrer_policy=origin`, so Google authorizes against the HTTPS origin instead of a page path.

## Production ownership and recovery

Maintain the completed version of this inventory in a private password manager or restricted operations document. The repository records the required coverage but must not contain recovery secrets.

| System | Required ownership and recovery evidence | Confirmed |
| --- | --- | --- |
| Domain registrar and DNS | Primary owner, backup owner, MFA, registrar lock, renewal payment, recovery contact, and emergency DNS access | [ ] |
| GitHub | At least two recovery paths, MFA, recovery codes stored securely, repository admin ownership, and deploy-key/app review | [ ] |
| Vercel | Team/project owner, backup administrator, MFA, domain ownership, deployment rollback access, spend alerts, and Firewall access | [ ] |
| Supabase/Postgres | Organization/project owner, backup administrator, MFA, database password rotation owner, backups/PITR status, and restore procedure | [ ] |
| Apple Developer and App Store Connect | Account Holder, backup admin, trusted phone/device recovery, agreements/banking owner, API-key owner, and certificate/profile recovery | [ ] |
| RevenueCat | Project owner, backup admin, MFA, webhook-secret rotation owner, Apple credential owner, and transfer-setting owner | [ ] |
| Stripe | Account owner, backup admin, MFA, bank/payout recovery, webhook-secret rotation owner, and emergency subscription support | [ ] |
| Google Cloud / Maps | Project owner, backup owner, MFA, billing owner, quota-alert recipient, and API-key restriction/rotation owner | [ ] |
| Authentication providers | Google and Apple OAuth client ownership, redirect-domain access, secret/key rotation, and account-deletion/revocation ownership | [ ] |
| PostHog | Organization/project owner, backup admin, MFA, retention/access owner, and incident export access | [ ] |
| Email provider | Domain/DNS ownership, sender-domain recovery, API-key rotation owner, suppression-list access, and delivery-alert recipient | [ ] |
| Upload provider | Account owner, backup access, API-key rotation owner, storage/deletion policy, and abuse response | [ ] |

For every system above:

1. Keep the primary and backup administrator on separate accounts with MFA.
2. Store recovery codes and break-glass instructions in a secure location accessible to the backup owner.
3. Record renewal dates, billing failure contacts, and which production features fail if access is lost.
4. Test one non-destructive recovery or backup-admin access path every six months.
5. Review former collaborators, stale API keys, OAuth apps, webhooks, and deploy credentials quarterly.

Item 11 is complete only after the dependency review remains passing, the database migration and distributed authentication limits are verified in production, the Maps key restrictions are verified, and every ownership row above is confirmed in the private record.
