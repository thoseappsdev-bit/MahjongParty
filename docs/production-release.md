# Production Release

This checklist covers the GitHub Actions release path for the Cloudflare-hosted Mahjong Party prototype. Keep local setup details in `.env` and `.dev.vars`; production values belong in GitHub Secrets, Cloudflare Worker secrets, Supabase, Discord, or provider dashboards.

Operational recovery, database backups, and rollback procedures are in [Recovery And Operations](./recovery-and-operations.md).

## GitHub Actions

- `CI` runs on every push and pull request.
- `CodeQL` runs on pushes to `main`, pull requests to `main`, and a weekly schedule.
- `CI` installs with `pnpm install --frozen-lockfile`, then runs `pnpm test` and `pnpm build`.
- `Deploy Cloudflare` is manual-only through GitHub Actions `workflow_dispatch`.
- `Deploy Cloudflare` installs dependencies, runs `pnpm security:secrets`, `pnpm test`, `pnpm build`, `pnpm check:cloudflare`, `pnpm production:check`, deploys, then runs `pnpm production:smoke`.
- The deploy workflow uses the `production` GitHub Environment. Add required reviewers there if production deploys should be gated.

## GitHub Repository Protection

After pushing `main` to GitHub, enable these repository settings before treating the repo as release-ready:

- Protect `main` and require pull requests before merging.
- Require the `CI` workflow status check before merging.
- Require the `CodeQL` workflow status check before merging once the first scan has run.
- Require CODEOWNERS review after replacing the placeholder owner in `.github/CODEOWNERS` with the real GitHub user or organization.
- Enable Dependabot alerts and Dependabot security updates.
- Enable secret scanning and push protection if the repository plan supports it.

## Required GitHub Secrets

Set these in GitHub repository or environment secrets before running the manual Cloudflare deploy workflow:

| Secret name | Used for |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Wrangler authentication for `pnpm deploy:cloudflare`. Use a scoped token that can deploy the `mahjong-party` Worker. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account target for Wrangler. |
| `VITE_SUPABASE_URL` | Browser-safe Supabase project URL embedded into the Vite production build. |
| `VITE_SUPABASE_ANON_KEY` | Browser-safe Supabase anon key embedded into the Vite production build. |
| `VITE_DISCORD_CLIENT_ID` | Browser-safe Discord application client id for Activity mode. |
| `VITE_TURNSTILE_SITE_KEY` | Browser-safe Cloudflare Turnstile site key embedded into the Vite production build. |
| `MAHJONG_PRODUCTION_URL` | Optional GitHub Actions variable, not a secret. Used by post-deploy smoke tests. Defaults to `https://mahjong-party.youraimates.workers.dev`. |

Do not put real secret values in workflow files or docs. Use only GitHub Secret names such as `${{ secrets.CLOUDFLARE_API_TOKEN }}`.

## Required Cloudflare Worker Secrets

Configure server-only values in Cloudflare before or immediately after the first production deploy. Use the Cloudflare dashboard, run `wrangler secret put NAME` from a trusted local shell, or run `pnpm sync:cloudflare-secrets` to sync the supported server secrets from local `.env`.

Required for authenticated production economy and room routes:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
TURNSTILE_SECRET_KEY
```

`SUPABASE_URL` is the project URL. `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `TURNSTILE_SECRET_KEY`, and `DISCORD_CLIENT_SECRET` are server-only secrets and must never be copied into a `VITE_` variable or GitHub Actions log.

Set and verify the Turnstile secret without writing it into a tracked file:

```powershell
npx wrangler secret put TURNSTILE_SECRET_KEY --name mahjong-party
npx wrangler secret list --name mahjong-party
```

The browser receives only `VITE_TURNSTILE_SITE_KEY`. Room creation and economy claims are verified directly by the Worker using `TURNSTILE_SECRET_KEY`.

## Supabase Turnstile Protection

Magic-link CAPTCHA verification is completed by Supabase Auth, so configure it separately in the Supabase dashboard:

1. Open Authentication, then Bot and Abuse Protection.
2. Enable CAPTCHA and select Cloudflare Turnstile.
3. Enter the same private Turnstile secret stored in Cloudflare as `TURNSTILE_SECRET_KEY`.
4. Save and test one production magic-link request.

The web app passes the Turnstile proof as Supabase's `captchaToken`. Without the dashboard setting, the UI is gated but direct Supabase Auth requests are not protected by Turnstile.

For production auth redirects, set the Supabase Auth Site URL and allowlist exactly to the deployed worker origin:

- Supabase Site URL: `https://mahjong-party.youraimates.workers.dev`
- Redirect allowlist: `https://mahjong-party.youraimates.workers.dev/**`

Required for Discord OAuth token exchange:

```text
DISCORD_CLIENT_SECRET
```

Optional for server-side Activity Instance API validation before wider public testing:

```text
DISCORD_BOT_TOKEN
```

Optional image provider keys, only if production image generation is enabled:

```text
OPENAI_API_KEY
CHATGPT_API_KEY
FAL_KEY
FAL_AI_API_KEY
```

## Disabled Monetization Paths

Real-money purchase verification and rewarded-ad fulfillment are intentionally disabled for this release. Do not advertise either feature as functional and do not add a secret or environment flag to bypass that restriction.

Before enabling purchases, implement provider receipt verification, idempotent fulfillment, refunds/reversals, fraud controls, and sandbox-to-production tests. Before enabling rewarded ads, integrate an ad provider with server-verifiable completion callbacks, replay protection, rate limits, and abuse monitoring. Client assertions alone must never grant Coins or Gems.

## Supabase Migration Gate

The linked Supabase project must be at migration parity before the corresponding Worker build is deployed. From the repository root:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Before `db push`, confirm the linked project reference, review every pending migration, and create a verified backup as described in the [recovery runbook](./recovery-and-operations.md). After the push, every local migration must appear remotely and the final dry run must report nothing pending. Only one operator should push migrations at a time.

Do not use `supabase migration repair` as a normal deploy command. It changes migration history without applying or reverting SQL. If remote schema was modified manually, stop and reconcile the schema and migration history deliberately.

## Cloudflare Custom Domain

1. Deploy once with the manual `Deploy Cloudflare` workflow so the `mahjong-party` Worker exists in Cloudflare.
2. In Cloudflare, open the account and zone that will host the production domain.
3. Go to Workers & Pages, open the `mahjong-party` Worker, then open Settings, Domains & Routes.
4. Add a Custom Domain for the production host, for example `mahjong.example.com`.
5. Confirm the zone is active in Cloudflare DNS. If the domain is managed elsewhere, delegate the zone to Cloudflare first or configure the required proxied DNS record Cloudflare asks for.
6. Wait for Cloudflare to issue the certificate, then verify:

```text
https://<production-host>/
https://<production-host>/health
```

The Worker serves `apps/web/dist` as static assets and routes API traffic through the Worker in `wrangler.jsonc`.

## Discord OAuth And Activity Configuration

In the Discord Developer Portal, configure the same application whose client id is stored as `VITE_DISCORD_CLIENT_ID`.

OAuth2 client information:

- Copy the Client ID into the GitHub Secret `VITE_DISCORD_CLIENT_ID`.
- Copy the Client Secret into the Cloudflare Worker secret `DISCORD_CLIENT_SECRET`.

OAuth2 redirects:

```text
https://127.0.0.1
```

The local redirect is required by Discord Activity setup for embedded SDK auth. If a future non-Activity browser OAuth flow is added, add that production callback URL separately at that time.

Activities settings:

- Enable Activities for the Discord application.
- Enable the desktop and mobile platforms you plan to support.
- Add production URL mappings after the Cloudflare custom domain works:

```text
Prefix: /
Target: <production-host>
```

Do not include `https://` in the Discord Activity URL Mapping target. If production API traffic is moved to a separate host later, add the more specific `/api` mapping before `/`.

## Local Environment Files

`.env`, `.env.*`, and `.dev.vars` stay local and gitignored. Keep using:

```text
.env.example
.dev.vars.example
apps/web/.env.example
```

as templates only. Never commit real `.env` files, Cloudflare tokens, Supabase service-role keys, Discord client secrets, bot tokens, or provider API keys.

## Production Gate Commands

Run these before a release candidate is considered ready:

```bash
pnpm security:secrets
pnpm test
pnpm build
pnpm check:cloudflare
pnpm production:check
pnpm production:smoke -- https://<production-host>
```

`pnpm security:secrets` scans tracked files for committed secrets and forbidden local/generated paths. `pnpm production:check` verifies release automation files, gitignored local secrets, Worker observability/Durable Object config, static security headers, the 350 KB entry bundle budget, and CI/deploy workflow guardrails. `pnpm production:smoke -- https://<production-host>` verifies the live Worker health response, security headers, unauthenticated catalog, and analytics endpoint. These guardrails do not replace real multiplayer QA.

## Backup And Rollback Gate

- Confirm a current Supabase managed backup or create schema, data, and role dumps outside the repository.
- Record the current Cloudflare Worker version and commit SHA before deployment.
- Confirm the previous Worker version is compatible with the post-migration Supabase schema and current Durable Object state.
- Remember that `wrangler rollback` does not revert database migrations, secrets, bindings, DNS, or Durable Object storage.
- Keep the production host, Supabase project reference, backup location/checksums, and rollback version in the release record without including secret values.

## Release Runbook

1. Confirm CI and CodeQL are green on the commit that will be deployed.
2. Confirm required GitHub Secrets exist in the repository or `production` environment.
3. Confirm required Cloudflare Worker secrets exist for the deployed Worker.
4. Confirm Supabase backup status and create the off-site pre-release dumps required by the recovery runbook.
5. Link to the intended Supabase project, review the migration dry run, push pending migrations, and prove migration parity.
6. Record the current Cloudflare deployment version and verify that the intended rollback target remains schema-compatible.
7. Run the manual `Deploy Cloudflare` workflow from GitHub Actions. The workflow reruns the production gates before deploy and smoke-tests `MAHJONG_PRODUCTION_URL` after deploy.
8. Run `pnpm production:smoke -- https://<production-host>` and open `/health`.
9. Test one authenticated room, reconnect, wallet read, and economy mutation against production without using real-money purchase or rewarded-ad paths.
10. Launch the Discord Activity from a test server and confirm the Activity opens the production host and completes OAuth.
11. Record release evidence and monitor Worker/Supabase logs before declaring the release complete.
