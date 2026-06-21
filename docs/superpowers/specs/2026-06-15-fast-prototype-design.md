# Mahjong Party Fast Prototype Design

## Purpose

Build a fast, polished, clickable Mahjong Party prototype that makes the product direction tangible before the full authoritative engine, Colyseus server, and Supabase economy are implemented. The prototype should follow the product-design PDF and engineering docs closely enough that its screens, types, and interaction shape can survive into the real implementation.

## Scope

This prototype starts from the official engineering path by creating the P0 monorepo scaffold, then builds a mock-driven web client in `apps/web`.

Included:

- P0-style pnpm/Turbo TypeScript workspace with `game-core`, `packages/shared-types`, `packages/ui`, `packages/i18n`, `apps/web`, `server`, and `supabase`.
- A Vite React app that runs locally and shows the core product loop.
- Shared UI tokens matching the contract palette: dark emerald, jade, gold, wood, lantern, ink, cream, and danger.
- Mock stores and mock transport data shaped like the final contracts.
- Clickable screens for lobby, table creation, waiting room, match, result, shop, daily rewards, and settings.
- A programmatic Mahjong table presentation with readable tiles and action controls.

Not included:

- Real Mahjong rules validation.
- Real Colyseus multiplayer.
- Real Supabase authentication, wallet mutation, or ledger writes.
- Real purchases, rewarded ads, Telegram Stars, Discord auth, or Capacitor native builds.
- Ranked, season pass, clubs, Riichi, Garuda mode, desktop wrappers, or live operations tooling.

## Architecture

The prototype uses the documented monorepo layout:

```text
game-core/
packages/shared-types/
packages/ui/
packages/i18n/
apps/web/
server/
supabase/
```

`packages/shared-types` defines the contract-shaped types for seats, room lobby state, wallet, catalog, table setup, match view, and result data. These do not need the complete final contract yet, but names and shapes should stay close to `docs/CONTRACTS.md`.

`packages/ui` exposes `tokens`, theme CSS, and reusable React components used by the web app. Components should stay simple and local to the prototype, but visually consistent with the final design direction.

`apps/web` owns routing, mock state, screens, and the prototype table. It should not call real network services. Screen code should consume mock clients through interfaces named like the future real clients, such as `mockGameRoom` and `mockEconomy`.

`game-core` and `server` can remain compile-ready stubs during the prototype.

## User Flow

The default local route opens directly to the Home Lobby. The prototype supports this flow:

1. Home Lobby shows profile, Coins, Gems, Daily, Play, Practice, Shop, and Settings.
2. Play opens the Play Tables hub with Friendly and Coin Table cards.
3. Create Table lets the user choose Old Hong Kong 1 Fan or 3 Fan, friendly or coin table, privacy, timer, and max players.
4. Waiting Room shows room code, share link, seats, bot fill, and Start.
5. Start opens In Match with a four-seat table, readable tiles, discards, timer, emotes, and Chi/Pong/Kong/Win/Discard controls.
6. Prototype actions advance a canned hand state and then show Result.
7. Result shows winner, fan breakdown, coin deltas, rematch, and the policy copy "Virtual coins have no cash value."
8. Shop and Daily Rewards use mock catalog data and update the displayed wallet only from mock economy responses.

## Visual Design

The product should feel premium, warm, social, and readable. The first screen is the app itself, not a marketing landing page.

Design rules:

- Use dark emerald as the app backdrop, with jade surfaces, gold accents, wood details, and lantern warmth.
- Keep Mahjong tiles high contrast and readable around 34 px or larger.
- Avoid casino framing, slot-machine imagery, jackpot language, or gambling terms.
- Top bar shows only Coins and Gems.
- Use compact operational layouts rather than oversized marketing sections.
- Prefer familiar icons for buttons and controls where available.
- Keep cards to individual functional objects such as table options, rewards, and shop items.

## Data Flow

The prototype uses mock data but follows server-authoritative discipline:

- UI actions never directly calculate legal Mahjong results.
- Match actions call mock game-room methods, which return the next canned view.
- Wallet changes call mock economy methods, which return a replacement wallet.
- Screens replace wallet state from mock responses and do not mutate balances locally.
- In-match buttons enable from the mock `legalActions` array.

## Error Handling

The prototype should include visible states for:

- Invalid or unavailable action: disabled control and a brief toast.
- Mock purchase without enough Gems: non-blocking error toast.
- Share link copied: success toast.
- Loading transitions between screens, even if mocked.

The server and economy stubs should compile but may return simple "not implemented" responses.

## Testing And Verification

Minimum verification for the prototype:

- `pnpm install` completes.
- `pnpm -r build` passes.
- `pnpm -r test` passes for stub packages or smoke tests.
- `pnpm --filter @mahjong/web dev` serves the app.
- Browser verification covers lobby -> create table -> waiting room -> match -> result.
- Visual check confirms tiles, buttons, and text do not overlap on desktop and a mobile-sized viewport.

## Implementation Order

1. Scaffold the pnpm/Turbo monorepo and compile-ready packages.
2. Add shared types, tokens, theme CSS, and minimal UI primitives.
3. Build the web app shell, routing, mock stores, and mock data clients.
4. Implement the core screens and clickable prototype flow.
5. Polish visual layout and responsive behavior.
6. Run build/tests and browser smoke verification.

## Open Decisions

- Use the prototype as the first product slice, while keeping names and structure compatible with the P0 and P8 docs.
- Defer full game-core, real server authority, Supabase economy, platform adapters, and purchases until after the prototype is usable.
- Initialize Git only if the project owner wants this docs-only folder converted into a repository.
