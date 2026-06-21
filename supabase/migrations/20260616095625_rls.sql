alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.economy_ledger enable row level security;
alter table public.inventory enable row level security;
alter table public.match_history enable row level security;
alter table public.match_players enable row level security;
alter table public.daily_state enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

create policy "profiles_update_own_safe_fields"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "wallets_select_own"
on public.wallets
for select
to authenticated
using (user_id = auth.uid());

create policy "ledger_select_own"
on public.economy_ledger
for select
to authenticated
using (user_id = auth.uid());

create policy "inventory_select_own"
on public.inventory
for select
to authenticated
using (user_id = auth.uid());

create policy "daily_state_select_own"
on public.daily_state
for select
to authenticated
using (user_id = auth.uid());

create policy "match_players_select_own"
on public.match_players
for select
to authenticated
using (user_id = auth.uid());

create policy "match_history_select_participant"
on public.match_history
for select
to authenticated
using (
  exists (
    select 1
    from public.match_players
    where match_players.match_id = match_history.match_id
      and match_players.user_id = auth.uid()
  )
);

grant select on public.profiles to authenticated;
grant select on public.wallets to authenticated;
grant select on public.economy_ledger to authenticated;
grant select on public.inventory to authenticated;
grant select on public.daily_state to authenticated;
grant select on public.match_history to authenticated;
grant select on public.match_players to authenticated;

grant update (display_name, avatar, locale) on public.profiles to authenticated;
