create table public.match_history (
  match_id text primary key default gen_random_uuid()::text,
  room_code text,
  mode text not null check (mode in ('1-fan', '3-fan')),
  table_type text not null check (table_type in ('friendly', 'coin')),
  seed_released text,
  winner_user_id uuid references auth.users(id) on delete set null,
  winner_seat integer check (winner_seat between 0 and 3),
  total_fan integer not null default 0 check (total_fan >= 0),
  settlement jsonb not null default '{}'::jsonb,
  audit_log jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.match_players (
  match_id text not null references public.match_history(match_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat integer not null check (seat between 0 and 3),
  coins_delta integer not null default 0,
  primary key (match_id, user_id),
  unique (match_id, seat)
);

create index match_players_user_idx on public.match_players (user_id, match_id);
