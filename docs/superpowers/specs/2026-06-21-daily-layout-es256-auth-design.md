# Daily Layout and ES256 Authentication Design

## Goal

Remove the nested-card overlap from Daily Rewards and ensure production economy claims accept Supabase ES256 access tokens.

## Daily Rewards Layout

- Keep three equal action panels on desktop and one column on mobile.
- Replace bordered `RewardChip` components inside each panel with an unframed icon, title, and detail header.
- Allow detail text to wrap within its own panel.
- Give all three panels equal height and align their primary action buttons at the bottom.
- Keep the odds as three compact cells inside Lucky Draw because they are data items, not nested section cards.

## Authentication

- Continue verifying modern Supabase ES256 tokens locally through the project JWKS endpoint.
- Keep HS256 support for legacy tokens and local tooling.
- Add a Worker-boundary test proving an ES256 bearer token reaches a protected economy route when `SUPABASE_URL` is configured.
- Redeploy the tested Worker so production no longer runs the older HS256-only verifier.

## Verification

- Run focused Daily Rewards layout tests and Worker ES256 authentication tests red then green.
- Run complete web, server, and Worker tests plus production builds.
- Verify the Daily Rewards page at desktop and mobile sizes.
- Smoke the deployed health endpoint and an authenticated economy request.
