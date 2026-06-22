drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own_safe_fields" on public.profiles;
drop policy if exists "wallets_select_own" on public.wallets;
drop policy if exists "ledger_select_own" on public.economy_ledger;
drop policy if exists "inventory_select_own" on public.inventory;
drop policy if exists "daily_state_select_own" on public.daily_state;
drop policy if exists "match_players_select_own" on public.match_players;
drop policy if exists "match_history_select_participant" on public.match_history;
drop policy if exists "daily_mission_progress_select_own" on public.daily_mission_progress;

revoke select on public.profiles from authenticated;
revoke update (display_name, avatar, locale) on public.profiles from authenticated;
revoke select on public.wallets from authenticated;
revoke select on public.economy_ledger from authenticated;
revoke select on public.inventory from authenticated;
revoke select on public.daily_state from authenticated;
revoke select on public.match_history from authenticated;
revoke select on public.match_players from authenticated;
revoke select on public.daily_mission_progress from authenticated;

-- The Cloudflare Worker owns all production data access through service-role RPCs.
-- Browser clients keep only Supabase Auth access, not direct table access.
