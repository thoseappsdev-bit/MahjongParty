create schema if not exists mahjong_private;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  platform_id text,
  display_name text not null default 'Player',
  avatar text not null default 'L',
  account_level integer not null default 1 check (account_level >= 1),
  account_xp integer not null default 0 check (account_xp >= 0),
  locale text not null default 'en' check (locale in ('en', 'zh', 'id')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

  return new;
end;
$$;

revoke all on function mahjong_private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function mahjong_private.handle_new_auth_user();
