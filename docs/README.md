# Mahjong Party — Engineering Docs (Milestone 1: Foundation + Economy)

This folder is the build manual for **Milestone 1**. It is split into small, self-contained
**phase docs** so multiple programmers can work in **parallel**. Read this file first, then
read `CONTRACTS.md` and `CONVENTIONS.md`, then pick up a phase from `phases/`.

Platform-specific notes:
- [Discord Activity Readiness](./discord-activity.md)

> Product spec (source of truth for game/economy design):
> `C:\mahjong party\Mahjong_Party_Full_Product_Design_v1_1 (1).pdf`
> Approved build plan: `C:\Users\Lukma\.claude\plans\c-mahjong-party-...optimized-bubble.md`

---

## What we're building

A web-first, **server-authoritative** *Old Hong Kong mahjong* social game from **one codebase**,
shipping to **web (PWA), Telegram Mini App, Discord Activity, and mobile (iOS/Android via Capacitor)**.

**Milestone 1 = Foundation + Economy:** a real, playable, server-authoritative mahjong table with
bot fill and the friend-room/share loop, **plus** Supabase accounts, the Gems/Coins closed-loop
economy ledger, coin tables, shop, and daily rewards. Languages: **English / Mandarin / Indonesian**.

### The one rule that governs everything
**The client never validates tiles, wins, or coin settlement.** The Colyseus server is authoritative
for all game logic and all economy mutations. The client predicts and animates; the server decides.
If you are ever tempted to compute a win or change a balance on the client, stop — that belongs on the server.

---

## Tech stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (strict) |
| Rules engine | Pure TypeScript (`game-core/`, zero framework imports) |
| Realtime server | Colyseus (Node) |
| Client build | Vite |
| Client UI | React + Radix + CVA |
| Board/VFX | PixiJS (canvas) |
| Client state | Zustand |
| Backend | Supabase (Postgres + Auth + RLS) |
| i18n | i18next + react-i18next |
| Mobile | Capacitor (wraps the web build) |
| Tests | Vitest |

> **RULE #1 — check latest versions before writing any config.** Run `npm view <pkg> version` for
> every package and use current stable. Do NOT copy version numbers from these docs (they may be stale).
> Verify React 19 peer-dep support for every UI lib before installing.

---

## Monorepo layout

```
mahjong-party/
  game-core/            PURE TypeScript rules engine. ZERO framework imports.
  packages/
    shared-types/       Types shared client <-> server (protocol, economy, account)
    ui/                 React component kit (Radix + CVA) + design tokens
    i18n/               i18next config + en/zh/id locale JSON
  apps/
    web/                Vite + React + PixiJS. THE client (web/Telegram/Discord/Capacitor).
  server/               Colyseus authoritative game server + economy endpoints
  supabase/             SQL migrations (accounts, economy ledger, inventory, history)
  docs/                 <-- you are here
```

`game-core/` is imported by both `server/` (authoritative) and `apps/web/` (prediction/replay),
so it must stay pure and deterministic.

---

## Phase map & dependency graph

Each phase is one doc in `phases/`. **P0 + the two contract docs must land first**; after that,
the lettered tracks run in parallel. Within `game-core`, P1 → (P2, P3) → P4 → P5.

```
        ┌─────────────────────────────────────────────┐
        │ P0  Monorepo scaffold        (blocks all)     │
        │ CONTRACTS.md + CONVENTIONS.md (agree first)   │
        └───────────────────────┬─────────────────────-┘
                                 │
   ┌──────────────┬─────────────┼──────────────┬───────────────┬──────────────┐
   │ GAME-CORE    │ SERVER       │ CLIENT        │ ECONOMY       │ CROSS-CUTTING│
   │ (Team A)     │ (Team B)     │ (Team C/D)    │ (Team E)      │ (Team F)     │
   │              │              │               │               │              │
   │ P1 tiles/    │ P6 Colyseus  │ P7 Pixi board │ P10 Supabase  │ P9 design    │
   │   wall/rng   │   GameRoom   │ P8 React      │   + economy   │   system/UI  │
   │ P2 win-det   │  (vs stub →  │   screens     │   endpoints   │ P11 i18n     │
   │ P3 scoring   │   real core) │  (vs mock →   │  (vs server   │ P12 platform │
   │ P4 state/    │              │   real net)   │   stubs)      │   shells     │
   │   actions/   │              │               │               │              │
   │   claims     │              │               │               │              │
   │ P5 bot/sim   │              │               │               │              │
   └──────────────┴──────────────┴───────────────┴───────────────┴──────────────┘
```

**How parallelism works:** every boundary is a typed contract in `CONTRACTS.md`. Teams code against
the interface, not the implementation. The server can run against a stub `game-core`; the client can
run against a mock Colyseus room and mock economy responses; economy SQL is independent. Integration
happens when each side's real implementation lands — the types don't change.

| Phase | Title | Depends on | Parallel-safe with |
|---|---|---|---|
| P0 | Monorepo scaffold | — | — (do first) |
| P1 | game-core: tiles, wall, rng | P0, CONTRACTS | everything |
| P2 | game-core: win-detection | P1 | P3 |
| P3 | game-core: scoring | P1 | P2 |
| P4 | game-core: state/actions/claims | P1,P2,P3 | P6,P7,P8,P9,P10,P11 |
| P5 | game-core: bot + simulate | P4 | P6,P7,P8,... |
| P6 | Colyseus server | P0, CONTRACTS (real game-core later) | C/D/E/F tracks |
| P7 | PixiJS board renderer | P0, CONTRACTS, P9 tokens | P8, server, economy |
| P8 | React screens | P0, CONTRACTS, P9 | P7, server, economy |
| P9 | Design system + UI kit | P0 | everything |
| P10 | Economy + Supabase | P0, CONTRACTS | everything |
| P11 | i18n (en/zh/id) | P0 | everything |
| P12 | Platform shells | P0 (apps/web boots) | everything |

---

## Definition of Done for Milestone 1

- [ ] `pnpm -r build` and `pnpm -r test` pass.
- [ ] `game-core` unit tests green; `simulateHand` runs full bot matches; tile-conservation invariant holds.
- [ ] A human + 3 bots play a friendly Old HK hand in the browser through Chi/Pong/Kong/Win to a scored result.
- [ ] Two browsers join the same friend room via share link and play.
- [ ] A coin-table hand debits buy-in and writes settlement to `economy_ledger` (`sum===0`, no negative balances).
- [ ] Shop buys a Gem→Coin pack (one-way) + a cosmetic; daily reward + spin work with odds shown.
- [ ] Locale switch en/zh/id shows no raw keys.
- [ ] PWA installs; Telegram/Discord/Capacitor adapters initialize without errors.

See `CONTRACTS.md` next.
