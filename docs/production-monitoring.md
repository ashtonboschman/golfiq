# Production monitoring

GolfIQ reports production failures through two existing services:

- PostHog Error Tracking receives sanitized browser and native WebView exceptions.
- The `application_error` PostHog event provides a single alertable stream for client and server failures.
- Vercel Runtime Logs receive structured JSON for server failures and unhandled Next.js request errors.

## Covered failure areas

The shared monitoring contract covers `client`, `server`, `webview`, `authentication`, `purchase`, `restore`, `webhook`, `gps`, `save`, and `finalization`. Handled failures include an operation name, severity, route template, status code when available, and whether recovery is possible.

## Privacy rules

Monitoring calls must not include request or response bodies, email addresses, names, access tokens, purchase receipts, transaction IDs, course IDs, round IDs, session IDs, or coordinates. Route templates are preferred over concrete URLs. The shared sanitizer also redacts emails, bearer tokens, URL query strings, coordinates, and long numeric identifiers from exception messages and stacks before transmission.

## One-time PostHog alert setup

Code deployment starts event collection; alert delivery must be connected once in the GolfIQ PostHog project:

1. Open **Error Tracking** and confirm a deliberately generated non-production exception appears before enabling production notifications.
2. Open **Insights**, create a Trends insight that counts the `application_error` event, and filter `environment = production`.
3. Add breakdowns for `feature_area` and `operation`, then save it as **GolfIQ Production Errors**.
4. Add an alert for any production error during a 5-minute interval. Route the alert to the owner email. If this is noisy after real traffic begins, change it to three errors in 5 minutes while keeping `severity = fatal` at a threshold of one.
5. In Error Tracking settings, enable spike detection notifications for new or rapidly increasing issues.

PostHog configuration must use `application_error`, not `app_error_shown`: the latter records user-visible messages and is not evidence of a system failure.

## Vercel verification

After deployment, open **Vercel > GolfIQ > Logs** and filter for `application_error`. Structured entries include `feature_area`, `operation`, `route`, `severity`, `environment`, and `app_version`. Vercel Runtime Logs provide the server-side investigation trail; PostHog is the primary notification path.

If the Vercel plan later includes Observability alerts, add a production 5xx anomaly alert as a second independent notification path. Runtime Logs remain available without adding a log-drain vendor.

## Release verification

Before marking monitoring complete:

1. Deploy to Preview and trigger one controlled client error and one controlled server error without using real customer data.
2. Confirm both appear as `application_error` with `environment = staging` in PostHog.
3. Confirm the server error appears as structured JSON in the Preview deployment Runtime Logs.
4. Confirm exception text contains no email, token, coordinates, query string, receipt, or transaction ID.
5. Test the PostHog alert delivery, then remove or disable the controlled failure path before production deployment.
