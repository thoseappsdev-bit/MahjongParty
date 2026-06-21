create or replace function public.service_settle_match(
  target_match_id text,
  settlement_deltas jsonb,
  allow_house_delta boolean default false
)
returns jsonb
language plpgsql
set search_path = public, mahjong_private
as $$
declare
  delta_entry jsonb;
  delta_user_id uuid;
  delta_amount integer;
  delta_sum bigint;
  existing_settlement jsonb;
  inserted_ledger public.economy_ledger;
  result_ledgers jsonb := '[]'::jsonb;
  result_wallets jsonb := '{}'::jsonb;
begin
  if nullif(trim(target_match_id), '') is null then
    raise exception 'Match id is required';
  end if;

  if jsonb_typeof(settlement_deltas) <> 'array' or jsonb_array_length(settlement_deltas) = 0 then
    raise exception 'Settlement deltas must be a non-empty array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(settlement_deltas) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value ->> 'userId', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(item.value ->> 'amount', '') !~ '^-?[0-9]+$'
      or case
        when coalesce(item.value ->> 'amount', '') ~ '^-?[0-9]+$'
          then (item.value ->> 'amount')::numeric not between -2147483648 and 2147483647
        else false
      end
  ) then
    raise exception 'Each settlement delta requires a valid userId and integer amount';
  end if;

  if (
    select count(*) <> count(distinct lower(item.value ->> 'userId'))
    from jsonb_array_elements(settlement_deltas) as item(value)
  ) then
    raise exception 'Settlement contains duplicate users';
  end if;

  select coalesce(sum((item.value ->> 'amount')::bigint), 0)
  into delta_sum
  from jsonb_array_elements(settlement_deltas) as item(value);

  if delta_sum <> 0 and not allow_house_delta then
    raise exception 'Settlement deltas must sum to zero';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_match_id, 0));

  select settlement
  into existing_settlement
  from public.match_history
  where match_id = target_match_id;

  if found then
    if existing_settlement ? 'entries'
      and existing_settlement -> 'entries' <> settlement_deltas then
      raise exception 'Match settlement payload does not match the recorded result';
    end if;

    select coalesce(
      jsonb_object_agg(
        wallets.user_id::text,
        jsonb_build_object('coins', wallets.coins, 'gems', wallets.gems)
      ),
      '{}'::jsonb
    )
    into result_wallets
    from public.wallets
    where wallets.user_id in (
      select (item.value ->> 'userId')::uuid
      from jsonb_array_elements(settlement_deltas) as item(value)
    );

    return jsonb_build_object('wallets', result_wallets, 'ledgers', '[]'::jsonb);
  end if;

  for delta_entry in
    select item.value
    from jsonb_array_elements(settlement_deltas) with ordinality as item(value, position)
    order by item.position
  loop
    delta_user_id := (delta_entry ->> 'userId')::uuid;
    perform public.service_ensure_guest_user(delta_user_id);
  end loop;

  insert into public.match_history (
    match_id,
    mode,
    table_type,
    settlement,
    completed_at
  )
  values (
    target_match_id,
    '3-fan',
    'coin',
    jsonb_build_object(
      'deltas',
      (
        select jsonb_agg((item.value ->> 'amount')::integer order by item.position)
        from jsonb_array_elements(settlement_deltas) with ordinality as item(value, position)
      ),
      'entries',
      settlement_deltas,
      'houseDelta',
      -delta_sum
    ),
    now()
  );

  for delta_entry in
    select item.value
    from jsonb_array_elements(settlement_deltas) with ordinality as item(value, position)
    order by item.position
  loop
    delta_user_id := (delta_entry ->> 'userId')::uuid;
    delta_amount := (delta_entry ->> 'amount')::integer;

    if delta_amount <> 0 then
      select *
      into inserted_ledger
      from mahjong_private.mutate_wallet(
        delta_user_id,
        'coins',
        delta_amount,
        'table-settle',
        jsonb_build_object('matchId', target_match_id)
      );
      result_ledgers := result_ledgers || jsonb_build_array(to_jsonb(inserted_ledger));
    end if;
  end loop;

  select coalesce(
    jsonb_object_agg(
      wallets.user_id::text,
      jsonb_build_object('coins', wallets.coins, 'gems', wallets.gems)
    ),
    '{}'::jsonb
  )
  into result_wallets
  from public.wallets
  where wallets.user_id in (
    select (item.value ->> 'userId')::uuid
    from jsonb_array_elements(settlement_deltas) as item(value)
  );

  return jsonb_build_object('wallets', result_wallets, 'ledgers', result_ledgers);
end;
$$;

revoke all on function public.service_settle_match(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.service_settle_match(text, jsonb, boolean) to service_role;
