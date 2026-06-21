# Discard Auto-scroll and Meld Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the newest overflowing discard tiles visible and make every meld pill fit its complete label.

**Architecture:** Add a pure discard-scroll decision helper so count-change behavior can be tested without Pixi, then call it from the existing renderer effect. Calculate meld widths in the existing layout module because positioning and board bounds already live there.

**Tech Stack:** React 19, TypeScript, PixiJS, Vitest

---

### Task 1: Auto-follow New Discards

**Files:**
- Create: `apps/web/src/screens/pixi/pixiDiscardScroll.ts`
- Create: `apps/web/src/screens/pixi/pixiDiscardScroll.test.ts`
- Modify: `apps/web/src/screens/PixiMatchBoard.tsx`

- [ ] **Step 1: Write the failing scroll helper tests**

Test that `nextDiscardScrollY(previousCount, nextCount, currentY, maxY)` returns `maxY` when the count increases, preserves `currentY` when it does not, and clamps when overflow shrinks.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @mahjong/web test -- pixiDiscardScroll.test.ts`

Expected: FAIL because `pixiDiscardScroll.ts` does not exist.

- [ ] **Step 3: Implement the pure scroll decision**

Create an exported function using this behavior:

```ts
export function nextDiscardScrollY(
  previousCount: number,
  nextCount: number,
  currentY: number,
  maxY: number,
): number {
  if (nextCount > previousCount) return maxY;
  return Math.min(Math.max(currentY, 0), maxY);
}
```

- [ ] **Step 4: Wire count tracking into the Pixi renderer**

Add a discard-count ref in `PixiMatchBoard`, derive the total count from `view.players`, and use `nextDiscardScrollY` before rendering. Update the count ref after deciding so wheel and drag state remain unchanged between discards.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `pnpm --filter @mahjong/web test -- pixiDiscardScroll.test.ts`

Expected: PASS.

### Task 2: Content-fitting Meld Pills

**Files:**
- Modify: `apps/web/src/screens/pixi/pixiBoardLayout.ts`
- Modify: `apps/web/src/screens/pixi/pixiBoardLayout.test.ts`

- [ ] **Step 1: Write the failing badge-width test**

Build a layout with local melds `pung dr` and `chow s4 s5 s6`; assert the chow badge is wider, is at least 94 desktop pixels wide, and remains within the viewport.

- [ ] **Step 2: Run the layout test and verify RED**

Run: `pnpm --filter @mahjong/web test -- pixiBoardLayout.test.ts`

Expected: FAIL because both badges currently have the fixed 64-pixel width.

- [ ] **Step 3: Implement measured deterministic widths**

In `buildMeldBadges`, derive each width from the displayed uppercase text using an estimated glyph width plus horizontal padding:

```ts
const badgeWidth = clamp(
  displayText.length * (mode === "desktop" ? 6.2 : 5.2) + 18,
  mode === "desktop" ? 64 : 48,
  mode === "desktop" ? 124 : 104,
);
```

Advance horizontal badges with a running cursor based on each preceding badge's actual width. Clamp side badges to the board bounds using their own calculated width.

- [ ] **Step 4: Run layout tests and verify GREEN**

Run: `pnpm --filter @mahjong/web test -- pixiBoardLayout.test.ts`

Expected: PASS.

### Task 3: Regression and Rendered QA

**Files:**
- Verify: `apps/web/src/screens/PixiMatchBoard.tsx`
- Verify: `apps/web/src/screens/pixi/pixiBoardLayout.ts`

- [ ] **Step 1: Run the complete web test suite**

Run: `pnpm --filter @mahjong/web test`

Expected: all tests PASS.

- [ ] **Step 2: Run the production web build**

Run: `pnpm --filter @mahjong/web build`

Expected: exit code 0.

- [ ] **Step 3: Verify the overflowing board in the browser**

The flow under test is: open a match with an overflowing discard pile -> a new discard arrives -> the center viewport follows the newest row and the full chow label remains enclosed by its pill.

Check page identity, nonblank rendering, framework overlays, console errors, desktop screenshot evidence, and one target interaction.

- [ ] **Step 4: Commit**

Git is currently unavailable in this checkout. Record this limitation instead of attempting a commit until repository metadata is repaired.
