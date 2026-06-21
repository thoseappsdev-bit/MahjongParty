# P4 — game-core: Match State, Actions, Claims (THE reducer)

**Track:** game-core (Team A) · **Depends on:** P1, P2, P3 · **Blocks:** P5, server integration · **Size:** L

## Goal
The heart of the engine: the immutable `MatchState`, the single-source turn-flow reducer
`resolveAction`, claim eligibility/priority, per-seat redaction, and `legalActions`. This is what the
server calls for every player action.

## Deliverables
```
game-core/match-state.ts   + match-state.test.ts   (create, seat/wind setup, redactForSeat, invariants)
game-core/claims.ts        + claims.test.ts         (eligibility, priority, window, kong robbing)
game-core/resolve-action.ts+ resolve-action.test.ts (the reducer)
game-core/index.ts          (export full public API per CONTRACTS §1)
```

## Detailed spec

### match-state.ts
- `createInitialMatchState(seed, settings, seats)`: build wall via P1, deal hands, assign seat winds
  (dealer=E), set `prevailingWind`, `turn=dealer`, `turnPhase='draw'`, `phase='dealing'→'playing'`.
- `redactForSeat(state, seat): ClientView` (CONTRACTS §1): my full concealed; others → `concealedCount`;
  hide wall/deadWall/seed/cursor while `phase!=='complete'`; project `claim` to `myIntent`; attach
  `legalActions(state, seat)` and `result`.
- Invariant helpers (used in tests + optional runtime asserts): tile conservation, legal hand sizes.

### claims.ts
- `eligibleClaims(state, seat): ClaimIntent[]` for the current discard (chow only if `seat===(discardedBy+1)%4`).
- `resolveClaimPriority(pending): { seat, intent } | null` — **Win > Pung/Kong > Chow**; simultaneous wins via
  `multiWinPolicy` (default head-bump: winner closest to discarder's right).
- Claim window open/close; **kong robbing**: an added-kong tile is offered for Win before the kong completes.

### resolve-action.ts — `resolveAction(state, action): MatchState`
Single source of turn flow. Illegal action ⇒ **return state unchanged** (do not throw). Handle:
- `startHand`, `draw` (bonus auto-move + dead-wall replacement loop; self-drawn winning tile eligible),
  `drawReplacement`, `discard` (opens claim window), `declareConcealedKong`/`declareAddedKong`
  (replacement draw + kong-rob check), `claim`, `pass`, `resolveClaims` (apply priority → mutate turn),
  `timeout` (auto-pass non-responders then resolve / advance).
- No-claim path: `turn = (turn+1)%4`, `turnPhase='draw'`. Wall exhausted with no win → `phase='complete'`
  exhaustive draw (config dealer-keeps rule).
- On a validated win: call `scoreHand`, set `result`, `phase='complete'`, release seed into `result.seedReleased`.
- Append every applied action to `state.log` for replay/audit.
- `legalActions(state, seat)`: enumerate currently-legal actions for that seat (drives client buttons + bot).
- `replay(seed, settings, seats, actions)`: fold `resolveAction` over actions from a fresh initial state.

## Contracts
- **Consumes:** P1 (wall/tiles/rng), P2 (`checkWin`,`waitingTiles`), P3 (`scoreHand`), all CONTRACTS types.
- **Exposes (the full engine API):** `createInitialMatchState, resolveAction, legalActions, redactForSeat,
  replay, checkWin, waitingTiles, scoreHand, botDecide*, simulateHand*` (*from P5).

## Acceptance criteria
- [ ] Full hand played via scripted actions reaches a valid scored result.
- [ ] Claim priority: Win beats Pung beats Chow on the same discard; chow only from left seat; kong robbing works;
      head-bump yields a single winner on simultaneous wins.
- [ ] **Illegal actions rejected (state unchanged):** discard a tile not in hand, act out of turn, chow from a
      non-left seat, wrong-phase action, below-gate win, claim after window closed.
- [ ] `redactForSeat` never leaks: other seats' concealed tiles, wall, deadWall, seed, or cursor (assert in test).
- [ ] `legalActions` matches what the reducer will accept (no action it lists is rejected; none it omits is accepted).
- [ ] Timeout auto-passes and advances; reconnect-safe (state is the single source).
- [ ] `replay(seed, log)` reproduces the exact final state (golden snapshot).
