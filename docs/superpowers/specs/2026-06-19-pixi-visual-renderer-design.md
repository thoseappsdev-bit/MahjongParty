# Pixi Visual Renderer Design

## Goal

Replace the in-match DOM board composition with a PixiJS visual renderer that makes the table feel alive: proper tile placement, movement, turn highlighting, claim and win effects, and light sound feedback. The React screen remains responsible for match state, tutorial copy, action buttons, routing, economy, and accessibility fallbacks.

## Recommended Approach

Use a hybrid renderer:

- Pixi renders the complete table surface: board skin, player rails, concealed tiles, local hand, meld badges, discard pile, claim banner, turn glow, and visual effects.
- React keeps the header, event feed, action bar, tutorial card, and hidden accessible hand buttons.
- The local hand in Pixi is interactive. Tapping/clicking a tile sends `onAction({ type: "discard", tile })` only when discard is legal.
- If Pixi fails to initialize, the existing React/CSS board remains as a fallback instead of blocking play.

This is preferred over a full app rewrite because it improves the visual table without disturbing the match engine, economy, Discord/LAN flows, or tutorial controls.

## Visual Direction

The board should feel like the existing Old Hong Kong teahouse table, but cleaner:

- Preserve the generated wood-and-felt table skin.
- Use the newer SVG tile art everywhere, including discards.
- Keep side-player names in vertical pill labels beside the tile rails, aligned to the side frame instead of overlapping it.
- Use a compact central discard grid that scrolls inside the board on desktop when full.
- On mobile, keep the local hand large and readable, with opponents compressed to rail summaries.

## Animation And Effects

The renderer should classify visual moments from `MatchView` changes and play short effects:

- Draw: tile slides from wall/seat direction toward the active player.
- Discard: selected tile lifts, travels to the center discard pile, then settles.
- Claim: claimed tile pulses and the claiming player rail flashes gold.
- Kong: stronger gold flash with a short table glow.
- Win: center glow, winning player highlight, and celebratory tile pulse.
- Turn change: active player pill and rail get a subtle breathing glow.

Effects must be short and readable. Reduced motion disables movement and keeps only instant state changes plus static highlights.

## Sound

Use a small browser-native Web Audio service instead of shipping large audio files:

- Tile tap/discard: short wood click.
- Claim: two-note chime.
- Kong/win: richer chime.
- Illegal actions remain silent because the button state already explains availability.

Sound is unlocked only after a user gesture and can be muted with persisted local storage. It must never throw if browser audio is blocked.

## Architecture

Create small focused modules under `apps/web/src/screens/pixi/`:

- `pixiBoardLayout.ts`: pure layout model for desktop and mobile, with coordinates for seats, hand tiles, discards, labels, and hit areas.
- `pixiBoardEvents.ts`: pure event classifier that compares previous/current `MatchView` snapshots and returns visual event names.
- `soundEffects.ts`: small Web Audio wrapper with persisted mute state and safe no-op behavior.
- `PixiMatchBoard.tsx`: React bridge that owns the Pixi application lifecycle, asset loading, interactivity, resize handling, and rendering.

Update `MatchBoard.tsx` to render `PixiMatchBoard` first and keep the old DOM board as a fallback path. Keep hidden accessible tile buttons for keyboard users and screen readers.

## Testing

Use TDD for pure behavior before renderer code:

- Layout tests prove desktop side labels stay inside the table, local hand does not overlap center discards, and mobile uses compressed rails.
- Event tests prove draw, discard, claim, kong, win, and no-op transitions are detected from view changes.
- Sound tests prove mute persistence and blocked/absent AudioContext become no-ops.
- Existing match UI tests must still pass.

Manual/browser verification should cover desktop and mobile table views. If sandboxed browser launch fails, record the exact blocker and still complete build/lint/test verification.

## Acceptance Criteria

- In-match table visuals are rendered by PixiJS during normal play.
- All visible tiles, including discards, use the generated tile art.
- Tile discards are clickable only when discard is legal.
- Turn, claim, kong, and win states have visible effects.
- Sound cues work after user interaction and can be muted.
- Mobile board no longer lays out as a long broken column.
- Desktop full discard piles remain readable with internal board scrolling.
- `pnpm --filter @mahjong/web test`, `pnpm --filter @mahjong/web lint`, and `pnpm build` pass.
