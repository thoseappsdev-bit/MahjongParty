create table public.inventory (
  inventory_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('tile-set', 'table-skin', 'frame', 'emote', 'win-fx', 'title')),
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  equipped boolean not null default false,
  acquired_at timestamptz not null default now(),
  unique (user_id, item_id)
);

create index inventory_user_idx on public.inventory (user_id);
