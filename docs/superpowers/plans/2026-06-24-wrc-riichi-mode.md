# WRC Riichi Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the label-only Riichi Beta with an authoritative, deterministic four-player WRC 2025 Riichi mode covering gameplay, scoring, exhaustive draws, match progression, bots, UI, and replay.

**Architecture:** A dedicated `game-core/src/riichi` state machine shares only tile and hand-progress primitives with Old Hong Kong. The LAN service stores a discriminated match union and Durable Objects remain authoritative; web clients render redacted mode-specific snapshots and submit intents only.

**Tech Stack:** TypeScript 6, Vitest, React 19, PixiJS 8, Cloudflare Durable Objects, Supabase persistence.

## Global Constraints

- Rules baseline: WRC Rules 2025 and WRC Scoring Table 2025.
- Four players, 136 tiles, 14-tile dead wall, no flowers, seasons, or red fives.
- Open tanyao and ato-zuke allowed; kuikae forbidden.
- No abortive draws and no nagashi mangan.
- One ron winner by turn priority.
- Riichi mode remains friendly-only until the complete plan and live QA pass.
- Old Hong Kong engine and scoring behavior must not regress.
- Every state transition is deterministic from seed plus recorded decisions.
- Follow test-first red-green-refactor and commit each task separately.

---

### Task 1: Riichi Domain Types and 136-Tile Wall

**Files:**
- Create: `game-core/src/riichi/types.ts`
- Create: `game-core/src/riichi/tiles.ts`
- Create: `game-core/src/riichi/tiles.test.ts`
- Create: `game-core/src/riichi/index.ts`
- Modify: `game-core/src/index.ts`

**Interfaces:**
- Produces: `RiichiTile`, `RiichiMeld`, `RiichiPlayerState`, `RiichiRoundState`, `RiichiMatchContext`, `RiichiMatchState`
- Produces: `RiichiActionType = "chi" | "pong" | "kong" | "riichi" | "win" | "discard" | "pass"`
- Produces: `RiichiActionInput { seat: Seat; type: RiichiActionType; tile?: RiichiTile }`
- Produces: `RiichiActionOffer { seat: Seat; type: RiichiActionType; tile?: RiichiTile; discardChoices?: RiichiTile[] }`
- Produces: `buildRiichiWall(): RiichiTile[]`
- Produces: `doraForIndicator(indicator: RiichiTile): RiichiTile`

- [ ] **Step 1: Write failing wall and dora tests**

```ts
expect(buildRiichiWall()).toHaveLength(136);
expect(buildRiichiWall().filter((tile) => tile === "m5")).toHaveLength(4);
expect(doraForIndicator("m9")).toBe("m1");
expect(doraForIndicator("wn")).toBe("we");
expect(doraForIndicator("dw")).toBe("dg");
```

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi/tiles.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement domain types, tile validation, wall, and indicator cycles**

Use existing codes `m1..m9`, `p1..p9`, `s1..s9`, `we/ws/ww/wn`, `dr/dg/dw`. Define `RiichiMatchState` with points, dealer, round wind, hand number, honba, riichi sticks, live wall, dead wall, indicator counts, players, claim state, result, event log, and audit log.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi/tiles.test.ts && pnpm --filter @mahjong/game-core build`

```bash
git add game-core/src/riichi game-core/src/index.ts
git commit -m "feat: add Riichi domain and wall"
```

### Task 2: Waits, Tenpai, and Furiten

**Files:**
- Create: `game-core/src/riichi/waits.ts`
- Create: `game-core/src/riichi/waits.test.ts`
- Modify: `game-core/src/riichi/types.ts`

**Interfaces:**
- Consumes: `evaluateHandProgress`
- Produces: `winningTiles(hand, melds): RiichiTile[]`
- Produces: `isTenpai(hand, melds): boolean`
- Produces: `furitenState(player, winningTiles): "none" | "discard" | "temporary" | "riichi"`

- [ ] **Step 1: Write failing waits and furiten tests**

Cover multi-sided waits, tanki, shanpon, impossible fifth-copy waits, own-discard furiten, passed-ron temporary furiten, draw clearing temporary furiten, and permanent riichi furiten.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi/waits.test.ts`

Expected: FAIL because wait APIs do not exist.

- [ ] **Step 3: Implement waits by candidate insertion and stateful furiten transitions**

Test all 34 candidate tiles without exceeding four copies, retaining candidates that produce a complete standard, seven-pairs, or thirteen-orphans hand. Ron legality rejects every non-`none` furiten state; tsumo remains legal.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi/waits.test.ts`

```bash
git add game-core/src/riichi
git commit -m "feat: evaluate Riichi waits and furiten"
```

### Task 3: Yaku, Dora, Han, and Fu

**Files:**
- Create: `game-core/src/riichi/yaku.ts`
- Create: `game-core/src/riichi/yaku.test.ts`
- Create: `game-core/src/riichi/fu.ts`
- Create: `game-core/src/riichi/fu.test.ts`
- Create: `game-core/src/riichi/scoring.ts`
- Create: `game-core/src/riichi/scoring.test.ts`

**Interfaces:**
- Produces: `RiichiWinContext`
- Produces: `RiichiYakuLine { id: string; han: number; yakuman: number }`
- Produces: `scoreRiichiHand(input): RiichiScore`
- Produces: `settleRiichiWin(score, context): [number, number, number, number]`

- [ ] **Step 1: Write failing golden yaku tests**

Cover riichi, double riichi, ippatsu, menzen tsumo, pinfu, tanyao, iipeikou, yakuhai, chankan, rinshan, haitei, houtei, sanshoku, ittsuu, chanta, chiitoitsu, toitoi, sanankou, sankantsu, honroutou, shousangen, honitsu, junchan, ryanpeikou, chinitsu, and WRC yakuman. Assert dora adds han but cannot make a yakuless hand legal.

- [ ] **Step 2: Write failing fu and payment tests**

Cover seven-pairs 25 fu, pinfu tsumo 20 fu, closed ron bonus, wait/pair/group fu, rounding, mangan through yakuman, dealer/non-dealer ron, and split tsumo payments. Use cases from the WRC 2025 scoring table.

- [ ] **Step 3: Verify RED**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi/yaku.test.ts src/riichi/fu.test.ts src/riichi/scoring.test.ts`

Expected: FAIL because scoring modules do not exist.

- [ ] **Step 4: Implement scoring in three layers**

`yaku.ts` recognizes legal patterns and closure requirements. `fu.ts` evaluates the selected winning decomposition. `scoring.ts` chooses the highest-value legal decomposition, counts active dora/ura/kan indicators, applies WRC limits, then returns exact rounded payments.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi`

```bash
git add game-core/src/riichi
git commit -m "feat: score WRC Riichi hands"
```

### Task 4: Authoritative Riichi Hand State Machine

**Files:**
- Create: `game-core/src/riichi/engine.ts`
- Create: `game-core/src/riichi/engine.test.ts`
- Create: `game-core/src/riichi/replay.test.ts`
- Modify: `game-core/src/action-log.ts`

**Interfaces:**
- Produces: `createRiichiHand(seed, matchContext): RiichiMatchState`
- Produces: `riichiLegalActions(state, seat): RiichiActionOffer[]`
- Produces: `resolveRiichiAction(state, input): RiichiMatchState`
- Produces: `replayRiichiHand(seed, context, decisions): RiichiMatchState`

- [ ] **Step 1: Write failing transition tests**

Cover deal conservation, draw/discard, chi/pon/kan priority, kuikae rejection, riichi with valid discard choices, 1,000-point deposit, locked hand after riichi, ippatsu cancellation, ron/tsumo, passed-ron furiten, open/promoted/concealed kan, chankan, rinshan, dora reveal timing, last-tile restrictions, and exhaustive draw.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi/engine.test.ts`

Expected: FAIL because engine APIs do not exist.

- [ ] **Step 3: Implement immutable deterministic transitions**

Every accepted player or bot intent appends a decision event. System events record draws, dora reveals, furiten changes, settlement, and exhaustion. Illegal intents return unchanged gameplay state plus a bounded error event.

- [ ] **Step 4: Add replay identity test**

Replay the decisions from a completed hand and assert equality for points, hands, discards, melds, walls, indicators, winner, and audit sequence.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi`

```bash
git add game-core/src/riichi game-core/src/action-log.ts
git commit -m "feat: add authoritative Riichi hand engine"
```

### Task 5: Exhaustive Draw and Hanchan Progression

**Files:**
- Create: `game-core/src/riichi/match.ts`
- Create: `game-core/src/riichi/match.test.ts`
- Modify: `game-core/src/riichi/types.ts`

**Interfaces:**
- Produces: `settleTenpaiNoten(tenpaiSeats): [number, number, number, number]`
- Produces: `advanceRiichiRound(state, handResult): RiichiMatchState`
- Produces: `finalizeHanchan(state): RiichiFinalStanding[]`

- [ ] **Step 1: Write failing settlement and progression tests**

Assert zero tenpai and four tenpai move zero points; one/three, two/two, and three/one splits move exactly 3,000 points. Assert tenpai dealer continuation, dealer/non-dealer win rotation, honba accumulation/reset, riichi-stick carry/award, East-to-South transition, South 4 completion, 30,000 start, no bankruptcy, and +15/+5/-5/-15 uma with tie splitting.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi/match.test.ts`

- [ ] **Step 3: Implement point-conserving progression**

All hand deltas must sum to zero before riichi deposits; the table-held riichi pool accounts for deposited sticks. Hanchan finalization returns ordered raw points and uma separately.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi`

```bash
git add game-core/src/riichi
git commit -m "feat: progress WRC Riichi matches"
```

### Task 6: Shared Contracts and LAN/Durable Object Integration

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `server/src/lan-table-service.ts`
- Modify: `server/src/lan-table-service.test.ts`
- Modify: `apps/worker/src/room-do.test.ts`
- Modify: `apps/worker/src/room-socket.test.ts`

**Interfaces:**
- Adds legal action: `"riichi"`
- Adds: `RiichiMatchView`, `RiichiResultDetails`
- Changes server internal match to: `MatchState | RiichiMatchState`
- Preserves redacted `LanRoomSnapshot`

- [ ] **Step 1: Write failing service tests**

Assert Riichi room start creates a 136-tile Riichi state, snapshots expose points/round/honba/riichi sticks/dora indicators but never opponents' hands or hidden indicators, Riichi actions reach the correct engine, reconnect restores state, and HTTP/WebSocket mutations broadcast identical snapshots.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @mahjong/server exec vitest run src/lan-table-service.test.ts`

- [ ] **Step 3: Add discriminated contracts and dispatch**

Use `match.mode === "riichi"` as the discriminator. `startMatch`, legal-action mapping, bot advancement, result generation, export/import, and snapshot redaction dispatch to the matching engine without branching inside Old Hong Kong scoring.

- [ ] **Step 4: Verify persistence and realtime tests**

Run: `pnpm --filter @mahjong/server test && pnpm --filter @mahjong/worker test`

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src server/src apps/worker/src
git commit -m "feat: serve authoritative Riichi rooms"
```

### Task 7: Riichi Bot Strategy

**Files:**
- Create: `game-core/src/riichi/bot.ts`
- Create: `game-core/src/riichi/bot.test.ts`
- Modify: `server/src/lan-table-service.ts`

**Interfaces:**
- Produces: `chooseRiichiBotAction(state, seat): RiichiActionInput`

- [ ] **Step 1: Write failing deterministic bot tests**

Assert bots prefer lower shanten, then higher ukeire; avoid known dangerous tiles after an opponent riichi when a safe tile exists; declare legal riichi with positive expected value; never violate furiten, locked-hand, kuikae, or kan restrictions; and return identical actions for identical state.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi/bot.test.ts`

- [ ] **Step 3: Implement ordered heuristics**

Rank legal actions by win, legal ron/tsumo, defense against riichi, shanten, ukeire, dora retention, terminal/honor isolation, and deterministic tile-code tiebreak.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @mahjong/game-core exec vitest run src/riichi && pnpm --filter @mahjong/server test`

```bash
git add game-core/src/riichi server/src/lan-table-service.ts
git commit -m "feat: add deterministic Riichi bots"
```

### Task 8: Riichi Table and Result UI

**Files:**
- Modify: `apps/web/src/screens/CreateTable.tsx`
- Modify: `apps/web/src/screens/InMatch.tsx`
- Modify: `apps/web/src/screens/Result.tsx`
- Modify: `apps/web/src/screens/pixi/pixiBoardLayout.ts`
- Modify: `apps/web/src/screens/pixi/pixiRuntime.ts`
- Create: `apps/web/src/screens/RiichiResult.test.tsx`
- Modify: `packages/i18n/src/index.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `RiichiMatchView`, `RiichiResultDetails`, `"riichi"` legal action

- [ ] **Step 1: Write failing UI contract tests**

Assert the screen renders points, East/South hand marker, honba, riichi pool, dora indicators, gated Riichi button, valid riichi discard highlights, rotated riichi discard, furiten status, and result rows for yaku/han/fu/dora/payments or tenpai/noten.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @mahjong/web exec vitest run src/screens/RiichiResult.test.tsx`

- [ ] **Step 3: Implement responsive Pixi and React presentation**

Keep current four-seat board geometry. Place points in player pills, dora indicators beside the round marker, riichi/honba counters above the discard field, and mode-specific result details in un-nested panels. Use existing tile assets and animations.

- [ ] **Step 4: Verify web tests and visual viewports**

Run: `pnpm --filter @mahjong/web test && pnpm --filter @mahjong/web build`

Run Playwright screenshots at 1440x900 and 390x844. Expected: no overlap, clipping, blank canvas, or unreadable tile text.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src packages/i18n/src
git commit -m "feat: render complete Riichi tables"
```

### Task 9: Release Gates and Promotion from Beta

**Files:**
- Modify: `apps/web/src/screens/CreateTable.tsx`
- Modify: `apps/web/src/mock/mockData.ts`
- Modify: `docs/production-release.md`
- Modify: `docs/CONTRACTS.md`

**Interfaces:**
- Changes visible label from `Riichi Beta` to `WRC Riichi` only after all gates pass.

- [ ] **Step 1: Run complete verification**

Run: `pnpm test && pnpm build && pnpm security:secrets && pnpm production:check && pnpm check:cloudflare`

Expected: every command exits 0.

- [ ] **Step 2: Run live multiplayer QA**

Test four clients through create, join, riichi, ron/tsumo, exhaustive draw, reconnect, leave, host transfer, rematch, and full hand settlement. Confirm no hidden tiles leak and replay reproduces the final state.

- [ ] **Step 3: Promote label and document baseline**

Replace `Riichi Beta` with `WRC Riichi`, retain friendly-only configuration, and document WRC 2025 deviations and non-goals exactly as in the design spec.

- [ ] **Step 4: Deploy and smoke**

Run: `pnpm deploy:cloudflare`

Run: `pnpm production:smoke -- https://mahjong-party.youraimates.workers.dev`

Expected: production health and security headers pass.

- [ ] **Step 5: Commit and push**

```bash
git add apps/web/src docs
git commit -m "feat: launch WRC Riichi mode"
git push origin main
git ls-remote origin refs/heads/main
```

Expected: remote SHA equals local `HEAD`.
