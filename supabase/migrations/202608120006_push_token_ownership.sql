create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(p_token), '') is null then
    raise exception 'Push token is required';
  end if;

  if p_platform not in ('android', 'ios') then
    raise exception 'Unsupported push platform';
  end if;

  insert into public.push_tokens(user_id, expo_push_token, platform, enabled)
  values(auth.uid(), p_token, p_platform, true)
  on conflict (expo_push_token) do update
  set user_id = auth.uid(),
      platform = excluded.platform,
      enabled = true,
      updated_at = now()
  where push_tokens.user_id = auth.uid() or push_tokens.enabled = false;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Push token is already registered to another active account';
  end if;
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;

revoke update on public.trip_stops from authenticated;
grant update (title, note, departed_at, photo_path) on public.trip_stops to authenticated;

revoke all on function public.create_profile_for_new_user() from public;
