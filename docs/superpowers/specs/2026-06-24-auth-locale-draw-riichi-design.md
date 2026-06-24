# Auth, Locale, Draw, and Riichi Design

## Goals

1. Make production magic links return to the deployed app.
2. Repair the complete Simplified Chinese locale and prevent mojibake regressions.
3. Replace the casual raw-tile-count draw tiebreak with hand-progress evaluation.
4. Replace the existing label-only Riichi Beta with a rules-isolated WRC 2025 Riichi implementation.

## Delivery Boundaries

The work ships in three independently testable slices:

1. Production auth and locale correctness.
2. Old Hong Kong exhaustive-draw policy.
3. Riichi rules, scoring, match progression, UI, bots, and replay support.

Old Hong Kong and Riichi share tile primitives and rendering, but not scoring or settlement policy.

## Production Auth

The web client sends magic links back to `window.location.origin`, never a URL containing a stale hash, token, query, or local route. Supabase remains the authority for allowed redirects.

Production dashboard configuration:

- Site URL: `https://mahjong-party.youraimates.workers.dev`
- Redirect allowlist: `https://mahjong-party.youraimates.workers.dev/**`
- Local allowlist: `http://localhost:5173/**` and `http://127.0.0.1:5173/**`

A regression test proves the browser redirect helper strips path, query, and hash state.

## Locale Repair

The entire `zh` dictionary is restored as valid UTF-8 Simplified Chinese, including the language name `中文`. English and Indonesian remain unchanged.

Tests will:

- Assert representative navigation, gameplay, tutorial, economy, and settings translations.
- Reject common mojibake markers in every Chinese value.
- Assert all locale dictionaries contain the same key set.

## Old Hong Kong Exhaustive Draws

Raw concealed tile count is not a valid progress metric because open Chi, Pong, and Kong calls reduce that count.

For friendly and practice tables:

- Calculate each hand's minimum shanten across standard four-meld-and-pair, seven pairs, and thirteen orphans where eligible.
- Account for already-open melds in standard-hand shanten.
- A unique lowest-shanten player receives the existing friendly progress award.
- Equal lowest shanten remains a draw with zero settlement.
- Result copy says this is a casual progress tiebreak, not a Mahjong win.

For Old Hong Kong coin tables:

- Exhaustion is always a draw.
- No wallet mutation occurs.

## Riichi Rules Baseline

Riichi follows World Riichi Championship Rules 2025 rather than reusing Old Hong Kong fan scoring.

Baseline decisions:

- Four players, 136 tiles, no flowers/seasons, no red fives.
- One ron winner, resolved by turn priority.
- Open tanyao and ato-zuke are allowed; kuikae is forbidden.
- No abortive draws and no nagashi mangan.
- Initial, kan, ura, and kan-ura dora are supported; dora never supplies the required yaku.
- Riichi, double riichi, ippatsu, furiten, temporary furiten, and riichi furiten are enforced.
- Concealed, promoted, and open kans use replacement draws and correct dora timing; robbing a promoted kan is supported.
- Winning requires at least one yaku.
- Han, fu, mangan/haneman/baiman/sanbaiman/yakuman limits, dealer/non-dealer ron, and tsumo payments are implemented.
- Exhaustive draws use the 3,000-point tenpai/noten exchange.
- Dealer continues on a win or tenpai draw; honba and riichi deposits carry correctly.
- A hanchan starts at 30,000 points and runs East and South rounds with WRC end conditions and uma.

The UI must not call this mode complete until these rules pass their golden tests. During development it remains `Riichi Beta` and friendly-only.

Source baseline:

- https://www.worldriichi.org/wrc-rules
- https://www.worldriichi.org/s/WRC-Rules-2025-42fx.pdf
- https://www.worldriichi.org/s/WRC-Scoring-Table-2025.pdf

## Architecture

`game-core` gains a mode-independent tile/decomposition layer and a Riichi-specific module containing:

- Shanten and wait evaluation.
- Yaku eligibility and hand closure state.
- Furiten and riichi state transitions.
- Dora indicator mapping.
- Fu and payment calculation.
- Exhaustive-draw settlement and round progression.

The existing Old Hong Kong scorer remains unchanged except that its friendly draw adapter consumes the shared shanten evaluator.

Match snapshots add discriminated mode state. Audit events record riichi declarations, deposits, dora reveals, kans, furiten-relevant passes, wins, exhaustive draws, and round advancement. Replay must reconstruct identical points, wall, indicators, and player state from seed plus decisions.

The server and Durable Object remain authoritative. Clients submit only legal action intents and render redacted snapshots.

## UI and Bots

Riichi tables show:

- Player points, dealer marker, round/hand, honba, and riichi-stick pool.
- Dora indicators and dead-wall state.
- A gated Riichi action with valid discard choices.
- Riichi discard orientation and clear furiten/error feedback.
- End-of-hand yaku, han, fu, dora, payments, and tenpai/noten results.

Bots use shanten, ukeire, safe-tile, riichi, and basic defense heuristics. They must obey furiten, locked-hand, and kan restrictions.

## Economy and Ads

Riichi remains friendly-only until deterministic settlement, reconnect, replay, and live multiplayer QA pass. Old Hong Kong coin behavior is unchanged.

Rewarded ads remain disabled. No client-side claim may masquerade as a verified advertisement reward; enabling ads requires a provider with server-verifiable completion callbacks and replay protection.

## Verification

- Test-first unit coverage for shanten, waits, every supported yaku, fu, limits, dora, furiten, kans, and draw settlement.
- Golden scoring cases cross-checked against the WRC 2025 scoring table.
- Property tests for 136-tile conservation and zero-sum point movement.
- Deterministic audit/replay tests.
- Server tests for action legality and redacted snapshots.
- Browser tests for magic-link redirect generation, locale rendering, Riichi controls, and result screens.
- Desktop/mobile visual checks for the Pixi board.
- Full monorepo tests, Cloudflare dry run, production deploy, live smoke, and Git push.

## Non-Goals

- Three-player sanma.
- Red fives or house-rule toggles.
- Chombo and physical tournament penalty administration.
- Real-money play or cash value.
- Rewarded-ad monetization in this release.
