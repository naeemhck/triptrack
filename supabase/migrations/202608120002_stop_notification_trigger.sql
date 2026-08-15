create extension if not exists pg_net with schema extensions;

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
  insert into public.trips(name, invite_code, created_by, start_date, end_date)
  values(trim(p_name), v_code, auth.uid(), p_start_date, p_end_date) returning * into v_trip;
  insert into public.trip_members(trip_id, user_id, role, sharing_enabled, sharing_mode)
  values(v_trip.id, auth.uid(), 'organizer', false, 'off');
  return v_trip;
end;
$$;

create or replace function public.leave_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_role public.trip_role;
begin
  select tm.role into v_role from public.trip_members tm
  where tm.trip_id=p_trip_id and tm.user_id=auth.uid();
  if not found then return; end if;
  if v_role='organizer' then raise exception 'Organizer cannot leave; retain historical ownership'; end if;
  delete from public.trip_members where trip_id=p_trip_id and user_id=auth.uid();
end;
$$;

create or replace function public.notify_trip_stop_created()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  webhook_secret text;
begin
  begin
    select decrypted_secret
      into webhook_secret
      from vault.decrypted_secrets
     where name = 'triptrack_database_webhook_secret'
     limit 1;

    if webhook_secret is null or length(webhook_secret) < 32 then
      raise warning 'TripTrack stop notification skipped: webhook secret is not configured';
      return new;
    end if;

    perform net.http_post(
      url := 'https://fdykfiejzmwdesczduun.supabase.co/functions/v1/send-stop-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-triptrack-webhook-secret', webhook_secret
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', to_jsonb(new),
        'old_record', null
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'TripTrack stop notification enqueue failed';
  end;

  return new;
end;
$$;

revoke all on function public.notify_trip_stop_created() from public;

drop trigger if exists trip_stop_created_notification on public.trip_stops;
create trigger trip_stop_created_notification
after insert on public.trip_stops
for each row execute function public.notify_trip_stop_created();
