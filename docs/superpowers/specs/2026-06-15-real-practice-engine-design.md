# Mahjong Party Real Practice Engine Design

## Purpose

Replace the current fake practice turn cycle with a real local rules-engine slice that friends can try. Practice should deal real Mahjong tiles, advance turns through bots, let the player discard real tiles from their hand, detect simple wins, and teach the flow through an optional tutorial.

## Scope

Included:

- Real 144-tile wall for Old Hong Kong style tiles: 34 base kinds with four copies, plus flowers/seasons reserved in the model.
- Deterministic seeded shuffle and deal for four seats.
- Local practice match state in `game-core`, with draw and discard turn flow.
- Bot turns that draw from the wall, choose a discard from their hand, and advance to the next seat.
- Basic win detection for standard four-melds-plus-pair and seven pairs on 14-tile hands.
- Player actions for selecting/discarding a tile and declaring Win when the current hand passes the basic detector.
- Tutorial overlay for first-time friend testing: hand, discard, bots, actions, win.
- Browser verification for Practice -> tutorial -> discard -> bot turns -> player turn.

Deferred:

- Chi/Pong/Kong claim windows.
- Full Old Hong Kong fan scoring and settlement.
- Flowers/seasons replacement draw behavior.
- Server-authoritative Colyseus rooms.
- Supabase economy writes.

## Architecture

`game-core` gets a pure local practice module:

- `practice-engine.ts`: tile definitions, seeded shuffle, deal, state transitions, bot decisions, win detection.
- `practice-engine.test.ts`: deterministic deal, discard/draw flow, bot cycle, win detector coverage.

`packages/shared-types` gets practice-facing state types that the UI can consume without importing engine internals directly.

`apps/web` updates Practice to use the real local practice state instead of canned `MatchView`. The existing table UI can still render through a `MatchView` adapter so the visual surface does not need a rewrite.

## User Flow

1. Player clicks Start Practice.
2. App creates a seeded local practice match and opens In Match.
3. Tutorial overlay appears with Next, Skip, and Restart Tutorial.
4. Player taps a tile or presses Discard.
5. Engine removes that tile, advances through bot turns with real draw/discard steps, then returns to the player.
6. If the player's hand is a basic winning hand, Win is enabled.
7. Win opens the existing Result screen with a simple practice result.

## Error Handling

- Discard is disabled outside the player's turn.
- Attempting to discard an unavailable tile is ignored by the engine and shows a toast.
- If the wall exhausts, the match shows an exhaustive-draw practice result.
- Tutorial can be skipped and restarted from the match screen.

## Verification

- `pnpm -r build`
- `pnpm -r test`
- Browser proof:
  - Practice starts a real seeded hand.
  - Player hand changes after discard.
  - Bot discards visibly increase.
  - Control returns to the player.
  - Tutorial text is visible and can be skipped/restarted.
