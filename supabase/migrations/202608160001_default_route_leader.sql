create or replace function public.create_trip(p_name text, p_start_date date default null, p_end_date date default null)
returns public.trips language plpgsql security definer set search_path = public as $$
declare
  v_trip public.trips;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  loop
    v_code := 'TRIP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists(select 1 from public.trips where invite_code = v_code);
  end loop;
  insert into public.trips(name, invite_code, created_by, route_leader_user_id, start_date, end_date)
  values(trim(p_name), v_code, auth.uid(), auth.uid(), p_start_date, p_end_date) returning * into v_trip;
  insert into public.trip_members(trip_id, user_id, role, sharing_enabled, sharing_mode)
  values(v_trip.id, auth.uid(), 'organizer', false, 'off');
  return v_trip;
end;
$$;

revoke all on function public.create_trip(text, date, date) from public;
grant execute on function public.create_trip(text, date, date) to authenticated;
