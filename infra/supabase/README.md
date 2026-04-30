# Supabase migrations

Apply migrations in **numerical order**. Each one is idempotent.

## Phase 1 — apply now

1. Create a Supabase project (free tier) at https://app.supabase.com.
   Choose a region near `us-central1`, e.g. `us-east-1` or `us-west-1`.
2. In **Project Settings → Database**, note the project ref / URL.
3. In **Project Settings → API**, copy the `anon` and `service_role` keys.
4. Open **SQL Editor → New query**, paste the contents of
   `0001_init.sql`, and run it.
5. Verify in **Database → Extensions** that `postgis`, `pg_trgm`, and
   `uuid-ossp` are enabled.
6. Verify in **Database → Tables** that `public.profiles` exists.

## Verifying the trigger

After signing up a test user via `/login`, run in the SQL editor:

```sql
select * from public.profiles;
```

You should see a row matching the test user's email.

## Future phases

- `0002_data_model.sql` — Phase 2 (events, sources, raw_payloads, AIS, …)
- `0003_entities.sql` — Phase 4 (entity ontology + co-occurrence)
- `0004_analytics.sql` — Phase 5 (clusters, forecasts, anomalies, risk grid, briefs)
- `0005_multi_user.sql` — Phase 6 (orgs, memberships, invites, watchlists)
