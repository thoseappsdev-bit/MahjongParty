create or replace function public.is_non_anonymous_user()
returns boolean
language sql
stable
set search_path = public, auth
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and (select auth.uid()) is not null;
$$;

revoke all on function public.is_non_anonymous_user() from public;
grant execute on function public.is_non_anonymous_user() to authenticated;

alter policy "profiles_select_own"
on public.profiles
to authenticated
using (user_id = (select auth.uid()) and public.is_non_anonymous_user());

alter policy "profiles_update_own_safe_fields"
on public.profiles
to authenticated
using (user_id = (select auth.uid()) and public.is_non_anonymous_user())
with check (user_id = (select auth.uid()) and public.is_non_anonymous_user());

alter policy "wallets_select_own"
on public.wallets
to authenticated
using (user_id = (select auth.uid()) and public.is_non_anonymous_user());

alter policy "ledger_select_own"
on public.economy_ledger
to authenticated
using (user_id = (select auth.uid()) and public.is_non_anonymous_user());

alter policy "inventory_select_own"
on public.inventory
to authenticated
using (user_id = (select auth.uid()) and public.is_non_anonymous_user());

alter policy "daily_state_select_own"
on public.daily_state
to authenticated
using (user_id = (select auth.uid()) and public.is_non_anonymous_user());

alter policy "match_players_select_own"
on public.match_players
to authenticated
using (user_id = (select auth.uid()) and public.is_non_anonymous_user());

alter policy "match_history_select_participant"
on public.match_history
to authenticated
using (
  public.is_non_anonymous_user()
  and exists (
    select 1
    from public.match_players
    where match_players.match_id = match_history.match_id
      and match_players.user_id = (select auth.uid())
  )
);

alter policy "daily_mission_progress_select_own"
on public.daily_mission_progress
to authenticated
using (user_id = (select auth.uid()) and public.is_non_anonymous_user());
