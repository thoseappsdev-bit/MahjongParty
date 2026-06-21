# CONTRACTS — the shared boundaries (read before coding any phase)

This is the **keystone** doc. Every team codes against these typed boundaries, not against each
other's implementations. **Do not change a contract without updating this file and pinging the
affected teams.** If a contract is missing something you need, propose the addition here first.

Contracts live in code under `packages/shared-types/` (network protocol, economy, account) and
`game-core/types.ts` (engine types). The signatures below are the agreement; the phase docs implement them.

---

## 1. game-core public API (`game-core/index.ts`)

Consumed by `server/` (authoritative) and `apps/web/` (prediction/replay). **Pure & deterministic.**

```ts
// ---- Tile model ----
export type Tile = number;        // 0..143  unique physical tile id (drives wall/shuffle/audit)
export type TileKind = number;    // 0..41   face identity (used by hands/melds/scoring)
export type TileCounts = Int8Array; // length 34, per-kind counts of a concealed hand (bonus excluded)

export type Seat = 0 | 1 | 2 | 3;          // 0=E 1=S 2=W 3=N
export type Wind = 'E' | 'S' | 'W' | 'N';

// ---- Tiles (tiles.ts) ----
export function kindOf(tile: Tile): TileKind;
export function spriteKey(kind: TileKind): string;   // e.g. 'm1','s9','we','dr','f1','t4'  (sprite/atlas key)
export function codeToKind(code: string): TileKind;
export function suitOf(kind: TileKind): 'man'|'sou'|'pin'|'honor'|'bonus';
export function rankOf(kind: TileKind): number;       // 1..9 for suits, else 0
export function isHonor(kind: TileKind): boolean;
export function isTerminal(kind: TileKind): boolean;
export function isBonus(kind: TileKind): boolean;

// ---- RNG (rng.ts) — seeded, reproducible ----
export interface Rng { nextInt(maxExclusive: number): number; cursor: number; }
export function createRng(seed: string, cursor?: number): Rng;

// ---- Settings ----
export interface MatchSettings {
  mode: '1-fan' | '3-fan';
  baseUnit: number;                 // coin base unit for settlement (0 for friendly tables)
  fanToMultiplier: number[];        // index by fan -> multiplier; e.g. [..,/*3*/1,2,4,8,16]
  fanCap: number;                   // cap fan before multiplier lookup (16 or 32)
  selfDrawPaysAll: boolean;         // default true
  discarderPaysAll: boolean;        // default true
  allowSevenPairs: boolean;
  turnTimeoutMs: number;
  claimTimeoutMs: number;
}

// ---- State lifecycle (match-state.ts / resolve-action.ts) ----
export function createInitialMatchState(seed: string, settings: MatchSettings, seats: SeatSetup[]): MatchState;
export function resolveAction(state: MatchState, action: Action): MatchState; // THE reducer; illegal => unchanged state
export function legalActions(state: MatchState, seat: Seat): Action[];
export function redactForSeat(state: MatchState, seat: Seat): ClientView;     // strip secrets for one seat
export function replay(seed: string, settings: MatchSettings, seats: SeatSetup[], actions: Action[]): MatchState;

// ---- Win / scoring (win-detection.ts / scoring.ts) ----
export function checkWin(counts: TileCounts, melds: Meld[], ctx: WinContext): WinResult;
export function waitingTiles(state: MatchState, seat: Seat): TileKind[];
export function scoreHand(win: WinResult, ctx: WinContext, settings: MatchSettings): HandResult;

// ---- Bot + simulation (bot-ai.ts / simulate.ts) ----
export function botDecide(state: MatchState, seat: Seat): Action;
export function simulateHand(seed: string, settings: MatchSettings): { result: HandResult | null; log: Action[] };
```

### Engine value types (`game-core/types.ts`)

```ts
export interface SeatSetup { seat: Seat; userId: string; displayName: string; isBot: boolean; }

export type MeldType = 'chow'|'pung'|'kong-exposed'|'kong-concealed'|'kong-added';
export interface Meld {
  type: MeldType; kinds: TileKind[]; tiles: Tile[];
  claimedFrom: Seat | null; claimedTileIndex: number | null;
}

export interface PlayerState {
  seat: Seat; seatWind: Wind;
  concealed: Tile[];                 // SECRET to other seats
  melds: Meld[]; discards: Tile[]; bonus: Tile[];   // public
  isBot: boolean; connected: boolean; userId: string; displayName: string;
}

export type ClaimIntent =
  | { kind: 'chow'; tiles: [Tile,Tile] }   // the two from hand that complete the run
  | { kind: 'pung' }
  | { kind: 'kong' }
  | { kind: 'win' };

export interface ClaimWindow {
  discardedTile: Tile; discardedBy: Seat; deadline: number;     // server ms clock
  pending: Partial<Record<Seat, ClaimIntent | 'pass' | null>>;
}

export type MatchPhase = 'idle'|'dealing'|'playing'|'claim-window'|'scoring'|'complete';
export type TurnPhase = 'draw'|'discard';

export interface MatchState {
  phase: MatchPhase; mode: '1-fan'|'3-fan'; settings: MatchSettings;
  matchSeed: string; rngCursor: number;                 // SECRET during play; released at hand end
  wall: Tile[]; deadWall: Tile[];                        // SECRET
  wallCount: number;                                    // broadcast
  prevailingWind: Wind; dealer: Seat; handNumber: number;
  turn: Seat; turnPhase: TurnPhase;
  players: [PlayerState,PlayerState,PlayerState,PlayerState];
  claim: ClaimWindow | null; lastDiscard: { tile: Tile; by: Seat } | null;
  result: HandResult | null; log: Action[];             // append-only, replay/audit
}

export type Action =
  | { type:'startHand' }
  | { type:'draw'; by:Seat }
  | { type:'drawReplacement'; by:Seat }
  | { type:'discard'; by:Seat; tile:Tile }
  | { type:'declareConcealedKong'; by:Seat; kind:TileKind }
  | { type:'declareAddedKong'; by:Seat; tile:Tile }
  | { type:'claim'; by:Seat; intent:ClaimIntent }
  | { type:'pass'; by:Seat }
  | { type:'resolveClaims' }
  | { type:'timeout'; at:number };

export interface WinContext {
  seatWind: Wind; prevailingWind: Wind;
  selfDraw: boolean; winningTile: TileKind; concealed: boolean;
  lastTile: boolean; robbedKong: boolean; bonusTiles: TileKind[];
}
export interface WinResult { won: boolean; decompositions: Decomposition[]; special?: 'thirteen-orphans'|'seven-pairs'; }
export interface Decomposition { melds: Meld[]; pair: TileKind; }

export interface ScoredPattern { id: string; nameKey: string; fan: number; }   // nameKey -> i18n
export interface HandResult {
  winner: Seat; byDiscardFrom: Seat | null;
  patterns: ScoredPattern[]; totalFan: number; cappedFan: number; limit: boolean;
  settlement: { perSeatDelta: [number,number,number,number] };  // INVARIANT: sums to 0
  seedReleased: string;                                         // for client audit/replay
}

// What a client is allowed to see. Other seats' concealed -> count only.
export interface ClientView {
  phase: MatchPhase; mySeat: Seat; turn: Seat; turnPhase: TurnPhase;
  prevailingWind: Wind; dealer: Seat; wallCount: number; handNumber: number;
  me: PlayerState;                                              // full concealed for my seat
  others: Array<Omit<PlayerState,'concealed'> & { concealedCount: number }>;
  claim: { discardedTile: Tile; discardedBy: Seat; deadline: number; myIntent: ClaimIntent|'pass'|null } | null;
  lastDiscard: { tile: Tile; by: Seat } | null;
  legalActions: Action[];                                       // precomputed for my seat
  result: HandResult | null;
}
```

---

## 2. Client ⇄ Server protocol (`packages/shared-types/protocol.ts`)

Transport = Colyseus. Two layers: Colyseus room **state** (synced via schema) and **messages**
(typed events). To keep `game-core` the single source of truth, the room broadcasts the
`ClientView` JSON per seat via a message rather than mirroring the whole engine into Colyseus schema.

```ts
// ---- Client -> Server (room messages) ----
export type ClientMessage =
  | { t:'intent'; action: Action }              // discard/claim/pass/kong/win — server validates
  | { t:'sit'; seat?: Seat }                     // take a seat in the waiting room
  | { t:'addBot'; seat: Seat }
  | { t:'startMatch' }                           // host only
  | { t:'rematch' }
  | { t:'emote'; id: string };

// ---- Server -> Client (room messages) ----
export type ServerMessage =
  | { t:'view'; view: ClientView }               // authoritative redacted state for THIS client
  | { t:'event'; event: GameEventLog }           // animation cues (draw, claim, win) — non-authoritative
  | { t:'lobby'; lobby: RoomLobbyState }          // seats/host/ready in waiting room
  | { t:'error'; code: string; messageKey: string }
  | { t:'emote'; seat: Seat; id: string };

export interface GameEventLog { kind:'draw'|'discard'|'claim'|'kong'|'win'|'draw-exhausted'|'timeout'; seat: Seat; tile?: number; }

// ---- Room create/join options (Colyseus onCreate options) ----
export interface CreateRoomOptions {
  tableType: 'friendly'|'coin'|'quick';
  tier?: 'bamboo'|'jade'|'dragon'|'phoenix';     // for coin tables
  mode: '1-fan'|'3-fan';
  privacy: 'public'|'private';
  maxPlayers: number;                            // 2..4 (bots fill the rest)
  authToken: string;                             // Supabase JWT or platform initData token
}
export interface JoinRoomOptions { roomCode?: string; authToken: string; }

export interface RoomLobbyState {
  roomCode: string; hostUserId: string;
  seats: Array<{ seat: Seat; userId: string|null; displayName: string|null; isBot: boolean; ready: boolean }>;
  tableType: string; tier?: string; mode: string; buyIn: number;
}
```

**Auth handshake:** client passes `authToken` on join; server verifies it (Supabase JWT, or
Telegram/Discord platform token exchanged for a Supabase session) before seating. Unauthenticated
joins are rejected.

---

## 3. Economy contract (`packages/shared-types/economy.ts`)

Server-authoritative. Client calls these HTTP endpoints (or Colyseus messages); server mutates
Supabase via the **service role** and returns the new balances. Client NEVER writes wallet rows.

```ts
export type Currency = 'gems' | 'coins';
export interface Wallet { gems: number; coins: number; }
export type LedgerSource =
  | 'purchase' | 'coin-pack' | 'table-buyin' | 'table-settle'
  | 'daily-login' | 'rewarded-ad' | 'spin-wheel' | 'mission' | 'shop-spend' | 'admin';

export interface LedgerEntry {
  ledgerId: string; userId: string; currency: Currency; amount: number;   // signed
  source: LedgerSource; balanceBefore: number; balanceAfter: number; createdAt: string;
}

// ---- Endpoints (all require auth; all return updated wallet) ----
// POST /economy/daily/claim            -> { wallet, reward, streak }
// POST /economy/ad/reward {slot}       -> { wallet, reward }     (server caps 3/day)
// POST /economy/spin {ticketSource}    -> { wallet, reward, oddsShownAt }   (server rolls weighted)
// POST /economy/shop/buy {packId}      -> { wallet, granted }     (Gems->Coins, or cosmetic)
// POST /economy/purchase/verify {...}  -> { wallet }              (Stars/USD -> Gems; STUB in M1)
// GET  /economy/wallet                 -> { wallet }
// GET  /economy/catalog                -> { gemPacks, coinPacks, cosmetics, offers }   (from config)

export interface SpinReward { type:'coins'|'gems'|'fragment'|'chest'; amount:number; itemId?:string; }
```

**Closed-loop invariants (enforced server-side, non-negotiable):**
- Conversion is one-way: `Stars/USD → Gems → Coins`. Coins never convert back to anything.
- No player-to-player transfers. No negative balances (reject the mutation).
- Every balance change is exactly one `LedgerEntry` row with correct `balanceBefore/After`.
- A coin-table hand's settlement deltas sum to **0**.

---

## 4. Account / profile contract (`packages/shared-types/account.ts`)

```ts
export interface Profile {
  userId: string; platformId: string | null; displayName: string; avatar: string;
  accountLevel: number; accountXp: number; locale: 'en'|'zh'|'id'; createdAt: string;
}
export interface InventoryItem { itemId: string; itemType:'tile-set'|'table-skin'|'frame'|'emote'|'win-fx'|'title'; rarity:'common'|'rare'|'epic'|'legendary'; equipped: boolean; }
```

---

## 5. Design tokens contract (`packages/ui/tokens.ts`)

The art direction (spec §24): dark emerald, gold, wood, jade, warm lantern light. Renderer (P7)
and screens (P8/P9) both import these — single source of palette/spacing/typography.

```ts
export const tokens = {
  color: { emeraldDeep:'#0b3d2e', jade:'#1f8a5b', gold:'#d4af37', wood:'#6b4a2b',
           lantern:'#ffcf73', ink:'#13201a', cream:'#f5ecd8', danger:'#c0392b' },
  radius: { sm:6, md:12, lg:20 },
  space:  [0,4,8,12,16,24,32,48],
  font:   { display:'"Noto Serif SC", serif', body:'"Inter", "Noto Sans SC", sans-serif' },
  tile:   { aspect: 0.74, minReadablePx: 34 },   // spec: tiles readable at 30-40px
} as const;
```

> Note `Noto Sans/Serif SC` for Mandarin glyph coverage; Latin/Indonesian via Inter.

---

## 6. Stub-first integration rules

- **Server (P6) before game-core lands:** import the `game-core` API surface; back it with a tiny
  stub module that returns canned `MatchState`/`ClientView` so room/timer/seating logic is built and
  tested. Swap to the real package when P4/P5 land — no signature changes.
- **Client (P7/P8) before server lands:** drive screens from a `MockGameRoom` emitting `ServerMessage`s
  and a `mockEconomy` returning canned wallets. Swap to the real Colyseus client behind the same
  `useGameRoom()` / economy-client interface.
- **Economy (P10) before server lands:** build SQL + RLS + endpoint handlers against the contract;
  test with the Supabase local stack independently.

Keep all cross-team types in `packages/shared-types/` and `game-core/types.ts`. If two phases need a
type, it lives in shared-types, never duplicated.
