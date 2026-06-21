# P0 — Monorepo Scaffold

**Track:** Foundation · **Depends on:** — · **Blocks:** everything · **Size:** S (1 dev, ~0.5 day)

## Goal
Stand up the pnpm + Turborepo workspace with all packages/apps wired, TS strict, path aliases,
Vitest, and a green `pnpm -r build && pnpm -r test`. No game logic yet — just the skeleton every
other phase plugs into.

## Pre-step (RULE #1)
Run and record current stable versions before writing any `package.json`:
```bash
node -v   # need 20+
for p in vite @vitejs/plugin-react react react-dom typescript pixi.js zustand \
  colyseus @colyseus/core @colyseus/schema colyseus.js i18next react-i18next \
  @supabase/supabase-js vitest turbo @capacitor/core @capacitor/cli lucide-react \
  class-variance-authority @radix-ui/react-dialog; do
  printf "%-30s " "$p"; npm view "$p" version; done
```

## Deliverables (files)
```
package.json                      # workspaces + turbo scripts (build/test/dev/lint)
pnpm-workspace.yaml               # packages: game-core, packages/*, apps/*, server
turbo.json                        # pipeline: build, test, dev, lint
tsconfig.base.json                # strict + paths (@game/*,@/*,@shared/*,@ui/*)
.eslintrc.cjs + lint guard        # no-restricted-imports: game-core must not import frameworks
.gitignore .nvmrc .editorconfig
game-core/{package.json,tsconfig.json,index.ts,types.ts}        # exports stubs only
packages/shared-types/{package.json,tsconfig.json,index.ts}     # protocol/economy/account stubs
packages/ui/{package.json,tsconfig.json,index.ts,tokens.ts}     # tokens from CONTRACTS §5
packages/i18n/{package.json,tsconfig.json,index.ts}             # i18next init stub
apps/web/{package.json,vite.config.ts,tsconfig.json,index.html,src/main.tsx,src/App.tsx}
server/{package.json,tsconfig.json,src/index.ts}                # Colyseus boot stub
supabase/.gitkeep
```

## Detailed spec
- **pnpm-workspace.yaml** lists `game-core`, `packages/*`, `apps/*`, `server`.
- **tsconfig.base.json** holds the compiler options from `CONVENTIONS.md` + the path aliases; every
  package `extends` it.
- **vite.config.ts** (apps/web): `@vitejs/plugin-react`, alias `@`→`/src`, `@game`→`/game-core`,
  `@shared`, `@ui`; `build.rollupOptions.output.manualChunks` splitting `react` and `pixi.js`.
- **game-core** has NO deps. Its `index.ts` re-exports from `types.ts`; functions are `throw new Error('not implemented')` stubs matching the `CONTRACTS.md §1` signatures so other packages typecheck.
- **server/src/index.ts**: minimal Colyseus server that boots on a port and logs "ready" (no rooms yet).
- **apps/web App.tsx**: renders "Mahjong Party" + a tokens smoke test (a gold-on-emerald box).
- **lint guard:** an `eslint` `no-restricted-imports` (patterns `react`,`pixi.js`,`colyseus`,`zustand`)
  scoped to `game-core/**`, OR a CI grep script `scripts/check-core-purity.sh`. Build must fail on violation.

## Contracts
- **Exposes:** the empty package boundaries + the stub signatures from `CONTRACTS.md §1–§5`. Get those
  type files committed verbatim so P1–P12 can import them immediately.

## Acceptance criteria
- [ ] `pnpm install` clean; Node 20+ enforced via `.nvmrc`/`engines`.
- [ ] `pnpm -r build` passes (stubs compile).
- [ ] `pnpm -r test` passes (one trivial test per package).
- [ ] `pnpm --filter @mahjong/web dev` serves the app; tokens smoke box renders.
- [ ] `pnpm --filter @mahjong/server dev` boots Colyseus and logs ready.
- [ ] Purity guard fails the build if `game-core` imports `react`/`pixi.js`/`colyseus`.
- [ ] All `CONTRACTS.md` type files exist and are imported by at least one consumer.
