# Discord Activity Readiness

This project can now run in three related modes:

- Normal browser prototype: web on `5173`, API on `8787`.
- Local Wi-Fi prototype: friends join `http://<host-ip>:5173` and use a room code.
- Discord Activity prototype: Discord launches the web app in an iframe, and the app uses the Discord `instance_id` to join/create one shared Mahjong room for everyone in the same Activity instance.

## Official Docs Studied

- Building your first Activity: https://docs.discord.com/developers/activities/building-an-activity
- Local development and URL mappings: https://docs.discord.com/developers/activities/development-guides/local-development
- Networking and proxy constraints: https://docs.discord.com/developers/activities/development-guides/networking
- Multiplayer instance behavior: https://docs.discord.com/developers/activities/development-guides/multiplayer-experience
- Production readiness: https://docs.discord.com/developers/activities/development-guides/production-readiness

## Exact Discord Setup Checklist

1. Open https://discord.com/developers/applications and create/select the Mahjong Party app.
2. Copy **OAuth2 > Client information > Client ID** into both env files:

```env
VITE_DISCORD_CLIENT_ID=your_client_id_here
```

3. Click **Reset Secret** or **Copy** under **OAuth2 > Client information > Client Secret** and put it only in the root server env:

```env
DISCORD_CLIENT_SECRET=your_client_secret_here
```

4. Under **OAuth2 > Redirects**, add:

```text
https://127.0.0.1
```

The Discord Activity SDK handles the real redirect flow from inside Discord; this placeholder redirect is the local setup Discord documents for embedded Activities.

5. Under **Activities > Settings**, enable Activities and select the desktop/mobile platforms you want to test.
6. Run the local app:

```powershell
pnpm dev:lan
```

7. Create a public HTTPS URL. The simplest local Activity tunnel is one tunnel to Vite because Vite proxies `/api` to the local server:

```powershell
cloudflared tunnel --url http://localhost:5173
```

8. Copy the generated `https://...trycloudflare.com` host. In **Activities > URL Mappings**, add:

```text
Prefix: /
Target: your-generated-host.trycloudflare.com
```

Do not include `https://` in the URL Mapping target.

9. In Discord, enable Developer Mode, join a test server voice/text channel, open the App Launcher, and launch the Activity.

If the `/api` calls do not reach the server through the Vite proxy in your environment, use the split-tunnel fallback: tunnel `5173` and `8787`, then map `/` to the web tunnel host and `/api` to the API tunnel host.

## Environment

Copy `.env.example` to `.env` for the API process and `apps/web/.env.example` to `apps/web/.env` for Vite.

Required for SDK handshake:

```env
VITE_DISCORD_CLIENT_ID=
```

Required for OAuth token exchange:

```env
DISCORD_CLIENT_SECRET=
```

Optional later, for server-side Activity Instance verification before wider public testing:

```env
DISCORD_BOT_TOKEN=
```

Do not commit real `.env` files. `VITE_DISCORD_CLIENT_ID` is public client code configuration; the client secret and bot token are server-only.

## Server-Side Art Keys

The backend loads the root `.env` only on the server. Do not put these keys in `apps/web/.env`.

Supported OpenAI key names:

```env
OPENAI_API_KEY=
CHATGPT_API_KEY=
```

Supported fal key names:

```env
FAL_KEY=
FAL_AI_API_KEY=
fal_ai_api_key=
```

The server exposes provider-safe status at `GET /api/assets/providers`; it returns booleans only and never returns key values.

## Local Discord Test Shape

Run the local stack:

```powershell
pnpm dev:lan
```

Create a tunnel for Discord URL mappings. The docs use `cloudflared`; replace the generated domain below with the value from your terminal.

```powershell
cloudflared tunnel --url http://localhost:5173
```

In Discord Developer Portal:

- Enable Developer Mode in your Discord client.
- Create/select an app and enable Activities.
- Add placeholder OAuth redirect URI: `https://127.0.0.1`.
- Set supported platforms for the clients you want to test.
- URL mappings:
  - `/` -> your web tunnel host, without `https://`

Discord URL mapping targets must omit the protocol, and more specific mappings should appear before shorter overlapping mappings.

## Implemented Prototype Behavior

- `apps/web/src/discord/discordActivity.ts` detects Discord launch query params before constructing `DiscordSDK`, so normal browser mode does not break.
- Discord mode uses `VITE_DISCORD_CLIENT_ID` and waits for `sdk.ready()`.
- The lobby shows `Sign in with Discord` only when the app was launched by Discord and the SDK is ready.
- Sign-in runs `authorize -> POST /api/discord/token -> authenticate`, then maps the Discord user to the prototype profile.
- The app reads `sdk.instanceId` and shows Activity status on the home screen.
- `Join Discord Table` appears after sign-in and calls `POST /api/discord/rooms`.
- The server derives a deterministic 6-character room code from `instanceId`, so users in the same Discord Activity instance land in the same Mahjong room.
- `POST /api/discord/token` is present for OAuth code exchange, but returns a clear config error until `VITE_DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` exist on the server.

## Current Gaps

- Discord OAuth requires real Developer Portal credentials in `.env`; without them, the UI shows a config error instead of opening a usable sign-in.
- Participant updates are fetched once; live participant subscribe is not used yet.
- The prototype still polls room state over HTTP. Discord supports WebSockets, so the next production multiplayer step should replace polling with a realtime transport.
- The server has no Activity Instance API lock-down yet. Before public testing, verify `instance_id` server-side with Discord using the bot token.
- No rich presence setup yet.

## Validation Commands

```powershell
pnpm --filter @mahjong/web lint
pnpm --filter @mahjong/web test
pnpm --filter @mahjong/server test
pnpm -r test
pnpm -r build
node .\scripts\verify-prototype.mjs
node .\scripts\verify-lan.mjs
```
