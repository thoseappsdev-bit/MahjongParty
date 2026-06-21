# P6 — Colyseus Authoritative Server

**Track:** Server (Team B) · **Depends on:** P0, CONTRACTS (real game-core P4/P5 integrated later) · **Size:** L

## Goal
The authoritative realtime server: rooms that hold the full `MatchState`, validate every client intent,
run turn/claim timers, fill seats with bots, broadcast per-seat `ClientView`, and (later) write economy
settlement. Build against a **stubbed game-core** first; swap to the real package with no signature changes.

## Deliverables
```
server/src/index.ts                 # boot, transport, matchMaker, express side-routes
server/src/rooms/GameRoom.ts        # the match room
server/src/rooms/state.ts           # Colyseus schema (lobby/seat sync only — see note)
server/src/auth.ts                  # verify Supabase JWT / platform token from CreateRoom/Join options
server/src/timers.ts                # server-clock turn + claim timers
server/src/bots.ts                  # drive empty/disconnected seats via botDecide
server/src/economyClient.ts         # service-role calls to economy endpoints (P10) — used on settle
server/src/config/tables.json       # tier buy-in/baseUnit/timer/ruleset/fanMin (server-only)
server/test/gameroom.test.ts        # integration: 4-bot match + illegal-action rejection
```

## Detailed spec
- **Transport/versions:** check latest `colyseus`/`@colyseus/core`/`@colyseus/schema` (RULE #1).
- **GameRoom**
  - `onCreate(options: CreateRoomOptions)`: load tier config from `tables.json`, init lobby, generate 6-char room code.
  - `onJoin(client, options: JoinRoomOptions)`: `verifyAuth(options.authToken)` → seat the player; reject if invalid.
  - Lobby phase: handle `sit`, `addBot`, `startMatch` (host only). On start → `createInitialMatchState(seed, settings, seats)`.
  - **State authority:** keep the full `MatchState` in plain memory (NOT in Colyseus schema). On each `intent`:
    `legalActions` check → `resolveAction` → for every connected client send `{t:'view', view: redactForSeat(state, seat)}`.
    Use Colyseus schema only for the lobby/seat list (`RoomLobbyState`) which everyone may see.
  - **Timers:** `turnTimeoutMs`/`claimTimeoutMs` from settings; on expiry push a `timeout`/`pass` action through the reducer.
  - **Bots:** any seat that is a bot or disconnected has its turns/claims driven by `botDecide` on a short delay.
  - **Reconnect:** `allowReconnection`; on AFK/timeout repeatedly → convert seat to bot (`bots.ts`).
  - **Settlement:** on `result`, if `tableType==='coin'`, call `economyClient.settle(matchId, perSeatDelta)` (P10);
    write `match_history`. Friendly tables skip economy.
  - **Rematch:** `rematch` resets to a new hand keeping seats.
- **Auth (`auth.ts`):** verify Supabase JWT; for Telegram/Discord, accept their initData/token, exchange for a
  Supabase session server-side, return the userId. No seat without a verified identity.
- **Stub-first:** until P4/P5 land, back the `game-core` import with `server/src/_coreStub.ts` returning canned
  `MatchState`/`ClientView` so room/timer/seat/broadcast logic is fully built and tested. Delete the stub on integration.

## Contracts
- **Consumes:** `CreateRoomOptions, JoinRoomOptions, ClientMessage, ServerMessage, RoomLobbyState` (CONTRACTS §2),
  the full game-core API (§1), economy `settle` (§3).
- **Exposes:** the Colyseus endpoint the client's `useGameRoom` connects to; the room message protocol.

## Acceptance criteria
- [ ] A 4-bot match runs to completion through a real room (and headless) with no errors.
- [ ] Every `intent` is validated against `legalActions`; a tampered/illegal intent leaves state unchanged and
      returns `{t:'error'}` — the client cannot desync the authoritative state.
- [ ] Clients only ever receive their own `ClientView` (no concealed/wall/seed leakage — assert in test).
- [ ] Turn + claim timers fire on the server clock; AFK seat converts to bot and the match continues.
- [ ] Join without a valid `authToken` is rejected.
- [ ] Coin-table completion calls `economyClient.settle` with deltas summing to 0 (mock economy in test).
- [ ] Swapping `_coreStub` for the real `game-core` requires no changes outside the import line.
