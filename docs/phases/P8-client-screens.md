# P8 — Client: React Screens, Stores & Networking

**Track:** Client (Team D) · **Depends on:** P0, CONTRACTS, P9 · **Parallel with:** P7, server, economy · **Size:** L

## Goal
The React app shell: all screens from the spec's UI/UX map, Zustand stores, the `useGameRoom` hook
(Colyseus client), routing, and the In-Match HUD that wraps `GameCanvas` (P7). Build against a
**MockGameRoom** + **mockEconomy** first; swap to real transports behind the same interfaces.

## Deliverables
```
apps/web/src/store/{auth,user,game,settings}.ts     # Zustand stores
apps/web/src/net/useGameRoom.ts                       # Colyseus client hook (ClientMessage/ServerMessage)
apps/web/src/net/MockGameRoom.ts                      # canned ServerMessage feed for dev
apps/web/src/net/economyClient.ts + mockEconomy.ts    # economy endpoint client (CONTRACTS §3)
apps/web/src/screens/{HomeLobby,PlayTablesHub,CreateTable,PublicTables,WaitingRoom,InMatch,Result,Shop,DailyRewards,Settings}.tsx
apps/web/src/components/{TopBar,CurrencyPill,ActionBar,Timer,TileTray,FanBreakdown,ShareSheet}.tsx
apps/web/src/router.tsx                               # screen routing
```

## Detailed spec
- **Stores (Zustand):**
  - `auth` (session, userId), `user` (Wallet, Profile, Inventory), `game` (connection status + latest `ClientView`
    + lobby), `settings` (locale, theme, fastMode). Never mutate wallet locally except by replacing with server response.
- **`useGameRoom`:** connect/join via `CreateRoomOptions`/`JoinRoomOptions`; send `ClientMessage`s
  (`intent`,`sit`,`addBot`,`startMatch`,`rematch`,`emote`); on `{t:'view'}` update `game.view`; on `{t:'lobby'}`
  update lobby; on `{t:'event'}` forward to the board's `playEvent`; on `{t:'error'}` toast (i18n key).
- **Screens (spec §21 UI/UX map):**
  - **HomeLobby:** profile, **Coins + Gems only** in the top bar (`CurrencyPill`), entries: Play, Ranked(disabled M1),
    Practice, Shop, Daily, Friends, Settings.
  - **PlayTablesHub → CreateTable → PublicTables → WaitingRoom:** create (mode/type/privacy/timer/maxPlayers/entry
    coins) → room code + **ShareSheet** (Telegram/Discord/web link) → seats + bot fill + host start. Copy must never
    say bet/gamble/casino.
  - **InMatch:** `<GameCanvas/>` + `ActionBar` (Chi/Pong/Kong/Win/Discard, enabled from `view.legalActions`),
    `Timer`, one-tap discard, preselect, fast-mode toggle, emotes/chat.
  - **Result:** winner, `FanBreakdown` (from `result.patterns` nameKeys), coin deltas, **rematch**; show
    "virtual coins, no cash value".
  - **Shop:** Gem packs, Coin packs (priced in **Gems**), cosmetics — from `economyClient.catalog`. **DailyRewards:**
    login/ads/missions/spin with odds shown. **Settings:** locale switch (en/zh/id), fast mode, theme.
- **Build-before-backend:** wire screens to `MockGameRoom` + `mockEconomy`. Swapping to real `useGameRoom`/
  `economyClient` must not touch screen code (same hook/return shapes).
- **i18n:** every string via `t()` keys (P11). No literals in JSX.

## Contracts
- **Consumes:** all CONTRACTS (§1 ClientView, §2 protocol, §3 economy, §4 account, §5 tokens), `GameCanvas` (P7),
  UI kit (P9), i18n (P11).
- **Exposes:** the running app; the `useGameRoom`/`economyClient` interfaces the platform shells (P12) reuse.

## Acceptance criteria
- [ ] All listed screens render and route; top bar shows only Coins + Gems.
- [ ] Against MockGameRoom: create table → waiting room → start → In-Match HUD drives a hand to the Result screen → rematch.
- [ ] `ActionBar` buttons enable strictly from `view.legalActions`; tapping sends the right `intent`.
- [ ] ShareSheet produces a working room-code/link join in a second browser tab (with real server).
- [ ] Shop/Daily render from catalog; purchasing calls the economy client and updates the wallet from the response only.
- [ ] No hardcoded user-facing strings (lint/grep check); locale switch re-renders all screens.
- [ ] Swapping mocks for real transports changes only `net/` wiring, not screens.
