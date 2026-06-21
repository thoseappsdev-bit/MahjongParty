# Production Release

This checklist covers the GitHub Actions release path for the Cloudflare-hosted Mahjong Party prototype. Keep local setup details in `.env` and `.dev.vars`; production values belong in GitHub Secrets, Cloudflare Worker secrets, Supabase, Discord, or provider dashboards.

## GitHub Actions

- `CI` runs on every push and pull request.
- `CodeQL` runs on pushes to `main`, pull requests to `main`, and a weekly schedule.
- `CI` installs with `pnpm install --frozen-lockfile`, then runs `pnpm test` and `pnpm build`.
- `Deploy Cloudflare` is manual-only through GitHub Actions `workflow_dispatch`.
- `Deploy Cloudflare` installs dependencies and runs `pnpm deploy:cloudflare`.
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

Do not put real secret values in workflow files or docs. Use only GitHub Secret names such as `${{ secrets.CLOUDFLARE_API_TOKEN }}`.

## Required Cloudflare Worker Secrets

Configure server-only values in Cloudflare before or immediately after the first production deploy. Use the Cloudflare dashboard or run `wrangler secret put NAME` from a trusted local shell.

Required for authenticated production economy and room routes:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
```

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
pnpm test
pnpm build
pnpm check:cloudflare
pnpm production:check
```

`pnpm production:check` verifies release automation files, gitignored local secrets, Worker observability/Durable Object config, static security headers, the 350 KB entry bundle budget, and CI/deploy workflow guardrails. It is a guardrail, not a replacement for real multiplayer QA.

## Release Runbook

1. Confirm CI and CodeQL are green on the commit that will be deployed.
2. Confirm required GitHub Secrets exist in the repository or `production` environment.
3. Confirm required Cloudflare Worker secrets exist for the deployed Worker.
4. Run the manual `Deploy Cloudflare` workflow from GitHub Actions.
5. Open the Cloudflare custom domain and `/health`.
6. Launch the Discord Activity from a test server and confirm the Activity opens the production host.

