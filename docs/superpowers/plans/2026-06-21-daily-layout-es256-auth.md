# Daily Rewards Layout and ES256 Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Daily Rewards stacked-card/overflow UI and ensure deployed Worker auth accepts Supabase ES256 tokens.

**Architecture:** Daily Rewards gets a local unframed card header instead of embedding the shared `RewardChip` component inside panels. Worker auth keeps HS256 support and verifies ES256 through the Supabase JWKS endpoint; the route-level test protects the deployed behavior.

**Tech Stack:** React, Vite, CSS, Vitest, Cloudflare Workers, Supabase Auth/JWKS.

---

### Task 1: Daily Rewards Layout Regression

**Files:**
- Create: `apps/web/src/screens/DailyRewards.layout.test.ts`
- Modify: `apps/web/src/screens/DailyRewards.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Write a failing static layout test that asserts `DailyRewards.tsx` no longer imports or renders `RewardChip`, and that `styles.css` contains wrapping/non-overlap rules for `.daily-card-header`, `.daily-card`, and `.odds-list span`.
- [ ] Run the focused web test and verify it fails because the current implementation still uses `RewardChip` and lacks the new layout classes.
- [ ] Replace the nested `RewardChip` usage with an unframed `DailyCardHeader` using lucide icons.
- [ ] Add CSS that stretches the three cards evenly, allows copy to wrap, keeps buttons at the bottom, and prevents odds cells from overflowing.
- [ ] Run the focused web test again and verify it passes.

### Task 2: Worker ES256 Route Regression

**Files:**
- Modify: `apps/worker/src/auth-route.test.ts`

- [ ] Add a Worker-boundary test that signs an ES256 JWT with a generated P-256 key, serves its public key through a mocked Supabase JWKS endpoint, and calls `/api/economy/wallet` with `Authorization: Bearer`.
- [ ] Run the focused Worker auth test. If it already passes, record that source already supports ES256 and deployment was stale; if it fails, update the smallest auth path needed.
- [ ] Re-run the focused Worker auth test until it passes.

### Task 3: Verification and Deploy

**Files:**
- No extra code files expected.

- [ ] Run relevant web and Worker focused tests.
- [ ] Run production build/check commands for the changed packages.
- [ ] Use Playwright screenshots to inspect Daily Rewards desktop and mobile.
- [ ] Deploy Cloudflare with `pnpm deploy:cloudflare`.
- [ ] Smoke `/api/health` and an authenticated economy request without printing secrets or tokens.
