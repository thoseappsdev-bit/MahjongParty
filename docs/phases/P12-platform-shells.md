# P12 — Platform Shells (PWA / Telegram / Discord / Capacitor)

**Track:** Cross-cutting (Team F) · **Depends on:** P0 (apps/web boots), benefits from P8 · **Parallel with:** everything · **Size:** M

## Goal
Wrap the single `apps/web` build for all four channels via **thin adapters** behind one `platform`
interface, so app/screen code stays platform-agnostic. M1 = adapters initialize cleanly and provide auth +
share + haptics; full Stars/IAP billing is finalized in a later milestone.

## Deliverables
```
apps/web/src/platform/index.ts          # detectPlatform() + the Platform interface
apps/web/src/platform/web.ts            # PWA: manifest, service worker, install
apps/web/src/platform/telegram.ts       # Telegram WebApp SDK adapter
apps/web/src/platform/discord.ts        # Discord Embedded App SDK adapter
apps/web/src/platform/capacitor.ts      # Capacitor (haptics, safe-area, store billing stub)
apps/web/public/manifest.webmanifest + service-worker
capacitor.config.ts                     # Capacitor project config (iOS/Android)
apps/web/src/platform/README.md
```

## Detailed spec
- **`Platform` interface (single abstraction the app codes against):**
  ```ts
  interface Platform {
    id: 'web'|'telegram'|'discord'|'capacitor';
    getAuthToken(): Promise<string>;          // -> CreateRoom/Join authToken
    share(payload: {text:string; url:string}): Promise<void>;   // room-link sharing
    purchase(packId: string): Promise<{ok:boolean}>;            // Stars/IAP — STUB in M1
    haptic(kind:'light'|'medium'|'success'|'error'): void;
    safeAreaInsets(): {top:number;bottom:number;left:number;right:number};
  }
  ```
- **Web/PWA:** `manifest.webmanifest` (name, icons, theme color = emerald), service worker for offline asset cache,
  installability. `getAuthToken` → Supabase web session; `share` → Web Share API / copy link.
- **Telegram Mini App:** load Telegram WebApp SDK; read `initData`, theme params, viewport; `getAuthToken` exchanges
  `initData` for a Supabase session **server-side** (P6 auth); `share` → `switchInlineQuery`/share-to-chat; `purchase`
  → Telegram Stars invoice (stub). Apply Telegram safe areas + theme.
- **Discord Activity:** Discord Embedded App SDK; iframe auth (`authenticate`); launch in channel/voice context;
  `getAuthToken` → exchange for Supabase session server-side; `share` → channel message. Server-side game authority unchanged.
- **Capacitor (iOS/Android):** `@capacitor/core` + `cli`, `npx cap add ios/android`; wrap the built web app; bundle assets
  offline; `haptic` via Haptics plugin; `safeAreaInsets` native; `purchase` → store billing adapter (stub M1).
  Apple note (spec/skill): must feel native (offline assets, haptics, polished UI), not a webview wrapper.
- **Wiring:** `detectPlatform()` picks the adapter at boot; `useGameRoom`/`economyClient` call `platform.getAuthToken()`/
  `platform.share()` — no platform branches in screens.

## Contracts
- **Consumes:** `CreateRoomOptions.authToken`/`JoinRoomOptions` (CONTRACTS §2), server auth handshake (P6).
- **Exposes:** the `Platform` interface used by P8 (`useGameRoom`, ShareSheet) and economy purchase flow.

## Acceptance criteria
- [ ] `detectPlatform()` selects the right adapter in web, Telegram, Discord, and Capacitor contexts.
- [ ] PWA installs (manifest + SW pass Lighthouse installability); offline asset cache works.
- [ ] Telegram + Discord adapters initialize their SDKs without errors and return a valid auth token that the server accepts.
- [ ] Capacitor iOS + Android projects build and launch the app; haptics + safe areas work on device/emulator.
- [ ] Screens contain **no** platform conditionals — all platform differences live in `platform/*`.
- [ ] `purchase()` stub returns a mock success and the economy `purchase/verify` stub grants Gems (full billing deferred).
```
