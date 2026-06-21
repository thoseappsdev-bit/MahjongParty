create or replace function public.service_ensure_guest_user(
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth, mahjong_private
as $$
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    target_user_id,
    'authenticated',
    'authenticated',
    target_user_id::text || '@guest.mahjong-party.local',
    '',
    now(),
    jsonb_build_object('provider', 'guest', 'providers', jsonb_build_array('guest')),
    jsonb_build_object('display_name', 'Player', 'avatar', 'L', 'locale', 'en'),
    now(),
    now()
  )
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.service_ensure_guest_user(uuid) from public, anon, authenticated;
grant execute on function public.service_ensure_guest_user(uuid) to service_role;
