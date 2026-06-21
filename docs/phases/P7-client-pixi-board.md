# P7 — Client: PixiJS Board Renderer

**Track:** Client (Team C) · **Depends on:** P0, CONTRACTS, P9 tokens · **Parallel with:** P8, server, economy · **Size:** L

## Goal
The PixiJS canvas that renders the table, tiles, melds, discards, claim highlights, and draw/win VFX from a
`ClientView`. Strictly separated from React: React owns a container `<div>`; this owns everything inside the canvas.
Tiles are **drawn programmatically** now, behind a swappable tile-set interface.

## Deliverables
```
apps/web/src/pixi/MahjongBoard.ts      # class: init(container), render(view), playEvent(event), destroy()
apps/web/src/pixi/TileSprite.ts        # one tile; keyed by spriteKey(kind)
apps/web/src/pixi/tilesets/index.ts    # loadTileSet(setId): TileTextureProvider  (swap interface)
apps/web/src/pixi/tilesets/svgTiles.ts # M1 provider: draw tiles via Graphics/SVG -> runtime atlas
apps/web/src/pixi/layout.ts            # seat geometry (hand, melds, discards) responsive to canvas size
apps/web/src/pixi/vfx.ts               # draw glow, claim highlight, win confetti (GSAP/ticker)
apps/web/src/components/GameCanvas.tsx # React wrapper: <div ref>, instantiates MahjongBoard in useEffect
```

## Detailed spec
- **PixiJS 8:** `await app.init({...})` (async). Check latest `pixi.js` (RULE #1). WebGL fallback on.
- **`MahjongBoard`**
  - `init(container)`: create the `Application`, build the table backdrop from `tokens` (emerald cloth, gold trim).
  - `render(view: ClientView)`: lay out my 13–14 tiles (bottom, face-up, interactive), the 3 opponents
    (left/top/right, backs + meld groups face-up), the discard pool, the wall count, the current claim highlight,
    turn/seat-wind indicators. Idempotent — diff against last view to animate moves.
  - `playEvent(event: GameEventLog)`: animation cues (tile draw slide, discard toss, claim flash, win burst).
  - `onTileTap(cb)` / `onTilePreselect(cb)`: emit the tapped `Tile` up to React (one-tap discard, preselect-while-waiting).
  - `setFastMode(bool)`: shorten/skip animations (spec fast-anim mode). `destroy()`: full teardown.
  - **Never** read Zustand inside the render loop — receive `view`/callbacks from React only.
- **Tiles (`svgTiles.ts`)**: draw each of the 42 faces with `Graphics` (tile body, bevel/shadow from tokens, suit
  glyph + pips, honor/dragon marks, flower/season art). Render once into a `RenderTexture` atlas keyed by `spriteKey`.
  Tiles must be readable at **≥34px** (`tokens.tile.minReadablePx`). `TileTextureProvider` interface:
  `getTexture(spriteKey): Texture` + `back(): Texture` — so a future PNG/AI atlas provider drops in unchanged.
- **Layout (`layout.ts`)**: compute positions from canvas dimensions; handle resize + mobile safe areas; 4-seat rotation.
- **Decoupling:** `GameCanvas.tsx` passes the latest `ClientView` (from the game store) into `board.render(view)`
  via `useEffect`; subscribes to board tap callbacks and forwards them as intents.

## Contracts
- **Consumes:** `ClientView, GameEventLog, Tile, TileKind, spriteKey` (CONTRACTS §1/§2), `tokens` (§5).
- **Exposes:** `MahjongBoard` API + `GameCanvas` React component (used by P8 In-Match screen).

## Build-before-server
Drive `render`/`playEvent` from canned `ClientView` fixtures (a `boardFixtures.ts`) until the real
`useGameRoom` feed exists. The board never talks to the network directly — it only consumes `ClientView`.

## Acceptance criteria
- [ ] Renders a full table from a fixture `ClientView`: my hand face-up, 3 opponents with backs + melds, discards, wall count.
- [ ] All 42 tile faces render and are legible at 34px (visual snapshot / manual readability check).
- [ ] One-tap discard + preselect-while-waiting fire callbacks with the correct `Tile`.
- [ ] Claim highlight, draw slide, and win burst animate; `setFastMode(true)` shortens them.
- [ ] Responsive: re-layouts on resize and on mobile viewport without overlap; `destroy()` leaks nothing (remount clean).
- [ ] Swapping `svgTiles` for a stub PNG provider requires no change to `MahjongBoard`/`TileSprite`.
