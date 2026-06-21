# P5 — game-core: Bot AI + Simulation

**Track:** game-core (Team A) · **Depends on:** P4 · **Size:** M

## Goal
A competent, deterministic bot for "bot fill" and a headless simulator that runs full matches to
completion — used for testing, balancing, and as the engine's end-to-end stress harness.

## Deliverables
```
game-core/bot-ai.ts    + bot-ai.test.ts
game-core/simulate.ts  + simulate.test.ts
```

## Detailed spec

### bot-ai.ts — `botDecide(state, seat): Action`
Deterministic given `(state, seat, matchSeed)` — derive bot randomness from `createRng(matchSeed + ':' + seat + ':' + turn)`
so identical inputs ⇒ identical move (replayable). Uses P2 `shanten`/`waitingTiles`.
- **Discard:** for each candidate discard, compute resulting `shanten`; pick the minimizer. Tie-break:
  prefer isolated honors → isolated terminals → isolated simples, but **keep value honors** (seat/prevailing/
  dragon) when a pung is plausible; final tie-break by seeded roll.
- **Claims:** Win → always if it passes the gate. Pung/Kong → claim if it doesn't increase shanten and forms a
  value pung / reduces shanten / already pursuing All Pungs; concealed kong only if it doesn't break a wait.
  Chow → only from left seat, only if it reduces shanten and not pursuing All Pungs / a flush. Else Pass.
- A single `botSkill` knob scales aggressiveness/lookahead; default "competent".

### simulate.ts
- `simulateHand(seed, settings): { result, log }` — seat 4 bots, loop `botDecide → resolveAction` (incl.
  auto-pass/timeouts) until `phase==='complete'`. No exceptions, no infinite loops (guard max turns).
- `simulateMatches(seeds, settings)` helper aggregating stats (win rates, avg hand length, draw rate) for balancing.

## Contracts
- **Consumes:** P4 reducer + P2 shanten. **Exposes:** `botDecide, simulateHand` (completes CONTRACTS §1).

## Acceptance criteria
- [ ] Bot-vs-bot hands run to completion for N seeds with **zero exceptions**; wall never negative; hand sizes legal.
- [ ] **Determinism:** same seed ⇒ identical action log + identical settlement (golden snapshot).
- [ ] Per-step **tile conservation** holds throughout a simulated hand (all 144 accounted for, no dupes).
- [ ] Bots actually win sometimes (sanity: over N seeds, not 100% exhaustive draws) and respect the fan gate.
- [ ] CI soak: simulate ≥1000 seeds in 3-fan and 1-fan modes without error.
