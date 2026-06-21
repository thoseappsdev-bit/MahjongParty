# Deployment Notes

## Recommended low-cost stack

- **Cloudflare Workers Static Assets**: host the React/Vite web app over HTTPS.
- **Cloudflare Durable Objects**: prototype live room authority for `/api/rooms/*`.
- **Supabase**: auth, profiles, wallets, economy ledger, inventory, match history.

This keeps the early bill low while leaving room to scale the realtime game server separately from the permanent database.

## Local commands

```bash
pnpm build
pnpm test
pnpm preview:cloudflare
```

## Deploy command

```bash
pnpm deploy:cloudflare
```

Wrangler deploys `apps/web/dist` and `apps/worker/src/index.ts` using `wrangler.jsonc`.

## Environment variables

Keep secrets in provider dashboards or local `.env`, never in client code.

- `SUPABASE_DATABASE_URL`: backend Postgres connection string for server-side economy writes.
- `SUPABASE_URL`: backend Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: backend only, never exposed to the browser.
- `VITE_SUPABASE_URL`: browser-safe Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: browser-safe publishable key.
- `VITE_DISCORD_CLIENT_ID`: browser-safe Discord Activity client id.
- `DISCORD_CLIENT_SECRET`: backend only.
- `CLOUDFLARE_API_TOKEN`: optional local deploy automation token. Prefer `npx wrangler login` for manual deploys.
- `CLOUDFLARE_ACCOUNT_ID`: optional local deploy automation account id.

## Multiplayer split

Supabase can store rooms, seats, profiles, wallets, ledger rows, rematch history, and reconnect metadata.
Durable Objects own live match state for the Cloudflare prototype: active room routing, action ordering, bot turns, and room snapshots.

The current Durable Object room keeps active game state in memory inside the object. The next multiplayer hardening step is to persist room snapshots into Durable Object storage and then add WebSocket fanout so clients do not poll.
