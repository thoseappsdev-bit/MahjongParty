create table public.daily_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reward_date date,
  streak integer not null default 0 check (streak >= 0),
  rewarded_ad_date date,
  rewarded_ad_count integer not null default 0 check (rewarded_ad_count between 0 and 3),
  spin_date date,
  spin_count integer not null default 0 check (spin_count >= 0),
  updated_at timestamptz not null default now()
);
