# Remaining Phases Parallel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining Mahjong Party prototype phases in parallel-safe slices: real match rules, scoring, bot clarity, sync-ready room events, and UI integration.

**Architecture:** Keep `game-core` as the source of truth for rules, scoring, deterministic bot turns, and replayable events. Keep `apps/web` as an adapter layer that renders `MatchView` and dispatches `MatchIntent`; avoid putting Mahjong rules into React components.

**Tech Stack:** TypeScript, Vitest, React/Vite, Playwright runtime verifier.

---

### Parallel Tracks

**Track A: Rules and Scoring**
- Files: `game-core/src/scoring.ts`, `game-core/src/scoring.test.ts`, `game-core/src/index.ts`
- Output: tested `evaluateWinningHand` and `scoreOldHongKongFan` helpers.
- Parallel safety: independent module, no React changes.

**Track B: Sync-Ready Action Log**
- Files: `game-core/src/action-log.ts`, `game-core/src/action-log.test.ts`, `game-core/src/index.ts`
- Output: serializable event append/replay helpers for future multiplayer.
- Parallel safety: independent module, no current match engine mutation.

**Track C: Real Match State Machine**
- Files: `game-core/src/match-engine.ts`, `game-core/src/match-engine.test.ts`, later `apps/web/src/App.tsx`
- Output: draw, discard, claim window, claim priority, kong draw, win result flow.
- Parallel safety: starts isolated, integrates after Tracks A/B compile.

**Track D: Bot Clarity and UX**
- Files: `game-core/src/practice-engine.ts`, `apps/web/src/screens/InMatch.tsx`, `apps/web/src/styles.css`, `scripts/verify-prototype.mjs`
- Output: slow, readable bot turns and tutorial without timer pressure.
- Parallel safety: already in progress; does not depend on scoring internals.

**Track E: Room/Network Boundary**
- Files: `server/src/*`, `packages/shared-types/src/index.ts`, future web adapter files
- Output: typed room session contracts and in-memory prototype service.
- Parallel safety: begins after Track B event contracts stabilize.

### Execution Checklist

- [x] **Step 1: Land bot clarity/timerless tutorial**
  - Run: `pnpm -r test`
  - Run: `pnpm -r build`
  - Run: `node .\scripts\verify-prototype.mjs`
  - Expected: tutorial timer hidden, tutorial why-copy visible, bot feed shows Bo/Chen/Dewi steps.

- [x] **Step 2: Integrate Track A scoring**
  - Review worker output in `game-core/src/scoring.ts`.
  - Run: `pnpm --filter @mahjong/game-core test`.
  - Expected: scoring tests cover standard hand, seven pairs, all pungs, dragon pung, self draw.

- [x] **Step 3: Integrate Track B event log**
  - Review worker output in `game-core/src/action-log.ts`.
  - Run: `pnpm --filter @mahjong/game-core test`.
  - Expected: event append/replay tests cover monotonic sequence and duplicate/out-of-order rejection.

- [x] **Step 4: Build match-engine shell**
  - Create failing tests in `game-core/src/match-engine.test.ts`:
    - player draw/discard advances turn
    - bot discard creates claim window
    - claim priority chooses win before kong/pong/chi
    - winning hand creates result candidate
  - Implement `game-core/src/match-engine.ts` after tests fail.

- [ ] **Step 5: Connect web to match-engine**
  - Replace mock friend-room actions with match-engine adapter while keeping existing `MatchView`.
  - Keep practice/tutorial flows working.
  - Update verifier to exercise friend-room discard/claim/win separately from tutorial.

- [x] **Step 6: Add in-memory room service**
  - Define room event contracts after Track B.
  - Add focused server tests for create room, join seat, submit action, replay state.
  - Do not add real external networking until local replay is stable.

- [x] **Step 7: Full verification**
  - Run: `pnpm -r test`
  - Run: `pnpm -r build`
  - Run: `node .\scripts\verify-prototype.mjs`
  - Expected: all prototype flows pass with no framework overlay or runtime assertion failure.
