# Recovery And Operations Runbook

This runbook covers the production Supabase database and the Cloudflare Worker/Durable Object runtime. It documents recovery steps, not an automated disaster-recovery system. Provider access, credentials, backups, DNS control, and an operator are external requirements.

## External Requirements

Keep these outside the repository and verify access before a release or incident:

- Supabase organization access, project reference, database password, and a CLI Personal Access Token with access to the project.
- Cloudflare account access and either Wrangler login or a scoped API token that can inspect and deploy the `mahjong-party` Worker.
- Discord Developer Portal access for the Activity application. Client secrets and bot tokens cannot be recovered from this repository.
- Access to the production domain and Cloudflare DNS zone, if a custom domain is used.
- An encrypted off-site destination for logical database dumps. A dump stored only on the developer laptop or in the repository is not a backup.
- Docker Desktop or local Postgres client tools (`pg_dump` / `psql`) for logical dump and restore drills on Windows.
- A named incident operator who can pause releases, communicate downtime, and reconcile wallets and active rooms after recovery.

The repository does not currently provide a maintenance-mode switch, automated cross-region database replica, automated restore drill, or backup of Durable Object storage. Plan downtime before a database restore.

## Required Runtime Configuration

Browser-safe Vite build values:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_DISCORD_CLIENT_ID
```

Cloudflare Worker secrets required for production auth, economy persistence, and Discord OAuth:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
DISCORD_CLIENT_SECRET
```

`DISCORD_BOT_TOKEN` is optional and is only needed for server-side Activity Instance API validation. Never expose the service-role key, JWT secret, Discord client secret, or bot token through a `VITE_` variable.

Real-money purchase verification and rewarded-ad fulfillment are intentionally disabled. The current release must not grant Gems from a receipt, platform payment, ad callback, or client assertion. There is no supported environment flag to enable either path. Enablement requires authoritative receipt/ad-network verification, idempotent fulfillment, refund/reversal handling, abuse controls, and provider sandbox tests first.

## Supabase Link And Migration Parity

Run all commands from the repository root. The project reference is the subdomain in `https://<project-ref>.supabase.co` and is also shown in the Supabase dashboard project settings.

1. Confirm the installed CLI and authenticate interactively:

   ```powershell
   npx supabase --version
   npx supabase login
   ```

2. Link this checkout to the intended project. Read the project reference aloud or compare it with the production URL before continuing:

   ```powershell
   npx supabase link --project-ref <project-ref>
   ```

3. Compare local migration files with the linked project's migration history:

   ```powershell
   npx supabase migration list --linked
   ```

   Stop if a timestamp exists on only one side or if the linked project is not the intended environment. Do not use `migration repair` merely to silence a mismatch; it changes migration history without applying or reverting schema SQL.

4. Preview the exact pending migrations:

   ```powershell
   npx supabase db push --linked --dry-run
   ```

5. Apply the reviewed migrations once, from one operator machine:

   ```powershell
   npx supabase db push --linked
   ```

6. Prove parity after the push:

   ```powershell
   npx supabase migration list --linked
   npx supabase db push --linked --dry-run
   ```

   Parity means every repository migration is represented remotely and the dry run reports no pending migration. Record the commit SHA, project reference, operator, timestamp, and command output in the release record.

If schema was changed manually in the dashboard, stop and reconcile it into a committed migration. Use `supabase db pull` or `migration repair` only after verifying the real remote schema and understanding that repair changes history, not database objects. See the official [Supabase migration guide](https://supabase.com/docs/guides/deployment/database-migrations) and [CLI reference](https://supabase.com/docs/reference/cli/introduction).

## Backup Before A Release

Supabase managed-backup availability and retention depend on the project plan. Free-tier projects should create regular logical dumps. Managed database backups do not restore deleted Storage API objects, and Supabase backups do not contain Cloudflare Durable Object storage.

Before a database migration or economy-affecting Worker release:

1. Confirm the latest managed backup in **Supabase Dashboard > Database > Backups**, if the plan provides one.
2. Create encrypted logical dumps to a path outside the repository. On Windows, the Supabase CLI may require Docker Desktop for `pg_dump`; if Docker is unavailable, install local Postgres client tools or use Supabase managed backups before proceeding:

   ```powershell
   npx supabase db dump --linked --file C:\secure-backups\mahjong-schema-<utc-timestamp>.sql
   npx supabase db dump --linked --data-only --use-copy --file C:\secure-backups\mahjong-data-<utc-timestamp>.sql
   npx supabase db dump --linked --role-only --file C:\secure-backups\mahjong-roles-<utc-timestamp>.sql
   ```

3. Encrypt and copy the files to the approved off-site destination. Restrict access because data dumps may contain player identifiers and economy records.
4. Verify the files are non-empty, record checksums, and periodically test restoration into a disposable project. A dump that has never been restored is unverified.

Follow the official [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) for current plan retention, managed restore, and Point-in-Time Recovery behavior.

## Supabase Restore

Prefer a restore into a new or disposable project when time allows. This preserves the damaged project for investigation and makes validation possible before DNS or Worker secrets are changed.

1. Stop new deploys and announce downtime. Because there is no maintenance switch, prevent clients from starting paid rooms through external release/traffic controls and coordinate the outage.
2. Choose a recovery point before the incident. Document the expected data-loss window.
3. Restore a managed backup or Point-in-Time Recovery snapshot from **Supabase Dashboard > Database > Backups**. The project is unavailable during an in-place restore.
4. For logical dumps, provision the target Supabase project and follow Supabase's supported [backup and restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Do not improvise production `psql` flags or overwrite the original project before testing.
5. Link the restored target and run the migration parity commands above. Confirm all expected tables, RLS policies, service RPCs, wallet totals, ledger rows, daily state, and recent match history.
6. Update Cloudflare Worker secrets only if the restored project URL or keys changed. Rebuild the web app if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` changed.
7. Treat all rooms active at the recovery point as requiring reconciliation. Supabase restore does not rewind Durable Object snapshots, and stale room reservations can disagree with restored wallet state. Audit affected `table-buyin` and `table-settle` ledger entries before reopening coin tables.
8. Run the production smoke test and a controlled authenticated room/economy test before restoring traffic.

Never assume a database restore also restores Discord configuration, Cloudflare secrets, custom domains, Worker versions, or Durable Object storage.

## Cloudflare Worker Rollback

A Worker rollback creates a new deployment using a prior Worker version. It does not revert Supabase migrations, Cloudflare secrets, bindings, DNS, or Durable Object storage.

CLI rollback:

```powershell
npx wrangler deployments list --name mahjong-party
npx wrangler rollback <version-id> --name mahjong-party --message "Rollback: <incident-id>" --yes
pnpm production:smoke -- https://<production-host>
```

Dashboard rollback:

1. Open **Cloudflare Dashboard > Workers & Pages > mahjong-party > Deployments**.
2. Select the three-dot menu for the last known-good version and choose **Rollback**.
3. Confirm the active deployment, then run the smoke test and an authenticated room test.

Before rollback, confirm the old Worker is compatible with the current Supabase schema and Durable Object state. Cloudflare may refuse rollback across an incompatible Durable Object migration or a deleted/changed binding. Even when rollback succeeds, resources connected to the Worker are unchanged. See the official [Cloudflare Worker rollback documentation](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/).

## Incident Order Of Operations

1. Record incident start time, production host, Worker version, commit SHA, Supabase project reference, and visible symptoms.
2. Stop releases and reduce new state-changing traffic using available external controls.
3. Decide whether the fault is Worker code, database schema/data, provider configuration, or more than one layer.
4. For a Worker-only regression, roll back the Worker and verify. Do not restore the database by default.
5. For database corruption or destructive writes, preserve evidence, select a recovery point, and follow the Supabase restore procedure.
6. Reconcile active Durable Object rooms and economy reservations after any database restore.
7. Run health, production smoke, authenticated room, wallet, and Discord Activity checks.
8. Reopen traffic gradually and monitor Worker logs, Supabase logs, wallet/ledger anomalies, and reconnect failures.
9. Rotate any credential suspected of exposure, then update Cloudflare/GitHub secrets and rebuild the web bundle only where a browser-safe value changed.

## Recovery Evidence

Keep an incident record outside the repository with:

- Incident timeline and operator names.
- Commit SHA and Cloudflare version before and after rollback.
- Supabase project reference and selected recovery point.
- Migration parity output and dump checksums.
- Smoke-test output and authenticated multiplayer/economy test result.
- Wallet or bankroll reconciliation notes.
- Credentials rotated and external dashboards changed.

Do not paste secret values, access tokens, database passwords, JWT secrets, or player data into tickets or chat.
