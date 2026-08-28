# Social Privacy and Moderation

## Product rules

- Signed-in golfers remain discoverable by name and profile image so friend search and leaderboards work.
- A golfer's detailed dashboard analytics follow their `private`, `friends`, or `public` dashboard visibility setting.
- `private` allows only the profile owner. `friends` allows the owner and accepted friends. `public` allows any signed-in golfer.
- Public profiles, leaderboards, and friend search remain discoverable to signed-in golfers so rankings and friend discovery work. They expose profile details and the existing summary stat fields, not round history or detailed dashboard analytics.
- A block applies in both directions. Blocked golfers cannot view each other's detailed dashboard or stats and are excluded from each other's leaderboards and friend activity.
- Creating a block removes accepted friendships, pending friend requests, and existing friend-activity notifications between the two golfers.
- Reports are private moderation records. The reported golfer must never be shown the reporter's identity, report details, or review outcome.

## Report review operations

Reports are stored in `user_reports` with one of four statuses:

1. `open` — newly submitted and awaiting review.
2. `in_review` — a reviewer has started investigating.
3. `resolved` — action was taken or the safety concern was otherwise resolved.
4. `dismissed` — no action was warranted after review.

Until a dedicated moderation console exists, an authorized operator reviews reports through the Supabase SQL editor using a least-privilege administrative account.

### Review queue

```sql
select
  r.id,
  r.reporter_id,
  r.reported_user_id,
  r.reason,
  r.details,
  r.status,
  r.created_at,
  r.updated_at
from user_reports r
where r.status in ('open', 'in_review')
order by r.created_at asc;
```

### Review procedure

1. Change the report to `in_review` before investigating.
2. Review the reported profile and relevant account records. Do not contact the reported golfer with reporter-identifying information.
3. Apply any account action through the existing administrative process.
4. Change the report to `resolved` when action was taken, or `dismissed` when no action was warranted.
5. Preserve the report row and timestamps as the moderation audit record.

Use a parameterized database client for application code. In the Supabase SQL editor, replace the example report ID only after confirming the selected row:

```sql
update user_reports
set status = 'in_review', updated_at = now()
where id = 123 and status = 'open';

update user_reports
set status = 'resolved', updated_at = now()
where id = 123 and status = 'in_review';
```

Use `dismissed` instead of `resolved` for a reviewed report that requires no action.
