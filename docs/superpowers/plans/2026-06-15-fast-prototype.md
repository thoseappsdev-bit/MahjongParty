# Mahjong Party Fast Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a P0-style monorepo and a polished mock-driven Mahjong Party web prototype.

**Architecture:** Create compile-ready package boundaries first, then build the prototype in `apps/web` against shared contract-shaped types and UI tokens. The app uses local mock clients for room flow and economy so later Colyseus/Supabase work can replace the mocks without rewriting screens.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript strict, Vite, React, Vitest, CSS modules/plain CSS, lucide-react.

---

## File Structure

- Create root workspace files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.nvmrc`.
- Create `game-core/` as a pure TypeScript stub package.
- Create `packages/shared-types/` for prototype contracts.
- Create `packages/ui/` for tokens, theme CSS, and small shared UI components.
- Create `packages/i18n/` for locale dictionaries and a simple translation helper.
- Create `server/` as a compile-ready stub.
- Create `supabase/.gitkeep`.
- Create `apps/web/` as the Vite React prototype.

## Tasks

### Task 1: Scaffold Workspace

**Files:**
- Create: root workspace config files.
- Create: package directories and package manifests.

- [ ] **Step 1: Add workspace config**

Create the root package and TypeScript/Turbo configs with workspace scripts: `build`, `test`, `dev`, and `lint`.

- [ ] **Step 2: Add package manifests**

Create minimal `package.json` files for `game-core`, `packages/shared-types`, `packages/ui`, `packages/i18n`, `server`, and `apps/web`.

- [ ] **Step 3: Add TypeScript configs**

Each package extends `tsconfig.base.json` and emits type/code output to `dist`.

### Task 2: Add Shared Types And Stubs

**Files:**
- Create: `packages/shared-types/src/index.ts`
- Create: `game-core/src/index.ts`
- Create: `server/src/index.ts`

- [ ] **Step 1: Define prototype contracts**

Define `Seat`, `Wallet`, `Profile`, `TableConfig`, `RoomLobbyState`, `MatchView`, `LegalAction`, `MatchResult`, `CatalogItem`, and `DailyReward`.

- [ ] **Step 2: Add pure game-core stubs**

Export `createPrototypeMatch()` and `advancePrototypeMatch()` as deterministic placeholder functions with no framework imports.

- [ ] **Step 3: Add server stub**

Export a small `startServer()` function and allow `tsx src/index.ts` to log that the prototype server stub is ready.

### Task 3: Add UI And I18n Packages

**Files:**
- Create: `packages/ui/src/tokens.ts`
- Create: `packages/ui/src/theme.css`
- Create: `packages/ui/src/components.tsx`
- Create: `packages/ui/src/index.ts`
- Create: `packages/i18n/src/index.ts`

- [ ] **Step 1: Implement tokens**

Use the contract palette and expose both TypeScript tokens and CSS custom properties.

- [ ] **Step 2: Implement UI primitives**

Add `Button`, `Panel`, `CurrencyPill`, `TableCard`, `RewardChip`, and `Toast`.

- [ ] **Step 3: Implement locale helper**

Add English, Mandarin, and Indonesian dictionaries for the prototype screens and fan names.

### Task 4: Build Web App Shell

**Files:**
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`

- [ ] **Step 1: Add Vite entrypoint**

Wire React into `#root` and import shared theme CSS.

- [ ] **Step 2: Add app-level state**

Use React state for route, wallet, lobby, table config, match view, and toast messages.

- [ ] **Step 3: Add responsive shell**

Create a dense app layout with top bar, content area, and bottom navigation suitable for desktop and mobile.

### Task 5: Add Mock Clients And Data

**Files:**
- Create: `apps/web/src/mock/mockData.ts`
- Create: `apps/web/src/mock/mockGameRoom.ts`
- Create: `apps/web/src/mock/mockEconomy.ts`

- [ ] **Step 1: Add mock data**

Provide profile, wallet, public tables, table config defaults, match views, result, catalog, and daily rewards.

- [ ] **Step 2: Add mock game room**

Expose functions for creating a table, starting a match, advancing a canned turn, and rematching.

- [ ] **Step 3: Add mock economy**

Expose functions for claiming daily rewards and buying catalog items, returning a replacement wallet.

### Task 6: Build Prototype Screens

**Files:**
- Create: `apps/web/src/screens/HomeLobby.tsx`
- Create: `apps/web/src/screens/PlayTablesHub.tsx`
- Create: `apps/web/src/screens/CreateTable.tsx`
- Create: `apps/web/src/screens/WaitingRoom.tsx`
- Create: `apps/web/src/screens/InMatch.tsx`
- Create: `apps/web/src/screens/Result.tsx`
- Create: `apps/web/src/screens/Shop.tsx`
- Create: `apps/web/src/screens/DailyRewards.tsx`
- Create: `apps/web/src/screens/Settings.tsx`
- Create: `apps/web/src/screens/index.ts`

- [ ] **Step 1: Implement lobby and play hub**

Show profile, currencies, primary actions, table cards, and no ranked entry as active play in the prototype.

- [ ] **Step 2: Implement table creation and waiting room**

Make table settings interactive and use a room code/share flow.

- [ ] **Step 3: Implement match and result**

Render a four-seat table, readable tiles, discard area, legal action buttons, timer, fan result, deltas, and rematch.

- [ ] **Step 4: Implement shop, rewards, and settings**

Use mock economy responses and locale/theme controls.

### Task 7: Verify

**Files:**
- Create or modify package tests where needed.

- [ ] **Step 1: Install dependencies**

Run `pnpm install`.

- [ ] **Step 2: Build and test**

Run `pnpm -r build` and `pnpm -r test`.

- [ ] **Step 3: Start app**

Run `pnpm --filter @mahjong/web dev`.

- [ ] **Step 4: Browser smoke**

Open the local app and verify lobby -> create table -> waiting room -> match -> result on desktop and mobile viewport.

## Self-Review

Spec coverage:

- P0-style scaffold is covered by Tasks 1 and 2.
- Shared tokens and visual rules are covered by Task 3.
- Mock-driven web prototype is covered by Tasks 4 through 6.
- Build and browser verification are covered by Task 7.

Placeholder scan:

- No TBD/TODO/FIXME placeholders are present.

Type consistency:

- Shared prototype types are defined before mock clients and screens consume them.
- Wallet updates flow through mock economy functions.
- Match action availability flows through `MatchView.legalActions`.
