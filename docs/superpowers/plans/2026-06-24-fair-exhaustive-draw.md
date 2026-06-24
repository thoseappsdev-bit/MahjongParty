# Fair Exhaustive Draw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw concealed-tile-count winners with a meld-aware shanten progress tiebreak for friendly and practice games while keeping coin-table draws neutral.

**Architecture:** `game-core` owns a pure hand-progress evaluator shared by practice and server adapters. Result adapters select a unique lowest-shanten leader; ties and all coin-table exhaustions remain zero-settlement draws.

**Tech Stack:** TypeScript 6, Vitest, existing Mahjong tile codes and deterministic engine.

## Global Constraints

- Do not change Old Hong Kong win scoring or coin settlement.
- Ignore flowers and seasons because the engine already removes them from hands.
- Open melds count toward the four required groups.
- Seven pairs and thirteen orphans apply only to closed hands.
- Follow test-first red-green-refactor and commit each task separately.

---

### Task 1: Shared Hand Progress Evaluator

**Files:**
- Create: `game-core/src/hand-progress.ts`
- Create: `game-core/src/hand-progress.test.ts`
- Modify: `game-core/src/index.ts`

**Interfaces:**
- Produces: `HandProgressKind = "standard" | "seven-pairs" | "thirteen-orphans"`
- Produces: `HandProgress { shanten: number; kind: HandProgressKind }`
- Produces: `evaluateHandProgress(hand: readonly string[], melds?: readonly string[]): HandProgress`

- [ ] **Step 1: Write failing representative tests**

```ts
expect(evaluateHandProgress(["m1","m2","m3","m4","m5","m6","p2","p3","p4","s7","s8","we","we"])).toEqual({
  shanten: 0,
  kind: "standard",
});
expect(evaluateHandProgress(["m1","m1","m2","m2","p3","p3","p4","p4","s5","s5","we","we","dr"])).toEqual({
  shanten: 0,
  kind: "seven-pairs",
});
expect(evaluateHandProgress(["m1","m9","p1","p9","s1","s9","we","ws","ww","wn","dr","dg","dw"])).toEqual({
  shanten: 0,
  kind: "thirteen-orphans",
});
expect(evaluateHandProgress(["p2","p3","p4","s5","s6","s7","we","we","dr","dr"], ["CHOW m1 m2 m3"])).toMatchObject({
  shanten: 0,
});
```

Add rejection tests for bonus tiles, invalid codes, and more than four copies.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/hand-progress.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement tile indexing and decomposition search**

Use a 34-entry count vector. Standard shanten recursively tries triplets, sequences, pairs, and incomplete groups and minimizes:

```ts
const effectiveGroups = openMeldCount + completeGroups;
const cappedIncomplete = Math.min(incompleteGroups, 4 - effectiveGroups);
const shanten = 8 - effectiveGroups * 2 - cappedIncomplete - (hasPair ? 1 : 0);
```

Seven-pairs shanten is `6 - pairKinds + Math.max(0, 7 - uniqueKinds)`. Thirteen-orphans shanten is `13 - uniqueRequired - (hasRequiredPair ? 1 : 0)`. Return the minimum with deterministic priority `standard`, `seven-pairs`, `thirteen-orphans` on ties.

- [ ] **Step 4: Verify focused tests and exports**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/hand-progress.test.ts && pnpm --filter @mahjong/game-core build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game-core/src/hand-progress.ts game-core/src/hand-progress.test.ts game-core/src/index.ts
git commit -m "feat: evaluate Mahjong hand progress"
```

### Task 2: Replace Friendly and Practice Tile-Count Tiebreaks

**Files:**
- Modify: `server/src/lan-table-service.ts:436-456`
- Modify: `server/src/lan-table-service.test.ts`
- Modify: `apps/web/src/mock/practiceResult.ts`
- Modify: `apps/web/src/mock/practiceResult.test.ts`
- Modify: `apps/web/src/mock/matchEngineAdapter.ts`
- Modify: `apps/web/src/mock/matchEngineAdapter.test.ts`
- Modify: `packages/i18n/src/index.ts`

**Interfaces:**
- Consumes: `evaluateHandProgress(hand, melds)`
- Preserves: `MatchResult`

- [ ] **Step 1: Write failing adapter tests**

Create exhausted states where one player has fewer concealed tiles due only to two open melds but is two shanten away, while another closed player is tenpai. Assert the tenpai player receives `progress-tiebreak`. Assert equal best shanten produces `wall-draw`. Preserve the existing coin-table zero-delta test.

```ts
expect(matchResultFor(exhausted, friendlyConfig)).toMatchObject({
  winnerSeat: 1,
  fanLines: [{ id: "progress-tiebreak", nameKey: "fan.progressTiebreak", fan: 0 }],
  deltas: [-1000, 3000, -1000, -1000],
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @mahjong/server exec vitest run src/lan-table-service.test.ts`

Run: `pnpm --filter @mahjong/web exec vitest run src/mock/practiceResult.test.ts src/mock/matchEngineAdapter.test.ts`

Expected: current raw-count winner assertions fail.

- [ ] **Step 3: Implement a shared leader selection pattern**

Each adapter maps players through `evaluateHandProgress(player.hand, player.melds)`, finds the minimum shanten, and awards only a unique leader. Update copy to `Casual progress tiebreak: closest valid hand when the wall was exhausted.` Add equivalent English, Chinese, and Indonesian result text keys.

- [ ] **Step 4: Verify all affected packages**

Run: `pnpm --filter @mahjong/game-core test && pnpm --filter @mahjong/server test && pnpm --filter @mahjong/web test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src apps/web/src/mock packages/i18n/src
git commit -m "fix: settle friendly draws by hand progress"
```

### Task 3: Invariant and Production Gates

**Files:**
- Modify only if tests expose a defect.

**Interfaces:**
- Consumes completed progress evaluator and adapters.

- [ ] **Step 1: Add invariant cases**

For a table of closed, one-open-meld, and two-open-meld hands, assert returned shanten is stable under tile ordering and never changes because of meld display ordering.

- [ ] **Step 2: Run all gates**

Run: `pnpm test && pnpm build && pnpm production:check && pnpm check:cloudflare`

Expected: all commands exit 0.

- [ ] **Step 3: Deploy, smoke, and push**

Run: `pnpm deploy:cloudflare`

Run: `pnpm production:smoke -- https://mahjong-party.youraimates.workers.dev`

Run: `git push origin main`

Expected: production smoke passes and GitHub `main` equals local `HEAD`.
