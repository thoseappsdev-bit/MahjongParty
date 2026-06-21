# No-Supabase Multiplayer Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the next Mahjong Party foundation without Supabase: better LAN room lifecycle, reconnect/rematch support, structured audit logs, and scoring hooks for richer Old Hong Kong policy.

**Architecture:** Keep the current Node LAN server authoritative and in-memory. Add structured room actions/events to snapshots and client APIs so the same interfaces can later be backed by SQLite/Postgres/Supabase without changing the web app.

**Tech Stack:** TypeScript, Node HTTP server, React/Vite web app, Vitest, Playwright verifiers.

---

### Task 1: LAN Room Lifecycle

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `server/src/lan-table-service.ts`
- Modify: `server/src/lan-table-service.test.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/index.test.ts`
- Modify: `apps/web/src/lan/lanClient.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/screens/WaitingRoom.tsx`

Steps:
- [x] Add failing tests for leave room, host transfer, rematch reset, and reconnect via existing room snapshot.
- [x] Implement service methods `leaveRoom`, `rematch`, and host transfer to the lowest occupied human seat.
- [x] Add HTTP endpoints `POST /api/rooms/:code/leave` and `POST /api/rooms/:code/rematch`.
- [x] Add client API wrappers and UI buttons.
- [x] Persist LAN session in `localStorage` and restore it on app load if the room still exists.

### Task 2: Structured Audit Log

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `server/src/lan-table-service.ts`
- Modify: `server/src/lan-table-service.test.ts`

Steps:
- [x] Add failing tests that room snapshots include audit entries for create, join, start, action, leave, rematch.
- [x] Add `LanAuditEntry` to shared types and `auditLog` to `LanRoomSnapshot`.
- [x] Append audit entries in service transitions using `{ id, at, type, actorUserId, seat, message }`.
- [x] Clone audit logs so snapshots are immutable.

### Task 3: Old Hong Kong Scoring Hooks

**Files:**
- Modify: `game-core/src/scoring.ts`
- Modify: `game-core/src/scoring.test.ts`
- Modify: `packages/i18n/src/index.ts`

Steps:
- [x] Add failing tests for flowers/seasons fan, seat/round wind pung, and robbing a kong.
- [x] Extend `OldHongKongScoreInput` with `flowerCount`, `seasonCount`, `seatWind`, `roundWind`, `winContext`.
- [x] Add fan lines without changing existing scoring behavior for current callers.
- [x] Add i18n names for new fan line ids.

### Task 4: Renderer Boundary

**Files:**
- Create: `apps/web/src/screens/MatchBoard.tsx`
- Modify: `apps/web/src/screens/InMatch.tsx`

Steps:
- [x] Extract the table/tiles/player rails into a `MatchBoard` component with the same props currently used in `InMatch`.
- [x] Keep React/CSS rendering for now, but isolate the surface so Pixi/canvas can replace it later without touching match controls.
- [ ] Verify prototype and mobile layout still pass.

### Task 5: Local Prototype Persistence

**Files:**
- Create: `apps/web/src/walletStorage.ts`
- Create: `apps/web/src/walletStorage.test.ts`
- Create: `apps/web/src/localeStorage.ts`
- Create: `apps/web/src/localeStorage.test.ts`
- Modify: `apps/web/src/App.tsx`

Steps:
- [x] Add real placeholder `.env` files for Discord Activity setup.
- [x] Persist wallet changes to `localStorage` so paid entries, shop buys, and rewards survive reloads.
- [x] Deduct coin buy-in when creating a paid friend room, not only when joining a public paid table.
- [x] Persist selected locale to `localStorage`.

---

Self-review:
- Covers no-Supabase multiplayer lifecycle, audit/replay foundation, scoring hooks, and renderer boundary.
- Does not claim full production Old Hong Kong rules yet; it adds the policy hooks needed to expand safely.
- Keeps database/persistence swappable for later.
