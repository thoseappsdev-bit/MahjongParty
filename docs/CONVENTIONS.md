# CONVENTIONS — coding, testing, git, and reuse

Shared rules for every phase. Keep changes surgical and match existing style.

## Language & style
- **TypeScript strict** everywhere (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`).
- `moduleResolution: "bundler"`, `target: ES2022`.
- Path aliases: `@game/*` → `game-core/*`, `@/*` → app `src/*`, `@shared/*` → `packages/shared-types/*`,
  `@ui/*` → `packages/ui/*`.
- Prefer pure functions and immutable updates (spread). Reducers **early-return the unchanged state**
  on illegal input (never throw for expected illegal actions; throw only for true programmer bugs).
- No `any`. Use discriminated unions for actions/messages. No magic numbers — name fan values,
  timers, and economy amounts as named constants or load from config JSON.

## game-core purity (enforced)
- `game-core/` imports **nothing** from React, PixiJS, Colyseus, Zustand, Node, or the DOM.
- No `Date.now()`, `Math.random()`, timers, or I/O inside `game-core`. Randomness comes only from the
  seeded `Rng`. Time is passed in via action payloads (`timeout.at`) or settings.
- Add a lint guard (e.g. an `eslint` no-restricted-imports rule or a CI grep) failing the build if
  `game-core` imports a framework.

## Determinism
- Same `(seed, settings, actions)` ⇒ identical `MatchState` and `HandResult`. This is tested with
  golden snapshots. Anything that breaks reproducibility is a bug.

## Naming
- Files: kebab-case (`win-detection.ts`). Types/interfaces: PascalCase. Functions/vars: camelCase.
- i18n: never hardcode user-facing strings — use a key (`t('lobby.play')`). Engine returns `nameKey`s,
  not display text. Avoid gambling words anywhere in UI copy or keys (no bet/wager/casino/jackpot/
  high-roller). Use "table", "buy-in", "coins", "lucky draw".

## Testing (Vitest)
- Every `game-core` file ships with a co-located `*.test.ts`. Coverage targets: win-detection,
  scoring, claims, and the reducer must be exhaustive (see each phase's acceptance criteria).
- Server: integration test a full 4-bot headless match + illegal-action rejection.
- Run: `pnpm -r test`. CI must run `pnpm -r build && pnpm -r test`.

## Git / PR
- Small PRs scoped to one phase. Branch name `pNN-short-desc`.
- A PR may not change a `CONTRACTS.md` type without (a) updating CONTRACTS.md and (b) tagging affected teams.
- Each PR states which acceptance-criteria checkboxes it satisfies.
- Co-author trailer when committed by the agent: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Reuse map (copy patterns, not unrelated logic)
| Need | Reference (read, adapt — don't blind-copy) |
|---|---|
| Pure-TS reducer + seeded RNG (`deterministicRoll`) | `C:\Users\Lukma\Downloads\Mythological Tower Card Battler\pantheon-breach-web-spike\src\game\match.ts` |
| Turbo+pnpm monorepo (`packages/`+`apps/`) | `C:\Users\Lukma\Downloads\caelisia`, `C:\Users\Lukma\Downloads\VEDRA` |
| Supabase client + auth store + RLS migrations + auto user-row trigger | `C:\Users\Lukma\Downloads\Junto\Mobile_apps\junto-mobile\lib\supabase.ts`, `stores\authStore.ts`, `supabase\migrations\*` |
| i18next init + locale JSON (en/id; add zh) | `junto-mobile\lib\i18n.ts`, `locales\en.json`, `locales\id.json` |
| UI kit (Radix + CVA) + theme tokens | `caelisia\packages\ui\*`; `junto-mobile\constants\colors.ts`+`theme.ts` |
| Zustand store pattern | `caelisia\apps\mobile\stores\authStore.ts` |
| RevenueCat/IAP pattern (later milestone) | `junto-mobile\lib\revenueCat.ts` |

## Versions
Per web-game-stack RULE #1: run `npm view <pkg> version` for every dependency at scaffold time and
use current stable. Verify React 19 peer support before adding any UI lib. Do not trust version
numbers written in any doc.

## Definition of Done (per phase)
A phase is done when: its files exist, its tests pass, its acceptance-criteria checkboxes are ticked,
it builds clean in the monorepo, and it honors the contracts in `CONTRACTS.md` unchanged (or with an
agreed, documented change).
