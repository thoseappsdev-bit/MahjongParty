# P10 — Economy + Supabase

**Track:** Economy (Team E) · **Depends on:** P0, CONTRACTS · **Parallel with:** everything · **Size:** L

## Goal
The closed-loop economy: Supabase schema + RLS, the server-authoritative economy endpoints, and the
ledger that guarantees no negative balances, one-way conversion, and zero-sum table settlement. Build &
test against the Supabase local stack independently of the game server.

## Deliverables
```
supabase/migrations/0001_profiles.sql        # profiles + auto user-row trigger (mirror Junto)
supabase/migrations/0002_wallets_ledger.sql  # wallets, economy_ledger
supabase/migrations/0003_inventory.sql        # inventory
supabase/migrations/0004_match_history.sql    # match_history
supabase/migrations/0005_daily_state.sql      # daily_state
supabase/migrations/0006_rls.sql              # RLS policies (auth.uid()); service-role writes wallets/ledger
server/src/economy/endpoints.ts               # daily/claim, ad/reward, spin, shop/buy, purchase/verify(stub), wallet, catalog
server/src/economy/ledger.ts                  # mutate(): single-row, balance-checked, atomic
server/src/economy/settle.ts                  # settle(matchId, perSeatDelta) called by GameRoom
server/src/economy/config/{gemPacks,coinPacks,cosmetics,offers,spinWheel,dailyRewards}.json
server/test/economy.test.ts
```

## Detailed spec
- **Schema (CONTRACTS §3/§4):**
  - `profiles` (userId PK = auth.uid, platformId, displayName, avatar, accountLevel, accountXp, locale, createdAt).
    Trigger `handle_new_auth_user()` auto-creates a profile + zeroed wallet on `auth.users` insert (mirror
    `junto-mobile/supabase/migrations`).
  - `wallets` (userId PK, gems int, coins int) — **only** the service role may UPDATE.
  - `economy_ledger` (ledgerId, userId, currency, amount signed, source, balanceBefore, balanceAfter, createdAt).
  - `inventory`, `match_history`, `daily_state`.
- **RLS from day one:** users can `select` their own profile/wallet/ledger/inventory; **no** client write to wallets/
  ledger. All economy mutations go through the server (service role).
- **`ledger.mutate(userId, currency, amount, source)`** — the ONLY way balances change:
  - Read current balance → reject if it would go **negative** → write the new balance AND insert exactly one
    ledger row with correct `balanceBefore/After`, **atomically** (Postgres function / transaction).
- **`settle(matchId, perSeatDelta)`** — assert `sum===0`; apply one `mutate` per seat (`table-settle`); write `match_history`.
  Buy-in debit (`table-buyin`) happens when a player is seated at a coin table.
- **Endpoints (CONTRACTS §3, all auth-required, all return updated wallet):**
  - `daily/claim` (streak ladder from `dailyRewards.json`, 1/day), `ad/reward` (cap 3/day, escalating per `config`),
    `spin` (server rolls weighted odds from `spinWheel.json`; return `oddsShownAt`; virtual rewards only),
    `shop/buy` (Gems→Coins pack one-way, or cosmetic grant to inventory; deduct Gems via `mutate`),
    `purchase/verify` (**STUB** in M1: mock Stars/USD→Gems; real verification later), `wallet`, `catalog`.
- **Closed-loop guardrails (enforced here):** one-way Stars/USD→Gems→Coins; coins never convert back; no P2P transfer;
  no negative balances; odds disclosed; copy avoids gambling terms.

## Contracts
- **Consumes:** `Wallet, LedgerEntry, LedgerSource, Currency, SpinReward, Profile, InventoryItem` (CONTRACTS §3/§4).
- **Exposes:** the economy HTTP endpoints (client `economyClient`, P8) + `settle` (server GameRoom, P6).

## Acceptance criteria
- [ ] Migrations apply on a fresh Supabase local DB; new auth user auto-gets profile + zeroed wallet.
- [ ] RLS: a client JWT cannot UPDATE wallets/ledger; can only read its own rows (tested).
- [ ] `ledger.mutate` never produces a negative balance (rejects) and always writes exactly one correct ledger row.
- [ ] `settle` with deltas summing to 0 applies all four mutations atomically and writes match history.
- [ ] `daily/claim` respects 1/day + streak; `ad/reward` caps at 3/day; `spin` returns a weighted reward + odds timestamp.
- [ ] `shop/buy` converts Gems→Coins one-way and grants cosmetics; coins cannot convert back (no such endpoint exists).
- [ ] Catalog served from config JSON (no hardcoded prices in handlers).
