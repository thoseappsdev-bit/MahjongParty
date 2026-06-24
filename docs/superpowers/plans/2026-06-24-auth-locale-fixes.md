# Production Auth and Locale Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supabase magic links return to the current deployment and restore every Simplified Chinese UI string as valid UTF-8.

**Architecture:** A pure redirect helper supplies only the browser origin to Supabase, while dashboard allowlisting remains an operational requirement. Locale repair is performed in the source dictionary and guarded by key-parity and mojibake tests.

**Tech Stack:** TypeScript 6, React 19, Supabase JS, Vitest, pnpm.

## Global Constraints

- Never expose a Supabase service-role key or Turnstile secret to browser code.
- Preserve English and Indonesian translations.
- Production redirect origin is `https://mahjong-party.youraimates.workers.dev`.
- Local development origins are `http://localhost:5173` and `http://127.0.0.1:5173`.
- Follow test-first red-green-refactor and commit each task separately.

---

### Task 1: Origin-Only Magic-Link Redirect

**Files:**
- Create: `apps/web/src/auth/authRedirect.ts`
- Create: `apps/web/src/auth/authRedirect.test.ts`
- Modify: `apps/web/src/App.tsx:454-456`
- Modify: `docs/production-release.md`

**Interfaces:**
- Produces: `authRedirectUrl(location: Pick<Location, "origin">): string`
- Consumed by: `App.handleSendMagicLink`

- [ ] **Step 1: Write the failing redirect test**

```ts
import { describe, expect, it } from "vitest";
import { authRedirectUrl } from "./authRedirect";

describe("authRedirectUrl", () => {
  it("returns only the current origin", () => {
    expect(authRedirectUrl({ origin: "https://mahjong-party.youraimates.workers.dev" })).toBe(
      "https://mahjong-party.youraimates.workers.dev",
    );
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @mahjong/web exec vitest run src/auth/authRedirect.test.ts`

Expected: FAIL because `./authRedirect` does not exist.

- [ ] **Step 3: Implement the pure helper and wire App**

```ts
export function authRedirectUrl(location: Pick<Location, "origin">): string {
  return location.origin;
}
```

In `App.tsx`, replace `window.location.href` with `authRedirectUrl(window.location)`. Document the exact Supabase Site URL and redirect allowlist from the design spec.

- [ ] **Step 4: Verify focused and existing auth tests**

Run: `pnpm --filter @mahjong/web exec vitest run src/auth/authRedirect.test.ts src/auth/supabaseAuth.test.ts src/auth/initSupabaseAuth.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/auth apps/web/src/App.tsx docs/production-release.md
git commit -m "fix: use production origin for magic links"
```

### Task 2: Repair Simplified Chinese Source Encoding

**Files:**
- Modify: `packages/i18n/src/index.ts:184-324,519-521`
- Modify: `packages/i18n/src/index.test.ts`

**Interfaces:**
- Preserves: `t(locale: LocaleCode, key: string): string`
- Preserves: `localeName(locale: LocaleCode): string`

- [ ] **Step 1: Add failing key-parity and mojibake tests**

```ts
import { dictionariesForTesting, localeName, t } from "./index";

it("ships the same translation keys in every locale", () => {
  expect(Object.keys(dictionariesForTesting.zh).sort()).toEqual(Object.keys(dictionariesForTesting.en).sort());
  expect(Object.keys(dictionariesForTesting.id).sort()).toEqual(Object.keys(dictionariesForTesting.en).sort());
});

it("contains no Chinese mojibake", () => {
  const text = Object.values(dictionariesForTesting.zh).join("\n");
  expect(text).not.toMatch(/[\u00c3\u00c2\u00e6\u00e5\u00e8\u00e7\u00e9\u00e4\u00ef]/u);
  expect(localeName("zh")).toBe("ä¸­æ–‡");
  expect(t("zh", "settings.language")).toBe("è¯­è¨€");
  expect(t("zh", "match.discard")).toBe("æ‰“å‡º");
  expect(t("zh", "daily.title")).toBe("æ¯æ—¥å¥–åŠ±");
});
```

Export `dictionaries` under the test-only neutral name `dictionariesForTesting` without changing runtime lookup behavior.

- [ ] **Step 2: Run the i18n test and verify RED**

Run: `pnpm --filter @mahjong/i18n test`

Expected: FAIL on mojibake and `localeName("zh")`.

- [ ] **Step 3: Mechanically restore the corrupted block**

Decode only corrupted string literals inside the `zh` dictionary from Windows-1252 bytes to UTF-8, leaving `\u` escapes, template placeholders, English product names, and other locale blocks unchanged. Review the resulting diff line by line, then set:

```ts
export const dictionariesForTesting = dictionaries;

export function localeName(locale: LocaleCode): string {
  return { en: "English", zh: "ä¸­æ–‡", id: "Indonesia" }[locale];
}
```

- [ ] **Step 4: Verify locale tests and package build**

Run: `pnpm --filter @mahjong/i18n test && pnpm --filter @mahjong/i18n build`

Expected: all tests pass and TypeScript builds.

- [ ] **Step 5: Commit**

```bash
git add packages/i18n/src/index.ts packages/i18n/src/index.test.ts
git commit -m "fix: restore Chinese translations"
```

### Task 3: Production Verification

**Files:**
- Modify only if a gate exposes a defect.

**Interfaces:**
- Consumes the completed auth and locale tasks.

- [ ] **Step 1: Run the monorepo gates**

Run: `pnpm test && pnpm build && pnpm production:check && pnpm check:cloudflare`

Expected: every command exits 0.

- [ ] **Step 2: Deploy and smoke-test**

Run: `pnpm deploy:cloudflare`

Run: `pnpm production:smoke -- https://mahjong-party.youraimates.workers.dev`

Expected: health is OK with `authMode: "jwt"`, `economyMode: "supabase"`, and `turnstileMode: "configured"`.

- [ ] **Step 3: Manual magic-link check**

Request a new email from the deployed Settings screen. Expected destination starts with `https://mahjong-party.youraimates.workers.dev`, never `localhost:3000`.

- [ ] **Step 4: Push**

```bash
git push origin main
git ls-remote origin refs/heads/main
```

Expected: remote SHA equals local `HEAD`.
