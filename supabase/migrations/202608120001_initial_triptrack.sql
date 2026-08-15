create extension if not exists pgcrypto;

create type public.trip_status as enum ('planned', 'active', 'completed');
create type public.trip_role as enum ('organizer', 'member');
create type public.sharing_mode as enum ('always', 'foreground', 'off');
create type public.stop_source as enum ('manual', 'automatic');
create type public.delivery_status as enum ('pending', 'claimed', 'sent', 'failed', 'skipped');

create table public.profiles (
  id uuid primary key,
  display_name text not null check (char_length(display_name) between 1 and 100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  invite_code text not null unique check (invite_code ~ '^TRIP-[A-Z0-9]{4,12}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  status public.trip_status not null default 'planned',
  start_date date,
  end_date date,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.trip_role not null default 'member',
  joined_at timestamptz not null default now(),
  sharing_enabled boolean not null default false,
  sharing_mode public.sharing_mode not null default 'off',
  last_seen_at timestamptz,
  primary key (trip_id, user_id),
  check (sharing_enabled = (sharing_mode <> 'off'))
);

create table public.trip_locations (
  trip_id uuid not null,
  user_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision check (accuracy is null or accuracy >= 0),
  sampled_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id),
  foreign key (trip_id) references public.trips(id) on delete cascade,
  foreign key (user_id) references public.profiles(id) on delete cascade,
  foreign key (trip_id, user_id) references public.trip_members(trip_id, user_id) on delete cascade
);

create table public.trip_stops (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  title text not null check (char_length(title) between 1 and 160),
  note text check (note is null or char_length(note) <= 2000),
  source public.stop_source not null,
  arrived_at timestamptz not null,
  departed_at timestamptz,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, id),
  check (departed_at is null or departed_at >= arrived_at)
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  device_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_id text not null,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  status public.delivery_status not null default 'pending',
  expo_ticket_id text,
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (event_type, event_id, recipient_user_id)
);

create table public.stale_alert_episodes (
  id text primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  stale_user_id uuid not null references public.profiles(id) on delete cascade,
  sampled_at timestamptz not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (trip_id, stale_user_id, sampled_at)
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index trip_members_user_idx on public.trip_members(user_id, trip_id);
create index trip_locations_trip_idx on public.trip_locations(trip_id, sampled_at desc);
create index trip_stops_trip_created_idx on public.trip_stops(trip_id, created_at desc);
create index push_tokens_user_enabled_idx on public.push_tokens(user_id) where enabled;
create index stale_active_trip_idx on public.stale_alert_episodes(trip_id) where resolved_at is null;

create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger trips_updated_at before update on public.trips
for each row execute function public.set_updated_at();
create trigger trip_stops_updated_at before update on public.trip_stops
for each row execute function public.set_updated_at();
create trigger push_tokens_updated_at before update on public.push_tokens
for each row execute function public.set_updated_at();

create function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'Traveler'), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  ) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create function public.is_trip_member(p_trip_id uuid, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.trip_members where trip_id = p_trip_id and user_id = p_user_id);
$$;
create function public.is_trip_organizer(p_trip_id uuid, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.trip_members where trip_id = p_trip_id and user_id = p_user_id and role = 'organizer');
$$;
create function public.trip_is_active(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.trips where id = p_trip_id and status = 'active');
$$;
create function public.member_can_share(p_trip_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.trip_members where trip_id = p_trip_id and user_id = p_user_id and sharing_enabled and sharing_mode <> 'off');
$$;
create function public.trip_member_role(p_trip_id uuid, p_user_id uuid default auth.uid()) returns public.trip_role
language sql stable security definer set search_path = public as $$
  select role from public.trip_members where trip_id = p_trip_id and user_id = p_user_id;
$$;
create function public.shares_trip_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user_id=auth.uid() or exists(
    select 1 from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id=mine.trip_id
    where mine.user_id=auth.uid() and theirs.user_id=p_user_id
  );
$$;

revoke all on function public.is_trip_member(uuid, uuid) from public;
revoke all on function public.is_trip_organizer(uuid, uuid) from public;
revoke all on function public.trip_is_active(uuid) from public;
revoke all on function public.member_can_share(uuid, uuid) from public;
revoke all on function public.trip_member_role(uuid, uuid) from public;
revoke all on function public.shares_trip_with(uuid) from public;
grant execute on function public.is_trip_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_trip_organizer(uuid, uuid) to authenticated, service_role;
grant execute on function public.trip_is_active(uuid) to authenticated, service_role;
grant execute on function public.member_can_share(uuid, uuid) to authenticated, service_role;
grant execute on function public.trip_member_role(uuid, uuid) to authenticated, service_role;
grant execute on function public.shares_trip_with(uuid) to authenticated, service_role;

create function public.create_trip(p_name text, p_start_date date default null, p_end_date date default null)
returns public.trips language plpgsql security definer set search_path = public as $$
declare
  v_trip public.trips;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  loop
    v_code := 'TRIP-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists(select 1 from public.trips where invite_code = v_code);
  end loop;
  insert into public.trips(name, invite_code, created_by, start_date, end_date)
  values(trim(p_name), v_code, auth.uid(), p_start_date, p_end_date) returning * into v_trip;
  insert into public.trip_members(trip_id, user_id, role, sharing_enabled, sharing_mode)
  values(v_trip.id, auth.uid(), 'organizer', false, 'off');
  return v_trip;
end;
$$;

create function public.join_trip(p_invite_code text) returns public.trips
language plpgsql security definer set search_path = public as $$
declare v_trip public.trips;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_trip from public.trips where invite_code = upper(trim(p_invite_code));
  if not found then raise exception 'Invalid invite code'; end if;
  if v_trip.status = 'completed' then raise exception 'Completed trips cannot be joined'; end if;
  insert into public.trip_members(trip_id, user_id, role)
  values(v_trip.id, auth.uid(), 'member') on conflict (trip_id, user_id) do nothing;
  return v_trip;
end;
$$;

create function public.preview_trip(p_invite_code text) returns public.trips
language plpgsql security definer set search_path = public as $$
declare v_trip public.trips;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_trip from public.trips where invite_code = upper(trim(p_invite_code));
  if not found then raise exception 'Invalid invite code'; end if;
  if v_trip.status = 'completed' and not public.is_trip_member(v_trip.id) then
    raise exception 'Completed trips cannot be joined';
  end if;
  return v_trip;
end;
$$;

create function public.start_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  update public.trips set status = 'active', started_at = now()
  where id = p_trip_id and status = 'planned';
  if not found then raise exception 'Trip must be planned'; end if;
end;
$$;

create function public.end_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  update public.trips set status = 'completed', ended_at = now()
  where id = p_trip_id and status = 'active';
  if not found then raise exception 'Trip must be active'; end if;
  update public.trip_members set sharing_enabled = false, sharing_mode = 'off' where trip_id = p_trip_id;
end;
$$;

create function public.leave_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_role public.trip_role; v_status public.trip_status;
begin
  select tm.role, t.status into v_role, v_status from public.trip_members tm join public.trips t on t.id=tm.trip_id
  where tm.trip_id=p_trip_id and tm.user_id=auth.uid();
  if not found then return; end if;
  if v_role='organizer' then raise exception 'Organizer cannot leave; retain historical ownership'; end if;
  delete from public.trip_members where trip_id=p_trip_id and user_id=auth.uid();
end;
$$;

create function public.remove_trip_member(p_trip_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  if p_user_id=auth.uid() then raise exception 'Organizer cannot remove self'; end if;
  delete from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='member';
end;
$$;

grant execute on function public.create_trip(text,date,date) to authenticated;
grant execute on function public.join_trip(text) to authenticated;
grant execute on function public.preview_trip(text) to authenticated;
grant execute on function public.start_trip(uuid) to authenticated;
grant execute on function public.end_trip(uuid) to authenticated;
grant execute on function public.leave_trip(uuid) to authenticated;
grant execute on function public.remove_trip_member(uuid,uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_locations enable row level security;
alter table public.trip_stops enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.stale_alert_episodes enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy profiles_read_trip_peers on public.profiles for select to authenticated using (public.shares_trip_with(id));
create policy profiles_update_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy trips_read_member on public.trips for select to authenticated using (public.is_trip_member(id));
create policy members_read_member on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));
create policy members_update_self_sharing on public.trip_members for update to authenticated
using (user_id=auth.uid() and public.trip_is_active(trip_id))
with check (user_id=auth.uid() and public.trip_is_active(trip_id) and role=public.trip_member_role(trip_id, auth.uid()));
create policy locations_read_member on public.trip_locations for select to authenticated using (public.is_trip_member(trip_id));
create policy locations_insert_self_active on public.trip_locations for insert to authenticated
with check (user_id=auth.uid() and public.trip_is_active(trip_id) and public.member_can_share(trip_id,user_id));
create policy locations_update_self_active on public.trip_locations for update to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid() and public.trip_is_active(trip_id) and public.member_can_share(trip_id,user_id));
create policy locations_delete_self on public.trip_locations for delete to authenticated using (user_id=auth.uid());
create policy stops_read_member on public.trip_stops for select to authenticated using (public.is_trip_member(trip_id));
create policy stops_insert_owner_active on public.trip_stops for insert to authenticated
with check (user_id=auth.uid() and public.is_trip_member(trip_id) and public.trip_is_active(trip_id));
create policy stops_update_owner_active on public.trip_stops for update to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid() and public.trip_is_active(trip_id));
create policy stops_delete_organizer_active on public.trip_stops for delete to authenticated
using (public.is_trip_organizer(trip_id) and public.trip_is_active(trip_id));
create policy push_tokens_manage_self on public.push_tokens for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy deletion_request_self_insert on public.account_deletion_requests for insert to authenticated with check (user_id=auth.uid());
create policy deletion_request_self_read on public.account_deletion_requests for select to authenticated using (user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('trip-stop-photos','trip-stop-photos',false,10485760,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg'];

create function public.storage_trip_id(p_name text) returns uuid language plpgsql immutable as $$
begin return split_part(p_name,'/',1)::uuid; exception when others then return null; end;
$$;
create function public.storage_stop_id(p_name text) returns uuid language plpgsql immutable as $$
begin return split_part(p_name,'/',2)::uuid; exception when others then return null; end;
$$;

create policy stop_photos_read_member on storage.objects for select to authenticated
using (bucket_id='trip-stop-photos' and public.is_trip_member(public.storage_trip_id(name)));
create policy stop_photos_insert_owner_active on storage.objects for insert to authenticated
with check (
  bucket_id='trip-stop-photos'
  and name = public.storage_trip_id(name)::text || '/' || public.storage_stop_id(name)::text || '/photo.jpg'
  and public.trip_is_active(public.storage_trip_id(name))
  and exists(select 1 from public.trip_stops s where s.trip_id=public.storage_trip_id(name) and s.id=public.storage_stop_id(name) and s.user_id=auth.uid())
  and coalesce((metadata->>'mimetype'),'')='image/jpeg'
  and coalesce((metadata->>'size')::bigint,0) <= 10485760
);
create policy stop_photos_update_owner_active on storage.objects for update to authenticated
using (bucket_id='trip-stop-photos' and public.trip_is_active(public.storage_trip_id(name)) and exists(select 1 from public.trip_stops s where s.trip_id=public.storage_trip_id(name) and s.id=public.storage_stop_id(name) and s.user_id=auth.uid()))
with check (bucket_id='trip-stop-photos' and coalesce((metadata->>'mimetype'),'')='image/jpeg' and coalesce((metadata->>'size')::bigint,0)<=10485760);

alter publication supabase_realtime add table public.trip_members;
alter publication supabase_realtime add table public.trip_locations;
alter publication supabase_realtime add table public.trip_stops;
