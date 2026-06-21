create table public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gems integer not null default 0 check (gems >= 0),
  coins integer not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);

create table public.economy_ledger (
  ledger_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null check (currency in ('gems', 'coins')),
  amount integer not null check (amount <> 0),
  source text not null check (
    source in (
      'purchase',
      'coin-pack',
      'table-buyin',
      'table-settle',
      'daily-login',
      'rewarded-ad',
      'spin-wheel',
      'mission',
      'shop-spend',
      'admin'
    )
  ),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index economy_ledger_user_created_idx on public.economy_ledger (user_id, created_at desc);

create or replace function mahjong_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, mahjong_private
as $$
begin
  insert into public.profiles (user_id, platform_id, display_name, avatar, locale)
  values (
    new.id,
    new.raw_app_meta_data ->> 'provider',
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Player'),
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar', ''), 'L'),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en')
  )
  on conflict (user_id) do nothing;

  insert into public.wallets (user_id, gems, coins)
  values (new.id, 0, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function mahjong_private.handle_new_auth_user() from public, anon, authenticated;

create or replace function mahjong_private.mutate_wallet(
  target_user_id uuid,
  target_currency text,
  delta integer,
  ledger_source text,
  ledger_metadata jsonb default '{}'::jsonb
)
returns public.economy_ledger
language plpgsql
security definer
set search_path = public, mahjong_private
as $$
declare
  current_balance integer;
  next_balance integer;
  inserted_ledger public.economy_ledger;
begin
  if target_currency not in ('gems', 'coins') then
    raise exception 'Unsupported currency %', target_currency;
  end if;

  if delta = 0 then
    raise exception 'Ledger amount must be non-zero';
  end if;

  insert into public.wallets (user_id, gems, coins)
  values (target_user_id, 0, 0)
  on conflict (user_id) do nothing;

  if target_currency = 'gems' then
    select gems into current_balance
    from public.wallets
    where user_id = target_user_id
    for update;
  else
    select coins into current_balance
    from public.wallets
    where user_id = target_user_id
    for update;
  end if;

  next_balance := current_balance + delta;
  if next_balance < 0 then
    raise exception 'Insufficient %', target_currency;
  end if;

  if target_currency = 'gems' then
    update public.wallets
    set gems = next_balance, updated_at = now()
    where user_id = target_user_id;
  else
    update public.wallets
    set coins = next_balance, updated_at = now()
    where user_id = target_user_id;
  end if;

  insert into public.economy_ledger (
    user_id,
    currency,
    amount,
    source,
    balance_before,
    balance_after,
    metadata
  )
  values (
    target_user_id,
    target_currency,
    delta,
    ledger_source,
    current_balance,
    next_balance,
    coalesce(ledger_metadata, '{}'::jsonb)
  )
  returning * into inserted_ledger;

  return inserted_ledger;
end;
$$;

revoke all on function mahjong_private.mutate_wallet(uuid, text, integer, text, jsonb) from public, anon, authenticated;
grant usage on schema mahjong_private to service_role;
grant execute on function mahjong_private.mutate_wallet(uuid, text, integer, text, jsonb) to service_role;
