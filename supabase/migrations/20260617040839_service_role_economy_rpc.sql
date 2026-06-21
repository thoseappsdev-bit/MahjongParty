create or replace function public.service_mutate_wallet(
  target_user_id uuid,
  target_currency text,
  delta integer,
  ledger_source text,
  ledger_metadata jsonb default '{}'::jsonb
)
returns public.economy_ledger
language sql
set search_path = public, mahjong_private
as $$
  select *
  from mahjong_private.mutate_wallet(
    target_user_id,
    target_currency,
    delta,
    ledger_source,
    coalesce(ledger_metadata, '{}'::jsonb)
  );
$$;

revoke all on function public.service_mutate_wallet(uuid, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.service_mutate_wallet(uuid, text, integer, text, jsonb) to service_role;
