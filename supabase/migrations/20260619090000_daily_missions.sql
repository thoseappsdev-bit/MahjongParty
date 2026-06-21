create table public.daily_mission_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_date date not null default current_date,
  mission_id text not null check (mission_id in ('play-hand', 'win-with-pong', 'claim-melds')),
  progress integer not null default 0 check (progress >= 0),
  claimed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, mission_date, mission_id)
);

create index daily_mission_progress_user_date_idx
on public.daily_mission_progress (user_id, mission_date);

alter table public.daily_mission_progress enable row level security;

create policy "daily_mission_progress_select_own"
on public.daily_mission_progress
for select
to authenticated
using (user_id = auth.uid());

grant select on public.daily_mission_progress to authenticated;
grant select, insert, update on public.daily_mission_progress to service_role;

create or replace function public.service_record_daily_mission_progress(
  target_user_id uuid,
  mission_event text,
  increment_by integer default 1
)
returns void
language plpgsql
set search_path = public, mahjong_private
as $$
declare
  target_mission_id text;
  target_cap integer;
  safe_increment integer;
begin
  safe_increment := greatest(coalesce(increment_by, 1), 1);

  if mission_event = 'play' then
    target_mission_id := 'play-hand';
    target_cap := 1;
  elsif mission_event = 'win-with-pong' then
    target_mission_id := 'win-with-pong';
    target_cap := 1;
  elsif mission_event = 'claim-melds' then
    target_mission_id := 'claim-melds';
    target_cap := 2;
  else
    raise exception 'Unknown mission event %', mission_event;
  end if;

  insert into public.daily_mission_progress (user_id, mission_date, mission_id, progress)
  values (target_user_id, current_date, target_mission_id, least(target_cap, safe_increment))
  on conflict (user_id, mission_date, mission_id)
  do update set
    progress = least(target_cap, public.daily_mission_progress.progress + safe_increment),
    updated_at = now();
end;
$$;

create or replace function public.service_claim_daily_mission(
  target_user_id uuid,
  target_mission_id text
)
returns public.economy_ledger
language plpgsql
set search_path = public, mahjong_private
as $$
declare
  target_reward integer;
  target_required integer;
  current_progress integer;
  already_claimed boolean;
  inserted_ledger public.economy_ledger;
begin
  if target_mission_id = 'play-hand' then
    target_reward := 300;
    target_required := 1;
  elsif target_mission_id = 'win-with-pong' then
    target_reward := 900;
    target_required := 1;
  elsif target_mission_id = 'claim-melds' then
    target_reward := 500;
    target_required := 2;
  else
    raise exception 'Mission not found';
  end if;

  insert into public.daily_mission_progress (user_id, mission_date, mission_id, progress)
  values (target_user_id, current_date, target_mission_id, 0)
  on conflict (user_id, mission_date, mission_id) do nothing;

  select progress, claimed into current_progress, already_claimed
  from public.daily_mission_progress
  where user_id = target_user_id
    and mission_date = current_date
    and daily_mission_progress.mission_id = target_mission_id
  for update;

  if already_claimed then
    raise exception 'Mission already claimed';
  end if;

  if current_progress < target_required then
    raise exception 'Mission incomplete';
  end if;

  update public.daily_mission_progress
  set claimed = true, updated_at = now()
  where user_id = target_user_id
    and mission_date = current_date
    and daily_mission_progress.mission_id = target_mission_id;

  select * into inserted_ledger
  from mahjong_private.mutate_wallet(
    target_user_id,
    'coins',
    target_reward,
    'mission',
    jsonb_build_object('missionId', target_mission_id)
  );

  return inserted_ledger;
end;
$$;

revoke all on function public.service_record_daily_mission_progress(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.service_claim_daily_mission(uuid, text) from public, anon, authenticated;
grant execute on function public.service_record_daily_mission_progress(uuid, text, integer) to service_role;
grant execute on function public.service_claim_daily_mission(uuid, text) to service_role;



