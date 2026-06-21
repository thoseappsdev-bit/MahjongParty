# P1 — game-core: Tiles, RNG, Wall

**Track:** game-core (Team A) · **Depends on:** P0, CONTRACTS · **Blocks:** P2,P3,P4 · **Size:** S–M

## Goal
The deterministic foundation of the engine: tile encoding/predicates, a seeded reproducible RNG, and
the 144-tile wall (build, shuffle, deal, dead-wall replacement draws). Everything downstream counts on
these being correct and reproducible.

## Deliverables
```
game-core/tiles.ts   + tiles.test.ts
game-core/rng.ts     + rng.test.ts
game-core/wall.ts    + wall.test.ts
```

## Detailed spec

### tiles.ts (implements CONTRACTS §1 tile fns)
- `TileKind` 0..41 layout exactly as CONTRACTS §1 / plan Part A. `Tile` 0..143 where
  `kindOf(tile)` = mapping: kinds 0..33 have 4 copies (ids ordered kind-major), kinds 34..41 have 1 copy.
- Implement `kindOf, spriteKey, codeToKind, suitOf, rankOf, isHonor, isTerminal, isWind, isDragon, isBonus`.
- `spriteKey` returns codes: `m1..m9, s1..s9, p1..p9, we,ws,ww,wn, dr,dg,dw, f1..f4, t1..t4`.
- Provide `toCounts(tiles: Tile[]): TileCounts` (length 34, bonus excluded) and `countsToTiles` helper for tests.

### rng.ts
- `createRng(seed, cursor=0)`: FNV-1a hash of `seed` seeds **mulberry32**; advance the stream `cursor`
  times so `(seed, cursor)` reproduces the exact position. `nextInt(maxExclusive)` unbiased.
- Mirror the spirit of the reference `deterministicRoll` (FNV-1a) in pantheon-breach.

### wall.ts
- `buildWall(rng): { wall: Tile[]; deadWall: Tile[] }` — start `[0..143]`, **Fisher–Yates** using
  `rng.nextInt`, then split: last 14 tiles → dead wall, rest → live wall.
- `deal(wall): { hands: Tile[][]; wall }` — 13 tiles to each of 4 seats (dealer's 14th comes from first draw,
  per turn flow), standard deal order.
- `drawLive(wall)` and `drawDead(deadWall)` returning `{ tile, wall/deadWall }` immutably.
- Replacement-draw helper for flowers/kongs pulls from the dead wall.

## Contracts
- **Consumes:** `Tile, TileKind, TileCounts, Rng` (CONTRACTS §1).
- **Exposes:** the tile/rng/wall functions used by P2–P5 and the server.

## Acceptance criteria
- [ ] Tile set distribution test: exactly 4×34 + 8 = 144; `kindOf` over `0..143` yields the right histogram.
- [ ] `code ↔ kind` round-trips for all 42 kinds; predicates correct (terminals, honors, winds, dragons, bonus).
- [ ] **Determinism:** same seed ⇒ identical wall + deal (snapshot); different seeds differ.
- [ ] **Cursor reproducibility:** `createRng(seed, k)` continues the stream identically to advancing `k` times.
- [ ] `toCounts` excludes bonus and sums to hand length; Fisher–Yates is unbiased (chi-square sanity over N seeds).
- [ ] **Tile conservation:** after deal, every physical tile id appears exactly once across hands+wall+deadWall.
