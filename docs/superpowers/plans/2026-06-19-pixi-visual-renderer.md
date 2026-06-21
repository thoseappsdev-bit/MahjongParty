# Pixi Visual Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PixiJS in-match board renderer with animated tile movement, claim/win effects, and safe sound cues while keeping React controls and accessibility intact.

**Architecture:** Add pure layout and event-classification modules first, then connect them through a `PixiMatchBoard` React bridge. `MatchBoard.tsx` becomes the fallback/accessibility wrapper and delegates the visible board to Pixi.

**Tech Stack:** React 19, Vite 8, TypeScript 6, Vitest 4, PixiJS, browser Web Audio.

## Global Constraints

- Use the existing `MatchView`, `MatchIntent`, `Seat`, and `LegalAction` contracts from `@mahjong/shared-types`.
- Do not modify match engine rules, economy, LAN, Discord, Supabase, or Cloudflare behavior for this visual pass.
- Use generated assets under `/assets/table-skins/` and `/assets/tiles/old-hk/`.
- Keep keyboard/screen-reader discard buttons available even when Pixi owns the visible hand.
- Respect reduced motion and blocked browser audio.
- Verify with `pnpm --filter @mahjong/web test`, `pnpm --filter @mahjong/web lint`, and `pnpm build`.

---

### Task 1: Pure Pixi Board Layout Model

**Files:**
- Create: `apps/web/src/screens/pixi/pixiBoardLayout.ts`
- Create: `apps/web/src/screens/pixi/pixiBoardLayout.test.ts`

**Interfaces:**
- Consumes: `MatchView`, `Seat`
- Produces: `buildPixiBoardLayout(view: MatchView, viewport: { width: number; height: number }): PixiBoardLayout`

- [ ] **Step 1: Write failing layout tests**

```ts
import { describe, expect, it } from "vitest";
import type { MatchView, Seat } from "@mahjong/shared-types";
import { buildPixiBoardLayout } from "./pixiBoardLayout";

describe("pixi board layout", () => {
  it("keeps desktop side labels inside the table and away from the tile rails", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });

    expect(layout.mode).toBe("desktop");
    for (const label of [layout.seats[1].label, layout.seats[3].label]) {
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x + label.width).toBeLessThanOrEqual(layout.viewport.width);
      expect(label.width).toBeGreaterThan(34);
    }
    expect(layout.seats[1].label.x + layout.seats[1].label.width).toBeLessThan(layout.seats[1].concealedTiles[0].x);
    expect(layout.seats[3].label.x).toBeGreaterThan(layout.seats[3].concealedTiles[0].x + layout.seats[3].concealedTiles[0].width);
  });

  it("keeps local hand below the discard area on desktop", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });
    const handTop = Math.min(...layout.localHand.map((tile) => tile.y));
    expect(handTop).toBeGreaterThan(layout.discardArea.y + layout.discardArea.height);
  });

  it("uses compressed rails on mobile", () => {
    const layout = buildPixiBoardLayout(view(), { width: 390, height: 680 });
    expect(layout.mode).toBe("mobile");
    expect(layout.seats[1].concealedTiles.length).toBeLessThanOrEqual(8);
    expect(layout.localHand.every((tile) => tile.width >= 31)).toBe(true);
  });
});

function view(): MatchView {
  return {
    handNumber: 1,
    mode: "3-fan",
    tableType: "friendly",
    turnSeat: 3,
    mySeat: 0,
    timerSeconds: 25,
    wallCount: 64,
    claimPrompt: null,
    legalActions: ["discard"],
    myHand: ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "we", "ws", "dr", "dw"],
    players: [player(0), player(1), player(2), player(3)] as MatchView["players"],
    recentEvent: "Your turn.",
  };
}

function player(seat: Seat): MatchView["players"][number] {
  return {
    seat,
    name: ["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"][seat],
    avatar: ["L", "B", "C", "D"][seat],
    wind: ["E", "S", "W", "N"][seat] as "E" | "S" | "W" | "N",
    isBot: seat !== 0,
    handCount: 13,
    melds: seat === 3 ? ["pung dr"] : [],
    discards: seat === 0 ? ["m4", "m5"] : [],
    coinsDelta: 0,
    connected: true,
  };
}
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @mahjong/web test apps/web/src/screens/pixi/pixiBoardLayout.test.ts`

Expected: FAIL because `pixiBoardLayout` does not exist.

- [ ] **Step 3: Implement layout**

Create typed layout structs for rectangles, tiles, seats, labels, and meld badges. Desktop uses a 16:9-ish board, side rails at x=70 and x=viewport-95, labels outside those rails. Mobile uses compressed opponent rails and larger local tiles.

- [ ] **Step 4: Run green test**

Run: `pnpm --filter @mahjong/web test apps/web/src/screens/pixi/pixiBoardLayout.test.ts`

Expected: PASS.

### Task 2: Visual Event Classifier

**Files:**
- Create: `apps/web/src/screens/pixi/pixiBoardEvents.ts`
- Create: `apps/web/src/screens/pixi/pixiBoardEvents.test.ts`

**Interfaces:**
- Consumes: previous/current `MatchView | null`
- Produces: `classifyPixiBoardEvents(previous, current): PixiBoardVisualEvent[]`

- [ ] **Step 1: Write failing tests**

Cover these cases: no previous state returns `[]`; local discard count increase returns `discard`; hand count increase returns `draw`; new claim prompt returns `claim`; recent event containing `Kong` returns `kong`; recent event containing `wins` returns `win`; turn seat change returns `turn`.

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @mahjong/web test apps/web/src/screens/pixi/pixiBoardEvents.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement classifier**

Use structural changes first and text fallback second. Return compact event objects such as `{ type: "discard", seat, tile }`, `{ type: "claim", seat: current.turnSeat }`, and `{ type: "turn", seat: current.turnSeat }`.

- [ ] **Step 4: Run green test**

Run: `pnpm --filter @mahjong/web test apps/web/src/screens/pixi/pixiBoardEvents.test.ts`

Expected: PASS.

### Task 3: Safe Sound Effects Service

**Files:**
- Create: `apps/web/src/screens/pixi/soundEffects.ts`
- Create: `apps/web/src/screens/pixi/soundEffects.test.ts`

**Interfaces:**
- Produces: `createMahjongSoundEffects(storage?: StorageLike, audioFactory?: AudioContextFactory): MahjongSoundEffects`

- [ ] **Step 1: Write failing tests**

Test default sound enabled, mute persistence to key `mahjong:sound-muted`, no throw when no AudioContext exists, and no oscillator calls while muted.

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @mahjong/web test apps/web/src/screens/pixi/soundEffects.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement sound service**

Use oscillator/gain envelopes for `tile`, `claim`, `kong`, and `win`. `unlock()` lazily creates context after a user gesture. All failures become no-ops.

- [ ] **Step 4: Run green test**

Run: `pnpm --filter @mahjong/web test apps/web/src/screens/pixi/soundEffects.test.ts`

Expected: PASS.

### Task 4: Pixi React Bridge

**Files:**
- Create: `apps/web/src/screens/PixiMatchBoard.tsx`
- Modify: `apps/web/src/screens/MatchBoard.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `buildPixiBoardLayout`, `classifyPixiBoardEvents`, `createMahjongSoundEffects`
- Produces: visible Pixi board and fallback prop `onRendererError?: () => void`

- [ ] **Step 1: Add Pixi dependency**

Run: `pnpm add pixi.js --filter @mahjong/web`

- [ ] **Step 2: Render Pixi app lifecycle**

`PixiMatchBoard` creates a Pixi `Application`, loads table/tile textures, responds to resize, renders all board layers, and destroys cleanly on unmount.

- [ ] **Step 3: Wire tile interactivity**

Local hand sprites use pointer events only when `canDiscard` is true and call `onAction({ type: "discard", tile })`. Disabled tiles look inert.

- [ ] **Step 4: Keep fallback and accessibility**

`MatchBoard` shows `PixiMatchBoard` by default, keeps hidden tile buttons for keyboard users, and renders the existing DOM board only if Pixi errors.

- [ ] **Step 5: Style container**

Add `.pixi-board-shell`, `.pixi-board-canvas`, `.sr-only-hand`, and fallback visibility rules. Desktop allows internal scrolling for full center piles; mobile keeps one board column without horizontal drift.

### Task 5: Verification

**Files:**
- Modify only if verification exposes bugs.

- [ ] **Step 1: Run focused tests**

Run: `pnpm --filter @mahjong/web test`

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

Run: `pnpm --filter @mahjong/web lint`

Expected: PASS.

- [ ] **Step 3: Run full build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Browser smoke**

Start web dev server and inspect desktop and mobile match surfaces. Confirm Pixi canvas is nonblank, local hand is clickable, side names do not overlap tile rails, and action buttons still gate illegal claims.
