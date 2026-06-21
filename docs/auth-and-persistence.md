# Authentication, Authorization & Room Persistence

Covers the production-blocker hardening for the Cloudflare Workers + Durable Object runtime.

## Authentication (server-derived identity)

Identity is no longer taken from a client-supplied `x-user-id` header. The Worker derives the
user id from a **verified Supabase JWT**.

- `server/src/auth.ts` — `verifySupabaseJwt(token, { secret, audience })` verifies an HS256
  Supabase access token with Web Crypto (works in Workers, DO, and Node), checks `exp`/`nbf`/
  `aud`, and returns `userId = claims.sub`. `parseBearer()` reads the `Authorization` header.
- `apps/worker/src/index.ts` — `authenticate(request, env, body)` resolves identity:

  | Condition | Behavior |
  |---|---|
  | `SUPABASE_JWT_SECRET` set | **JWT enforced.** Valid `Authorization: Bearer <token>` required; `x-user-id` is ignored. |
  | No secret, `DEV_AUTH_BYPASS="1"` | **Dev only.** Accepts `x-user-id` / `body.userId`. |
  | Neither | **Fail closed** → `401`. |

  `GET /health` reports the active mode: `authMode: "jwt" | "dev-bypass" | "locked"`.

Every economy mutation route and every room route (create/join/discord/start/rematch/leave/
actions/get) now runs through `authenticate`. The shop **catalog** stays public (static config).

## Authorization (settlement lockdown)

- The public `POST /api/economy/table/settle` route was **removed**. Settlement happens only
  inside the room Durable Object (`settleCoinSnapshotIfNeeded`) after an authoritative hand
  completes — clients can no longer mutate balances directly.
- Coin settlement is idempotent per match (`settledMatches`), now persisted (below) so it
  can't double-settle across DO eviction.

## Atomic database settlement

- `supabase/migrations/20260620164000_atomic_match_settlement.sql` adds
  `service_settle_match`, executable only by `service_role`.
- The RPC validates the complete delta set, rejects duplicate users, enforces zero-sum
  settlement unless the authoritative room explicitly allows a bot/house delta, and takes
  a transaction-scoped advisory lock keyed by `match_id`.
- Wallet mutations and the `match_history` insert happen in the same Postgres transaction.
  Any insufficient balance or invalid participant rolls back every wallet change.
- Repeating the same `match_id` returns current wallets with no new ledger rows. Reusing a
  recorded `match_id` with different deltas is rejected.
- The Supabase REST adapter calls this RPC once; it no longer performs a preflight history
  read followed by separate wallet writes.

Apply the migration before deploying the corresponding Worker build:

```powershell
npx supabase db push
```

If Windows Application Control blocks the Supabase CLI binary, paste the complete migration
file into the Supabase SQL Editor and run it once.


## Coin-table bankroll escrow

Paid coin rooms now reserve the maximum possible Old Hong Kong exposure on the server side, not from a client-supplied amount.

- Reserve amount is derived from room config with `bankrollReserveFor(config)` (`buyIn * 16 fan cap * 3 payers`).
- On paid room create/join/Discord join, the Durable Object debits the authenticated user with `table-buyin` and persists `bankrollReservations` in DO storage.
- If room creation/join fails after the debit, the DO immediately refunds the reservation.
- If a player leaves before settlement, the DO refunds the reserved bankroll with a `table-settle` ledger entry marked `{ reason: "bankroll-refund" }`.
- When the hand completes, settlement releases `reserved bankroll + hand delta` for each reserved human seat. Example: a 96,000 reserve with a 16,000 loss pays back 80,000; a 16,000 win pays back 112,000.
- After the settlement RPC succeeds, the DO clears the released reservations and persists the empty reservation map, so eviction/retry cannot release the same reserve twice.
## Room persistence (survives DO eviction)

- `server/src/lan-table-service.ts` exposes `exportRoom()` / `importRoom()`.
- `MahjongRoomObject` snapshots the authoritative room state + settled-match set to
  `state.storage` after each mutation, and rehydrates them in its constructor via
  `blockConcurrencyWhile`. A re-created DO instance resumes the same room.

## Configuration

**Local dev** (`wrangler dev`): `.dev.vars` sets `DEV_AUTH_BYPASS=1` (gitignored; see
`.dev.vars.example`). The client sends `x-user-id`/`body.userId` as today.

**Production**: set the real secret (never commit it):
```
wrangler secret put SUPABASE_JWT_SECRET   # Supabase Dashboard -> Settings -> API -> JWT Secret
# or, to push all Supabase secrets from .env at once:
pnpm sync:cloudflare-secrets
```
With it set, JWT is enforced and the dev bypass is ignored.

## Client login (Supabase anonymous auth)

The web client authenticates with Supabase so every API call carries a verified bearer token:

- `apps/web/src/auth/supabaseClient.ts` — lazy browser client from `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` (returns `null` when env is unset, e.g. tests).
- `apps/web/src/auth/supabaseAuth.ts` — **pure, tested** `startSupabaseAuth(client, setToken)`:
  reuses an existing session or **signs in anonymously**, wires the token provider to the live
  access token, and refreshes it on `onAuthStateChange`.
- `apps/web/src/auth/initSupabaseAuth.ts` — boots it once and returns the user id (kept separate
  so the pure controller is testable without bundling `@supabase/supabase-js`).
- `App.tsx` calls `initSupabaseAuth()` on mount; the authenticated user id becomes the player
  identity (`authUserId ?? localPlayerId`), so client and server agree on who you are. The token
  flows automatically into REST calls (`authHeaders()`) and the WebSocket (`?token=`).

**Required Supabase setting:** enable **Authentication → Sign In / Providers → Anonymous sign-ins**.
If disabled, sign-in fails, the token stays `null`, and JWT-enforced routes return `401`.

Anonymous users get a real `aud:"authenticated"` token with a stable `sub`, which the Worker
verifies and uses as the user id — so accounts/economy work end-to-end with zero signup friction.
A later email/OAuth upgrade can call `linkIdentity` without changing this wiring.

Tests: `apps/web/src/auth/supabaseAuth.test.ts` (existing session / anon sign-in / sign-in error /
token refresh).

## Tests

- `server/src/auth.test.ts` — JWT verify (valid / wrong-secret / expired / no-sub / alg:none /
  wrong-aud / malformed) + bearer parsing.
- `apps/worker/src/auth-route.test.ts` — catalog public; fail-closed 401; JWT-derived identity;
  `x-user-id` ignored under JWT; forged token rejected; settle route gone (404); health authMode.
- `apps/worker/src/room-do.test.ts` — DO room routes require auth; create persists to storage;
  a fresh DO instance rehydrates the room.

## Realtime (WebSockets, DO hibernation)

HTTP polling is replaced by an authoritative **WebSocket push** channel on the room Durable
Object, using the hibernation API (`acceptWebSocket` / `webSocketMessage` / `webSocketClose` /
`alarm`). The DO broadcasts a redacted per-seat snapshot after **every** mutation (whether it
arrived over the socket or an HTTP route), so all connected clients stay in sync instantly.

- **Connect**: `GET …/api/rooms/{code}/socket` with `Upgrade: websocket`. Browsers can't set
  headers on a socket, so identity arrives via query: `?token=<jwt>` (production) or `?uid=<id>`
  (dev bypass). The user must already be seated (joined via HTTP) or the upgrade is `403`.
- **Reconnect**: a new socket for a user clears their disconnect grace (`markConnected`) and
  immediately receives a fresh snapshot.
- **Duplicate sessions**: opening a second socket closes the older one(s) for that user
  (`getWebSockets(userId)` → `close(1000, "replaced")`) — newest connection wins.
- **Disconnect → bot**: when a user's *last* socket closes, a 30s grace timer is set
  (`storage.setAlarm`). If they don't reconnect, `alarm()` runs `applyDisconnectGrace` →
  `leaveRoom` converts the seat to a bot, transfers the host if needed, and advances the bots so
  the table keeps moving.
- **Host transfer / rematch**: handled by the existing `leaveRoom` / `rematch` service methods,
  now reachable over the socket (`{type:"rematch"}`) and broadcast to everyone.

Pure, fully-tested decision layer: `server/src/disconnect-tracker.ts` (grace map) and
`server/src/room-realtime.ts` (`applyDisconnectGrace`, `parseSocketMessage`). The DO is a thin
hibernation adapter over them. Client: `apps/web/src/lan/roomSocket.ts` (primary receive
channel; HTTP polling remains only as a fallback while the socket is down).

### Realtime tests
- `server/src/disconnect-tracker.test.ts`, `server/src/room-realtime.test.ts` — grace/host-transfer/parsing.
- `apps/worker/src/room-socket.test.ts` — upgrade-requires-join (403), ping/pong, broadcast on
  control message, disconnect schedules the bot alarm, duplicate socket doesn't start grace.
- `apps/web/src/lan/roomSocket.test.ts` — socket URL (token vs dev uid, ws/wss scheme).
