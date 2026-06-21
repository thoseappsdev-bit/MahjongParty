# P2 — game-core: Win Detection

**Track:** game-core (Team A) · **Depends on:** P1 · **Parallel with:** P3 · **Size:** M

## Goal
Decide whether a 14-tile hand (concealed counts + already-formed melds) is a winning hand, return all
valid decompositions (scoring needs them), detect the special hands, and compute waiting tiles + shanten.

## Deliverables
```
game-core/win-detection.ts + win-detection.test.ts
```

## Detailed spec
Operate on `TileCounts` (length 34) for the concealed portion; `melds` reduce the number of melds still
needed (each formed meld = 1 of the 4).

- `checkWin(counts, melds, ctx): WinResult` (CONTRACTS §1/§types):
  - **Standard:** 4 melds + 1 pair. Recursive backtracking:
    - Pick a pair candidate (any kind with count ≥ 2), remove it, then `decompose(remaining, meldsNeeded)`.
    - `decompose`: take first non-zero kind k; if suit and `k,k+1,k+2 > 0` try a **chow**; if `count[k] ≥ 3`
      try a **pung**; recurse and backtrack. Respect suit boundaries via `suitOf` (honors: pung/pair only).
    - Collect **all** decompositions, not just a boolean.
  - **Thirteen Orphans:** exactly the 13 terminal/honor kinds present with one doubled (concealed only). O(1).
  - **Seven Pairs** (if `settings.allowSevenPairs`): exactly 7 distinct kinds each count 2, concealed. O(34).
  - If multiple interpretations win, return all; scoring (P3) picks the highest.
- `waitingTiles(state, seat): TileKind[]` — for a 13-tile hand, for each of 34 kinds with <4 already visible,
  add one and re-run `checkWin`; collect the completers.
- `shanten(counts, melds): number` — min tiles away from tenpai (used by the bot, P5). Reuse the decomposition
  search counting best partial melds + pairs.

**Complexity:** decomposition ≈ O(34) with a ×34 pair pivot; tenpai adds ×34 — microseconds. Fine for the server hot path.

## Contracts
- **Consumes:** `TileCounts, Meld, WinContext, WinResult, Decomposition` (CONTRACTS).
- **Exposes:** `checkWin, waitingTiles, shanten`.

## Acceptance criteria
- [ ] Table of known winning hands → `won:true` with expected decomposition(s): all-pungs, all-chows, mixed,
      with exposed melds, with a kong, edge/closed/dual waits.
- [ ] Known non-winning hands → `won:false`.
- [ ] Thirteen Orphans + Seven Pairs positive and negative cases (and the concealed-only requirement).
- [ ] `waitingTiles` returns exact completer sets for single, multi (e.g. 1-4 wait), and 9-tile waits.
- [ ] `shanten` returns 0 for tenpai hands, correct values for sampled hands.
- [ ] Performance: `checkWin` over 10k random 14-tile hands completes well under a frame budget.
