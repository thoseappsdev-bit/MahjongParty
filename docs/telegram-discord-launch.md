# Telegram and Discord Launch Notes

Mahjong Party is still a hosted web app. Telegram and Discord launch from the same Cloudflare Worker URL; no native app build is required for this release path.

## Telegram Mini App

Manual dashboard steps:

1. Create or open the bot in BotFather.
2. Configure the Mini App/Web App URL to the Cloudflare production URL.
3. Keep Supabase auth enabled; the Telegram display name is UI context, not the authoritative wallet identity.
4. Add a server-side Telegram initData verification endpoint before linking Telegram accounts or trusting Telegram user IDs for rewards.
5. Use Telegram Stars/invoices for real digital-goods Gem purchases. Do not grant Gems from a client-only purchase assertion.

Current implementation:

- `apps/web/src/telegram/telegramMiniApp.ts` detects `window.Telegram.WebApp`, calls `ready()`/`expand()`, applies dark host colors, and reads the launch display name.
- The lobby shows a Telegram launch status card.
- Wallets, rooms, and economy mutations still use Supabase JWT identity.

## Discord Activity

Manual dashboard steps:

1. Set the public Activity URL mapping to the Cloudflare Worker host.
2. Keep `VITE_DISCORD_CLIENT_ID` public in the web build.
3. Store `DISCORD_CLIENT_SECRET` only as a Worker secret.
4. Test inside Discord, not only in a browser, because the Embedded App SDK runs in the Activity iframe context.
5. Use Discord monetization/SKUs only after server-side receipt verification and idempotent fulfillment are implemented.

Current implementation:

- Discord Activity SDK detection and OAuth UI are wired.
- Discord OAuth exchanges happen through `/api/discord/token` on the Worker.
- Discord room creation derives the room code from `instanceId`.

## Monetization Posture

For this launch build:

- Lucky Draw is a capped server roll.
- Bonus Coins are a capped launch bonus, not a verified rewarded-ad callback.
- Gem packs are visible but disabled in the shop until Telegram Stars, Discord SKU, or Stripe receipt verification is added.
- Coin packs and cosmetics can still be bought with existing Gems.
