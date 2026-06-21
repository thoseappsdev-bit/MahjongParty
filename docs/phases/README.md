# Phases Index

Read `../README.md` (overview + dependency graph) and `../CONTRACTS.md` (the shared boundaries) first.
Then pick up a phase. **P0 + CONTRACTS + CONVENTIONS land before anything else.**

| Phase | Title | Track | Depends on | Size |
|---|---|---|---|---|
| [P0](P0-scaffold.md) | Monorepo scaffold | Foundation | — | S |
| [P1](P1-game-core-tiles-wall-rng.md) | game-core: tiles, RNG, wall | A | P0 | S–M |
| [P2](P2-game-core-win-detection.md) | game-core: win detection | A | P1 | M |
| [P3](P3-game-core-scoring.md) | game-core: scoring + settlement | A | P1 | M |
| [P4](P4-game-core-state-actions-claims.md) | game-core: state/actions/claims (reducer) | A | P1,P2,P3 | L |
| [P5](P5-game-core-bot-simulate.md) | game-core: bot AI + simulate | A | P4 | M |
| [P6](P6-server-colyseus.md) | Colyseus authoritative server | B | P0 (+core later) | L |
| [P7](P7-client-pixi-board.md) | PixiJS board renderer | C | P0, P9 tokens | L |
| [P8](P8-client-screens.md) | React screens, stores, net | D | P0, P9 | L |
| [P9](P9-design-system-ui.md) | Design system + UI kit | F | P0 | M |
| [P10](P10-economy-supabase.md) | Economy + Supabase | E | P0 | L |
| [P11](P11-i18n.md) | i18n (en/zh/id) | F | P0 | S–M |
| [P12](P12-platform-shells.md) | Platform shells | F | P0 | M |

**Suggested team allocation (6 parallel tracks after P0):**
A = game-core (P1→P5, one focused dev/pair), B = server (P6), C = board (P7), D = screens (P8),
E = economy (P10), F = cross-cutting (P9 design → P11 i18n → P12 shells).
