# Real Practice Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fake practice with a local real Mahjong practice engine and tutorial overlay.

**Architecture:** Add a pure `game-core/src/practice-engine.ts` module that owns wall/deal/draw/discard/bot/win state. The web app adapts that practice state into the existing `MatchView` table UI and adds tutorial state around the match screen.

**Tech Stack:** TypeScript strict, Vitest, React state, existing Vite app, Playwright verifier.

---

## File Structure

- Create `game-core/src/practice-engine.ts`: local practice engine.
- Create `game-core/src/practice-engine.test.ts`: deterministic and turn-flow tests.
- Modify `game-core/src/index.ts`: export practice engine.
- Modify `packages/shared-types/src/index.ts`: add practice result/state-facing fields only if needed.
- Modify `apps/web/src/mock/mockGameRoom.ts`: create practice matches from the real engine and adapt them to `MatchView`.
- Modify `apps/web/src/App.tsx`: store practice engine state and route practice actions through it.
- Modify `apps/web/src/screens/InMatch.tsx`: tutorial overlay controls and selected tile flow.
- Modify `apps/web/src/styles.css`: tutorial overlay styling and current-turn clarity.
- Modify `scripts/verify-prototype.mjs`: verify tutorial and real bot cycle.

## Tasks

### Task 1: Practice Engine Tests

**Files:**
- Create: `game-core/src/practice-engine.test.ts`

- [ ] Add tests that prove seeded matches are deterministic, deal 14 tiles to seat 0 and 13 to others, player discard removes the selected tile, bot turns add discards, and basic win detection recognizes seven pairs.

### Task 2: Practice Engine

**Files:**
- Create: `game-core/src/practice-engine.ts`
- Modify: `game-core/src/index.ts`

- [ ] Implement tile kinds, physical wall, seeded shuffle, deal, draw/discard transitions, simple bot discard selection, standard win detection, seven-pairs win detection, and exports.

### Task 3: Web Adapter

**Files:**
- Modify: `apps/web/src/mock/mockGameRoom.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] Replace Practice's canned match with `createPracticeMatch(seed)`.
- [ ] Convert `PracticeMatchState` into the existing `MatchView`.
- [ ] Route player discard and non-discard actions through practice transition functions.
- [ ] Open result when practice reports `complete`.

### Task 4: Tutorial UI

**Files:**
- Modify: `apps/web/src/screens/InMatch.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `packages/i18n/src/index.ts`

- [ ] Add tutorial card overlay with Next, Skip, Restart Tutorial, and five guided steps.
- [ ] Show it by default for Practice.
- [ ] Keep controls usable after skipping or completing tutorial.

### Task 5: Verification

**Files:**
- Modify: `scripts/verify-prototype.mjs`

- [ ] Verify Practice starts with tutorial visible.
- [ ] Verify Skip Tutorial works.
- [ ] Verify a selected tile discard changes the hand.
- [ ] Verify bot discards increase and turn returns to player.
- [ ] Run `pnpm -r build`, `pnpm -r test`, and `node .\scripts\verify-prototype.mjs`.

## Self-Review

- Spec coverage: all included scope items are covered by Tasks 1-5.
- Placeholder scan: no TBD/TODO/FIXME language.
- Type consistency: engine state lives in `game-core`; UI consumes an adapter to `MatchView`; tutorial state remains in React.
