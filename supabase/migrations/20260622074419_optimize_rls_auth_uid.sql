alter policy "profiles_select_own"
on public.profiles
to authenticated
using (user_id = (select auth.uid()));

alter policy "profiles_update_own_safe_fields"
on public.profiles
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy "wallets_select_own"
on public.wallets
to authenticated
using (user_id = (select auth.uid()));

alter policy "ledger_select_own"
on public.economy_ledger
to authenticated
using (user_id = (select auth.uid()));

alter policy "inventory_select_own"
on public.inventory
to authenticated
using (user_id = (select auth.uid()));

alter policy "daily_state_select_own"
on public.daily_state
to authenticated
using (user_id = (select auth.uid()));

alter policy "match_players_select_own"
on public.match_players
to authenticated
using (user_id = (select auth.uid()));

alter policy "match_history_select_participant"
on public.match_history
to authenticated
using (
  exists (
    select 1
    from public.match_players
    where match_players.match_id = match_history.match_id
      and match_players.user_id = (select auth.uid())
  )
);

alter policy "daily_mission_progress_select_own"
on public.daily_mission_progress
to authenticated
using (user_id = (select auth.uid()));
