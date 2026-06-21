# P3 — game-core: Scoring (Fan) + Settlement

**Track:** game-core (Team A) · **Depends on:** P1 (types of P2 from CONTRACTS) · **Parallel with:** P2 · **Size:** M

## Goal
Turn a winning decomposition into a fan total and a coin settlement, honoring the Old Hong Kong fan table,
exclusion rules, the 1-fan/3-fan gate, and the spec's doubling-ladder payout. All values data-driven.

## Deliverables
```
game-core/scoring.ts        + scoring.test.ts
game-core/fan-table.ts      (data: pattern ids, nameKeys, fan values, exclusions)
```

## Detailed spec
`scoreHand(win, ctx, settings): HandResult` (CONTRACTS §1):
1. For each decomposition in `win`, run every pattern detector; sum fan with **exclusion rules**.
2. Add contextual fans (self-draw, fully concealed, value-pung winds stack, bonus tiles, win-on-last-tile).
3. Pick the **highest-scoring** valid interpretation.
4. **Gate:** `3-fan` rejects total < 3 (→ not a win, `won:false` upstream / claim refused); `1-fan` rejects < 1;
   limit hands always pass.
5. **Settlement:** `cappedFan = min(total, settings.fanCap)`; `handValue = settings.baseUnit * settings.fanToMultiplier[cappedFan]`.
   - Self-draw (`selfDrawPaysAll`): each of 3 opponents pays `handValue`.
   - Discard (`discarderPaysAll`): discarder pays `handValue` (others 0).
   - Return `perSeatDelta[4]`; **assert it sums to 0**.

### fan-table.ts (launch set — data, with i18n `nameKey`s)
| id | nameKey | fan |
|---|---|---|
| all-chows, concealed, self-draw, pung-dragon, pung-seat-wind, pung-prevailing-wind, no-bonus, last-tile | … | 1 each |
| all-pungs, half-flush | … | 3 |
| small-three-dragons | … | 5 |
| full-flush | … | 7 |
| great-three-dragons, small-four-winds | … | 8 |
| all-honors, great-four-winds | … | 10 |
| thirteen-orphans, all-kongs | … | LIMIT |

Plus bonus fans (own flower +1, own season +1, all-4-flowers / all-4-seasons +1 per config).
**Exclusions:** full-flush excludes half-flush; great-* supersedes small-*; encode as an exclusion map.

> Confirm exact Old HK fan values against the spec §6/§11/§12 and the rules sources in the engine
> blueprint before finalizing; keep every number in `fan-table.ts` / settings, never inline.

## Contracts
- **Consumes:** `WinResult, Decomposition, WinContext, MatchSettings, HandResult, ScoredPattern` (CONTRACTS).
- **Exposes:** `scoreHand` + the fan table data.

## Acceptance criteria
- [ ] Each launch pattern: a crafted hand → expected fan total (one test per pattern).
- [ ] Exclusion rules verified (no full+half double-count; great supersedes small).
- [ ] Contextual fans: self-draw, concealed, wind stacking, bonus, last-tile each add correctly.
- [ ] **Gate:** 3-fan mode rejects a 2-fan win and accepts a 3-fan win; 1-fan accepts a 1-fan win; limit always passes.
- [ ] **Settlement invariants:** `perSeatDelta` sums to 0; self-draw collects from all 3; discard only from discarder;
      fan capped at `fanCap`; multiplier ladder matches `3→1,4→2,5→4,6→8,7+→16` (and 32 cap variant).
- [ ] Highest-interpretation selection: a hand decomposable two ways scores the higher.
