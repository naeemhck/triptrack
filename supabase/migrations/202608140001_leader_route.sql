create type public.route_match_state as enum ('ON_ROUTE', 'OFF_ROUTE', 'LOCATION_INACTIVE', 'ROUTE_UNAVAILABLE');
create type public.lag_alert_level as enum ('warning', 'critical');

alter table public.trips
  add column route_leader_user_id uuid references public.profiles(id) on delete restrict;

create table public.trip_routes (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  route_version integer not null default 1 check (route_version > 0),
  route_leader_user_id uuid not null references public.profiles(id) on delete restrict,
  total_length_meters double precision not null default 0 check (total_length_meters >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_route_points (
  trip_id uuid not null references public.trip_routes(trip_id) on delete cascade,
  route_version integer not null,
  sequence bigint not null,
  sample_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision check (accuracy is null or accuracy >= 0),
  cumulative_distance_meters double precision not null check (cumulative_distance_meters >= 0),
  sampled_at timestamptz not null,
  primary key (trip_id, route_version, sequence),
  unique (trip_id, sample_id)
);

create table public.trip_member_route_status (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  state public.route_match_state not null,
  route_version integer,
  route_progress_meters double precision,
  route_distance_meters double precision,
  leader_progress_meters double precision,
  delta_meters double precision,
  matched_sequence bigint,
  sampled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id),
  foreign key (trip_id, user_id) references public.trip_members(trip_id, user_id) on delete cascade,
  check ((state = 'ON_ROUTE') = (route_progress_meters is not null and delta_meters is not null))
);

create table public.lag_alert_states (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  warning_armed boolean not null default true,
  critical_armed boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id),
  foreign key (trip_id, user_id) references public.trip_members(trip_id, user_id) on delete cascade
);

create table public.lag_alert_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  level public.lag_alert_level not null,
  behind_meters integer not null check (behind_meters >= 0),
  created_at timestamptz not null default now()
);

create index trip_route_points_order_idx on public.trip_route_points(trip_id, route_version, sequence);
create index trip_member_route_status_trip_idx on public.trip_member_route_status(trip_id, state);
create index lag_alert_events_trip_idx on public.lag_alert_events(trip_id, created_at desc);

create trigger trip_routes_updated_at before update on public.trip_routes
for each row execute function public.set_updated_at();

create or replace function public.route_distance_meters(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) returns double precision language sql immutable strict parallel safe as $$
  select 6371000.0 * 2.0 * asin(least(1.0, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2.0), 2) +
    cos(radians(p_lat1)) * cos(radians(p_lat2)) *
    power(sin(radians(p_lng2 - p_lng1) / 2.0), 2)
  )));
$$;

-- Returns the best continuity-aware projection onto the canonical polyline.
create or replace function public.match_trip_route(
  p_trip_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision,
  p_previous_progress double precision default null,
  p_max_progress_change double precision default null
) returns table(
  state public.route_match_state,
  progress_meters double precision,
  distance_meters double precision,
  matched_sequence bigint
) language plpgsql stable security definer set search_path = public as $$
declare
  v record;
  x double precision; y double precision; bx double precision; dy double precision;
  t double precision; seg_len double precision; candidate_progress double precision;
  candidate_distance double precision; score double precision; best_score double precision := null;
  tolerance double precision := greatest(40.0, least(120.0, coalesce(p_accuracy, 40.0) * 2.0));
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    return query select 'OFF_ROUTE'::public.route_match_state, null::double precision, null::double precision, null::bigint;
    return;
  end if;
  for v in
    select p1.sequence, p1.latitude a_lat, p1.longitude a_lng,
           p1.cumulative_distance_meters a_progress,
           p2.latitude b_lat, p2.longitude b_lng,
           p2.cumulative_distance_meters b_progress
    from public.trip_route_points p1
    join public.trip_route_points p2 on p2.trip_id=p1.trip_id
      and p2.route_version=p1.route_version and p2.sequence=p1.sequence+1
    where p1.trip_id=p_trip_id
    order by p1.sequence
  loop
    x := radians(p_longitude-v.a_lng) * cos(radians((p_latitude+v.a_lat)/2.0)) * 6371000.0;
    y := radians(p_latitude-v.a_lat) * 6371000.0;
    bx := radians(v.b_lng-v.a_lng) * cos(radians((v.b_lat+v.a_lat)/2.0)) * 6371000.0;
    dy := radians(v.b_lat-v.a_lat) * 6371000.0;
    seg_len := sqrt(bx*bx + dy*dy);
    if seg_len < 0.01 then continue; end if;
    t := greatest(0.0, least(1.0, (x*bx+y*dy)/(seg_len*seg_len)));
    candidate_distance := sqrt(power(x-t*bx,2)+power(y-t*dy,2));
    candidate_progress := v.a_progress + t*(v.b_progress-v.a_progress);
    if p_previous_progress is not null and p_max_progress_change is not null
       and abs(candidate_progress-p_previous_progress) > p_max_progress_change then
      continue;
    end if;
    score := candidate_distance + case when p_previous_progress is null then 0
      else abs(candidate_progress-p_previous_progress)*0.08 end;
    if best_score is null or score < best_score then
      best_score := score; progress_meters := candidate_progress;
      distance_meters := candidate_distance; matched_sequence := v.sequence;
    end if;
  end loop;
  if best_score is null then
    return query select 'ROUTE_UNAVAILABLE'::public.route_match_state, null::double precision, null::double precision, null::bigint;
  elsif distance_meters > tolerance then
    return query select 'OFF_ROUTE'::public.route_match_state, null::double precision, distance_meters, matched_sequence;
  else
    return query select 'ON_ROUTE'::public.route_match_state, progress_meters, distance_meters, matched_sequence;
  end if;
end;
$$;

create or replace function public.recompute_trip_route_statuses(p_trip_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_trip public.trips; v_leader_progress double precision; loc record; previous record; matched record;
  max_change double precision; elapsed_seconds double precision; alert_state public.lag_alert_states;
begin
  select * into v_trip from public.trips where id=p_trip_id for update;
  if not found or v_trip.status <> 'active' or v_trip.route_leader_user_id is null then return; end if;
  select total_length_meters into v_leader_progress from public.trip_routes where trip_id=p_trip_id;
  if v_leader_progress is null then return; end if;

  for loc in select l.*, m.user_id as member_user_id, m.sharing_enabled from public.trip_members m
    left join public.trip_locations l on l.trip_id=m.trip_id and l.user_id=m.user_id
    where m.trip_id=p_trip_id
  loop
    if not loc.sharing_enabled or loc.sampled_at is null or loc.sampled_at < now()-interval '5 minutes' then
      insert into public.trip_member_route_status(trip_id,user_id,state,sampled_at)
      values(p_trip_id,loc.member_user_id,'LOCATION_INACTIVE',loc.sampled_at)
      on conflict(trip_id,user_id) do update set state='LOCATION_INACTIVE', route_progress_meters=null,
        route_distance_meters=null, leader_progress_meters=null, delta_meters=null,
        matched_sequence=null, sampled_at=excluded.sampled_at, updated_at=now();
      continue;
    end if;
    if loc.member_user_id=v_trip.route_leader_user_id then
      insert into public.trip_member_route_status(trip_id,user_id,state,route_version,route_progress_meters,
        route_distance_meters,leader_progress_meters,delta_meters,sampled_at)
      values(p_trip_id,loc.member_user_id,'ON_ROUTE',1,v_leader_progress,0,v_leader_progress,0,loc.sampled_at)
      on conflict(trip_id,user_id) do update set state='ON_ROUTE',route_version=1,
        route_progress_meters=v_leader_progress,route_distance_meters=0,leader_progress_meters=v_leader_progress,
        delta_meters=0,sampled_at=excluded.sampled_at,updated_at=now();
      continue;
    end if;
    select * into previous from public.trip_member_route_status where trip_id=p_trip_id and user_id=loc.member_user_id;
    elapsed_seconds := greatest(1, extract(epoch from (loc.sampled_at-coalesce(previous.sampled_at,loc.sampled_at))));
    max_change := case when previous.route_progress_meters is null then null
      else greatest(250.0, elapsed_seconds*55.0 + coalesce(loc.accuracy,40.0)*2.0) end;
    select * into matched from public.match_trip_route(p_trip_id,loc.latitude,loc.longitude,loc.accuracy,
      previous.route_progress_meters,max_change) limit 1;
    insert into public.trip_member_route_status(trip_id,user_id,state,route_version,route_progress_meters,
      route_distance_meters,leader_progress_meters,delta_meters,matched_sequence,sampled_at)
    values(p_trip_id,loc.member_user_id,matched.state,case when matched.state='ON_ROUTE' then 1 end,
      matched.progress_meters,matched.distance_meters,v_leader_progress,
      case when matched.state='ON_ROUTE' then v_leader_progress-matched.progress_meters end,
      matched.matched_sequence,loc.sampled_at)
    on conflict(trip_id,user_id) do update set state=excluded.state,route_version=excluded.route_version,
      route_progress_meters=excluded.route_progress_meters,route_distance_meters=excluded.route_distance_meters,
      leader_progress_meters=excluded.leader_progress_meters,delta_meters=excluded.delta_meters,
      matched_sequence=excluded.matched_sequence,sampled_at=excluded.sampled_at,updated_at=now();

    insert into public.lag_alert_states(trip_id,user_id) values(p_trip_id,loc.member_user_id)
      on conflict(trip_id,user_id) do nothing;
    select * into alert_state from public.lag_alert_states where trip_id=p_trip_id and user_id=loc.member_user_id for update;
    if matched.state <> 'ON_ROUTE' then continue; end if;
    if v_leader_progress-matched.progress_meters < 150 then alert_state.warning_armed := true; end if;
    if v_leader_progress-matched.progress_meters < 400 then alert_state.critical_armed := true; end if;
    if v_leader_progress-matched.progress_meters >= 500 and alert_state.critical_armed then
      insert into public.lag_alert_events(trip_id,user_id,level,behind_meters)
      values(p_trip_id,loc.member_user_id,'critical',round(v_leader_progress-matched.progress_meters)::integer);
      alert_state.critical_armed := false; alert_state.warning_armed := false;
    elsif v_leader_progress-matched.progress_meters >= 200 and alert_state.warning_armed then
      insert into public.lag_alert_events(trip_id,user_id,level,behind_meters)
      values(p_trip_id,loc.member_user_id,'warning',round(v_leader_progress-matched.progress_meters)::integer);
      alert_state.warning_armed := false;
    end if;
    update public.lag_alert_states set warning_armed=alert_state.warning_armed,
      critical_armed=alert_state.critical_armed,updated_at=now()
      where trip_id=p_trip_id and user_id=loc.member_user_id;
  end loop;
end;
$$;

create or replace function public.submit_trip_location(
  p_trip_id uuid, p_sample_id uuid, p_latitude double precision, p_longitude double precision,
  p_accuracy double precision, p_sampled_at timestamptz, p_route_candidate boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_trip public.trips; last_point public.trip_route_points; distance_m double precision;
  elapsed_s double precision; next_sequence bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_sample_id is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or p_accuracy is null or p_accuracy < 0 or p_accuracy > 100 then raise exception 'Invalid location sample'; end if;
  select * into v_trip from public.trips where id=p_trip_id for update;
  if not found or v_trip.status <> 'active' then raise exception 'Trip must be active'; end if;
  if not public.member_can_share(p_trip_id,auth.uid()) then raise exception 'Location sharing is not enabled'; end if;
  insert into public.trip_locations(trip_id,user_id,latitude,longitude,accuracy,sampled_at)
  values(p_trip_id,auth.uid(),p_latitude,p_longitude,p_accuracy,p_sampled_at)
  on conflict(trip_id,user_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,
    accuracy=excluded.accuracy,sampled_at=excluded.sampled_at,updated_at=now()
  where excluded.sampled_at >= trip_locations.sampled_at;

  if p_route_candidate and v_trip.route_leader_user_id=auth.uid() then
    insert into public.trip_routes(trip_id,route_version,route_leader_user_id)
    values(p_trip_id,1,auth.uid()) on conflict(trip_id) do nothing;
    if exists(select 1 from public.trip_route_points where trip_id=p_trip_id and sample_id=p_sample_id) then return; end if;
    select * into last_point from public.trip_route_points where trip_id=p_trip_id order by sequence desc limit 1;
    if not found then
      insert into public.trip_route_points values(p_trip_id,1,1,p_sample_id,p_latitude,p_longitude,p_accuracy,0,p_sampled_at);
    else
      if p_sampled_at <= last_point.sampled_at then return; end if;
      distance_m := public.route_distance_meters(last_point.latitude,last_point.longitude,p_latitude,p_longitude);
      elapsed_s := extract(epoch from (p_sampled_at-last_point.sampled_at));
      -- 15m suppresses jitter; 70m/s and 2km bound reject impossible jumps without changing sampling frequency.
      if distance_m < 15 or distance_m > 2000 or distance_m/greatest(elapsed_s,1) > 70 then return; end if;
      next_sequence := last_point.sequence+1;
      insert into public.trip_route_points values(p_trip_id,1,next_sequence,p_sample_id,p_latitude,p_longitude,
        p_accuracy,last_point.cumulative_distance_meters+distance_m,p_sampled_at);
      update public.trip_routes set total_length_meters=last_point.cumulative_distance_meters+distance_m,
        route_leader_user_id=auth.uid() where trip_id=p_trip_id;
    end if;
  end if;
  perform public.recompute_trip_route_statuses(p_trip_id);
end;
$$;

create or replace function public.set_route_leader(p_trip_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_trip public.trips; v_location public.trip_locations; v_match record; v_total double precision;
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  select * into v_trip from public.trips where id=p_trip_id for update;
  if not found or v_trip.status='completed' then raise exception 'Completed trips reject route leader changes'; end if;
  if not public.is_trip_member(p_trip_id,p_user_id) then raise exception 'Route leader must be a current member'; end if;
  if v_trip.status='active' and exists(select 1 from public.trip_route_points where trip_id=p_trip_id) then
    select * into v_location from public.trip_locations where trip_id=p_trip_id and user_id=p_user_id
      and sampled_at >= now()-interval '5 minutes';
    if not found then raise exception 'New route leader needs a fresh location'; end if;
    select * into v_match from public.match_trip_route(p_trip_id,v_location.latitude,v_location.longitude,
      v_location.accuracy,null,null) limit 1;
    select total_length_meters into v_total from public.trip_routes where trip_id=p_trip_id;
    if v_match.state <> 'ON_ROUTE' or abs(v_total-v_match.progress_meters)>250 then
      raise exception 'New route leader is not reliably matched near the route end';
    end if;
  end if;
  update public.trips set route_leader_user_id=p_user_id where id=p_trip_id;
  insert into public.trip_routes(trip_id,route_version,route_leader_user_id)
    values(p_trip_id,1,p_user_id) on conflict(trip_id) do update set route_leader_user_id=excluded.route_leader_user_id;
  update public.lag_alert_states s set
    warning_armed=coalesce((select delta_meters<150 from public.trip_member_route_status r where r.trip_id=s.trip_id and r.user_id=s.user_id),true),
    critical_armed=coalesce((select delta_meters<400 from public.trip_member_route_status r where r.trip_id=s.trip_id and r.user_id=s.user_id),true),updated_at=now()
    where s.trip_id=p_trip_id;
  perform public.recompute_trip_route_statuses(p_trip_id);
end;
$$;

create or replace function public.start_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  if not exists(select 1 from public.trips where id=p_trip_id and route_leader_user_id is not null) then
    raise exception 'Select a Route Leader before starting the trip';
  end if;
  update public.trips set status='active',started_at=now() where id=p_trip_id and status='planned';
  if not found then raise exception 'Trip must be planned'; end if;
end;
$$;

create or replace function public.leave_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_role public.trip_role; v_status public.trip_status; v_leader uuid;
begin
  select tm.role,t.status,t.route_leader_user_id into v_role,v_status,v_leader
  from public.trip_members tm join public.trips t on t.id=tm.trip_id
  where tm.trip_id=p_trip_id and tm.user_id=auth.uid();
  if not found then return; end if;
  if v_role='organizer' then raise exception 'Organizer cannot leave; retain historical ownership'; end if;
  if v_status='active' and v_leader=auth.uid() then raise exception 'Transfer Route Leader before leaving'; end if;
  delete from public.trip_members where trip_id=p_trip_id and user_id=auth.uid();
end;
$$;

create or replace function public.remove_trip_member(p_trip_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  if p_user_id=auth.uid() then raise exception 'Organizer cannot remove self'; end if;
  if exists(select 1 from public.trips where id=p_trip_id and status='active' and route_leader_user_id=p_user_id) then
    raise exception 'Transfer Route Leader before removing this member';
  end if;
  delete from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='member';
end;
$$;

alter table public.trip_routes enable row level security;
alter table public.trip_route_points enable row level security;
alter table public.trip_member_route_status enable row level security;
alter table public.lag_alert_states enable row level security;
alter table public.lag_alert_events enable row level security;
create policy route_read_members on public.trip_routes for select to authenticated using(public.is_trip_member(trip_id));
create policy route_points_read_members on public.trip_route_points for select to authenticated using(public.is_trip_member(trip_id));
create policy route_status_read_members on public.trip_member_route_status for select to authenticated using(public.is_trip_member(trip_id));
-- No authenticated write policies: all mutations pass through the validated security-definer RPCs.

revoke all on function public.submit_trip_location(uuid,uuid,double precision,double precision,double precision,timestamptz,boolean) from public;
revoke all on function public.set_route_leader(uuid,uuid) from public;
revoke all on function public.recompute_trip_route_statuses(uuid) from public;
revoke all on function public.match_trip_route(uuid,double precision,double precision,double precision,double precision,double precision) from public;
grant execute on function public.submit_trip_location(uuid,uuid,double precision,double precision,double precision,timestamptz,boolean) to authenticated;
grant execute on function public.set_route_leader(uuid,uuid) to authenticated;
grant execute on function public.match_trip_route(uuid,double precision,double precision,double precision,double precision,double precision) to authenticated,service_role;

revoke insert,update,delete on public.trip_locations from authenticated;

alter publication supabase_realtime add table public.trip_routes;
alter publication supabase_realtime add table public.trip_route_points;
alter publication supabase_realtime add table public.trip_member_route_status;
alter publication supabase_realtime add table public.lag_alert_events;
