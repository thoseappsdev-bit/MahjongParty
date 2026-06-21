# P9 — Design System + Shared UI Kit

**Track:** Cross-cutting (Team F) · **Depends on:** P0 · **Parallel with:** everything · **Size:** M

## Goal
The `packages/ui` component kit and design tokens that P7 (board) and P8 (screens) both consume, so the
product looks consistent and on-brand from day one. Art direction (spec §24): dark emerald, gold, wood,
jade, warm lantern light — premium, social, readable.

## Deliverables
```
packages/ui/tokens.ts        # the single source of palette/space/radius/font/tile (CONTRACTS §5) — finalize it here
packages/ui/theme.css        # CSS variables from tokens (light/dark/“lantern” theme)
packages/ui/tailwind-preset.ts (if Tailwind) OR styled primitives
packages/ui/primitives/{Button,Card,Dialog,BottomSheet,Tabs,Toast,Avatar,Badge,Pill,Input,Switch,Tooltip}.tsx
packages/ui/game/{CurrencyPill,RarityBadge,TableCard,RewardChip,OddsDisclosure}.tsx
packages/ui/index.ts
packages/ui/README.md        # usage + do/don't (no gambling visual language)
```

## Detailed spec
- Build on **Radix primitives + CVA** (class-variance-authority) — mirror `caelisia\packages\ui` structure.
  Check React 19 peer support (RULE #1).
- **Tokens** are the contract (CONTRACTS §5): emeraldDeep/jade/gold/wood/lantern/ink/cream/danger; radius sm/md/lg;
  space scale; fonts (`Noto Serif/Sans SC` for Mandarin coverage + Inter for Latin/Indonesian); `tile.aspect`,
  `tile.minReadablePx`. Expose as TS consts AND CSS variables so PixiJS (TS) and DOM (CSS) share them.
- **Primitives:** accessible, keyboard-navigable, themed; variants via CVA (`primary|secondary|outline|ghost|danger`,
  sizes `sm|md|lg`). `BottomSheet`/`Dialog` for mobile-first flows. `Toast` for server errors.
- **Game components:** `CurrencyPill` (Coins/Gems with icon), `RarityBadge` (common→legendary), `TableCard`
  (mode + fan + coin status + seats, per spec public-table card), `RewardChip`, `OddsDisclosure` (mandatory for
  spin/chest — odds shown before use).
- **Copy/visual guardrails:** no casino/slot imagery, no jackpot/bet/high-roller language; calm "Lucky Draw" styling.
- Ship a **Storybook or a `/kitchen-sink` route** so screens/board teams can see components without the app running.

## Contracts
- **Exposes:** `tokens` (finalized), `theme.css`, all primitives + game components consumed by P7 (tokens) and P8 (components).
- **Consumes:** nothing beyond P0.

## Acceptance criteria
- [ ] `tokens.ts` matches CONTRACTS §5 and is imported by both `apps/web` (PixiJS) and screens.
- [ ] All primitives render in the kitchen-sink/Storybook in light + dark/lantern themes; pass basic a11y (focus, roles, contrast).
- [ ] `TableCard`, `CurrencyPill`, `OddsDisclosure`, `RarityBadge` match the spec's screen map needs.
- [ ] Mandarin + Indonesian sample strings render with no missing glyphs (font stack verified).
- [ ] No casino/gambling visual or textual language anywhere in the kit (review checklist in README).
