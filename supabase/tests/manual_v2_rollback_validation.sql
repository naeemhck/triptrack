-- TripTrack V2 rollback-only Supabase SQL Editor validation
--
-- EXPECTED RESULT:
--   ERROR P0001: VALIDATION PASSED: all 76 pgTAP tests passed; V2 changes rolled back
--
-- The final exception is deliberate. It guarantees that this validation cannot
-- persist the migration or test fixtures in the QA project. Any other error, or
-- a VALIDATION FAILED/INCOMPLETE message, is a real failure and must be reported.

begin;
create extension if not exists pgtap with schema extensions;
create temporary table tap_results(line text) on commit drop;
grant insert,select on tap_results to authenticated;
select plan(76);

-- Temporarily apply the complete forward-only V2 migration.
create type public.navigation_state as enum (
  'ON_ROUTE', 'FALLING_BEHIND', 'AHEAD', 'STOPPED',
  'OFF_ROUTE', 'LOCATION_STALE', 'ROUTE_UNAVAILABLE'
);

alter table public.trip_locations
  add column speed_mps double precision check (speed_mps is null or speed_mps between 0 and 70),
  add column smoothed_speed_mps double precision check (smoothed_speed_mps is null or smoothed_speed_mps between 0 and 70),
  add column speed_sample_count integer not null default 0 check (speed_sample_count between 0 and 1000000),
  add column heading double precision check (heading is null or heading between 0 and 360);

create table public.trip_planned_routes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  version integer not null check (version > 0),
  is_current boolean not null default true,
  origin_latitude double precision not null check (origin_latitude between -90 and 90),
  origin_longitude double precision not null check (origin_longitude between -180 and 180),
  origin_name text not null check (char_length(origin_name) between 1 and 160),
  destination_latitude double precision not null check (destination_latitude between -90 and 90),
  destination_longitude double precision not null check (destination_longitude between -180 and 180),
  destination_name text not null check (char_length(destination_name) between 1 and 160),
  geometry_geojson jsonb not null,
  distance_meters double precision not null check (distance_meters > 0),
  duration_seconds double precision not null check (duration_seconds > 0),
  routing_provider text not null check (char_length(routing_provider) between 1 and 40),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, version),
  unique (trip_id, id)
);

create unique index trip_planned_routes_one_current_idx
  on public.trip_planned_routes(trip_id) where is_current;

create table public.trip_route_waypoints (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  route_id uuid not null,
  sequence integer not null check (sequence between 1 and 8),
  title text not null check (char_length(title) between 1 and 160),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_meters integer not null default 75 check (radius_meters between 25 and 250),
  reached_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (trip_id, route_id) references public.trip_planned_routes(trip_id, id) on delete cascade,
  unique (route_id, sequence)
);

create table public.trip_planned_route_points (
  route_id uuid not null references public.trip_planned_routes(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  cumulative_distance_meters double precision not null check (cumulative_distance_meters >= 0),
  primary key (route_id, sequence)
);

create table public.trip_route_steps (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.trip_planned_routes(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  instruction text not null check (char_length(instruction) between 1 and 300),
  road_name text not null default '' check (char_length(road_name) <= 160),
  maneuver_type text not null check (char_length(maneuver_type) between 1 and 40),
  maneuver_modifier text check (maneuver_modifier is null or char_length(maneuver_modifier) <= 40),
  exit_number integer check (exit_number is null or exit_number > 0),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  progress_meters double precision not null check (progress_meters >= 0),
  distance_meters double precision not null check (distance_meters >= 0),
  duration_seconds double precision not null check (duration_seconds >= 0),
  unique (route_id, sequence)
);

create table public.trip_member_navigation_status (
  trip_id uuid not null,
  user_id uuid not null,
  route_id uuid not null references public.trip_planned_routes(id) on delete cascade,
  navigation_state public.navigation_state not null default 'ROUTE_UNAVAILABLE',
  planned_route_progress_meters double precision,
  route_distance_meters double precision,
  remaining_distance_meters double precision,
  matched_sequence integer,
  next_step_sequence integer,
  speed_mps double precision,
  smoothed_speed_mps double precision,
  heading double precision,
  leader_speed_delta_mps double precision,
  leader_distance_delta_meters double precision,
  estimated_arrival_at timestamptz,
  speed_trustworthy boolean not null default false,
  speed_difference_warning boolean not null default false,
  falling_behind_predicted boolean not null default false,
  speed_difference_started_at timestamptz,
  prediction_started_at timestamptz,
  deviation_sample_count integer not null default 0 check (deviation_sample_count between 0 and 1000),
  reroute_suggested boolean not null default false,
  sampled_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id),
  foreign key (trip_id, user_id) references public.trip_members(trip_id, user_id) on delete cascade
);

-- Server-only idempotency claims prevent offline V2 sample replay from skewing speed EMA/counts.
create table public.trip_navigation_location_samples (
  trip_id uuid not null,
  sample_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, sample_id),
  foreign key (trip_id, user_id) references public.trip_members(trip_id, user_id) on delete cascade
);

create index trip_planned_routes_history_idx on public.trip_planned_routes(trip_id, version desc);
create index trip_route_waypoints_route_idx on public.trip_route_waypoints(route_id, sequence);
create index trip_route_steps_route_idx on public.trip_route_steps(route_id, progress_meters);
create index trip_member_navigation_trip_idx on public.trip_member_navigation_status(trip_id, navigation_state);

create trigger trip_planned_routes_updated_at before update on public.trip_planned_routes
for each row execute function public.set_updated_at();

alter table public.trip_planned_routes enable row level security;
alter table public.trip_route_waypoints enable row level security;
alter table public.trip_planned_route_points enable row level security;
alter table public.trip_route_steps enable row level security;
alter table public.trip_member_navigation_status enable row level security;
alter table public.trip_navigation_location_samples enable row level security;

grant select on public.trip_planned_routes, public.trip_route_waypoints,
  public.trip_planned_route_points, public.trip_route_steps,
  public.trip_member_navigation_status to authenticated;

create policy planned_routes_read_members on public.trip_planned_routes for select to authenticated
  using (public.is_trip_member(trip_id));
create policy planned_waypoints_read_members on public.trip_route_waypoints for select to authenticated
  using (public.is_trip_member(trip_id));
create policy planned_points_read_members on public.trip_planned_route_points for select to authenticated
  using (exists (
    select 1 from public.trip_planned_routes r
    where r.id=route_id and public.is_trip_member(r.trip_id)
  ));
create policy planned_steps_read_members on public.trip_route_steps for select to authenticated
  using (exists (
    select 1 from public.trip_planned_routes r
    where r.id=route_id and public.is_trip_member(r.trip_id)
  ));
create policy navigation_status_read_members on public.trip_member_navigation_status for select to authenticated
  using (public.is_trip_member(trip_id));

-- Mutations are available only through validated security-definer RPCs.
revoke insert, update, delete on public.trip_planned_routes from authenticated;
revoke insert, update, delete on public.trip_route_waypoints from authenticated;
revoke insert, update, delete on public.trip_planned_route_points from authenticated;
revoke insert, update, delete on public.trip_route_steps from authenticated;
revoke insert, update, delete on public.trip_member_navigation_status from authenticated;
revoke all on public.trip_navigation_location_samples from authenticated;

create or replace function public.match_planned_route(
  p_route_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision,
  p_previous_progress double precision default null,
  p_max_progress_change double precision default null
) returns table(
  navigation_state public.navigation_state,
  progress_meters double precision,
  distance_meters double precision,
  matched_sequence integer
) language plpgsql stable security definer set search_path=public as $$
declare
  v record;
  v_trip_id uuid;
  x double precision; y double precision; bx double precision; dy double precision;
  t double precision; seg_len double precision; candidate_progress double precision;
  candidate_distance double precision; score double precision; best_score double precision := null;
  tolerance double precision := greatest(50.0, least(150.0, coalesce(p_accuracy, 40.0)*2.0));
begin
  select trip_id into v_trip_id from public.trip_planned_routes where id=p_route_id;
  if v_trip_id is null then
    return query select 'ROUTE_UNAVAILABLE'::public.navigation_state, null::double precision,
      null::double precision, null::integer;
    return;
  end if;
  if auth.uid() is not null and not public.is_trip_member(v_trip_id,auth.uid()) then
    raise exception 'Trip membership required';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    return query select 'OFF_ROUTE'::public.navigation_state, null::double precision,
      null::double precision, null::integer;
    return;
  end if;
  for v in
    select p1.sequence, p1.latitude a_lat, p1.longitude a_lng,
      p1.cumulative_distance_meters a_progress,
      p2.latitude b_lat, p2.longitude b_lng,
      p2.cumulative_distance_meters b_progress
    from public.trip_planned_route_points p1
    join public.trip_planned_route_points p2 on p2.route_id=p1.route_id and p2.sequence=p1.sequence+1
    where p1.route_id=p_route_id order by p1.sequence
  loop
    x:=radians(p_longitude-v.a_lng)*cos(radians((p_latitude+v.a_lat)/2.0))*6371000.0;
    y:=radians(p_latitude-v.a_lat)*6371000.0;
    bx:=radians(v.b_lng-v.a_lng)*cos(radians((v.b_lat+v.a_lat)/2.0))*6371000.0;
    dy:=radians(v.b_lat-v.a_lat)*6371000.0;
    seg_len:=sqrt(bx*bx+dy*dy);
    if seg_len<0.01 then continue; end if;
    t:=greatest(0.0,least(1.0,(x*bx+y*dy)/(seg_len*seg_len)));
    candidate_distance:=sqrt(power(x-t*bx,2)+power(y-t*dy,2));
    candidate_progress:=v.a_progress+t*(v.b_progress-v.a_progress);
    if p_previous_progress is not null and p_max_progress_change is not null
      and abs(candidate_progress-p_previous_progress)>p_max_progress_change then continue; end if;
    score:=candidate_distance+case when p_previous_progress is null then 0
      else abs(candidate_progress-p_previous_progress)*0.08 end;
    if best_score is null or score<best_score then
      best_score:=score; progress_meters:=candidate_progress;
      distance_meters:=candidate_distance; matched_sequence:=v.sequence;
    end if;
  end loop;
  if best_score is null then
    return query select 'ROUTE_UNAVAILABLE'::public.navigation_state, null::double precision,
      null::double precision, null::integer;
  elsif distance_meters>tolerance then
    return query select 'OFF_ROUTE'::public.navigation_state, null::double precision,
      distance_meters, matched_sequence;
  else
    return query select 'ON_ROUTE'::public.navigation_state, progress_meters,
      distance_meters, matched_sequence;
  end if;
end;
$$;

create or replace function public.save_trip_planned_route(
  p_trip_id uuid,
  p_origin_latitude double precision,
  p_origin_longitude double precision,
  p_origin_name text,
  p_destination_latitude double precision,
  p_destination_longitude double precision,
  p_destination_name text,
  p_geometry_geojson jsonb,
  p_distance_meters double precision,
  p_duration_seconds double precision,
  p_routing_provider text,
  p_points jsonb,
  p_waypoints jsonb default '[]'::jsonb,
  p_steps jsonb default '[]'::jsonb
) returns public.trip_planned_routes
language plpgsql security definer set search_path=public as $$
declare
  v_trip public.trips; v_route public.trip_planned_routes; v_version integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  select * into v_trip from public.trips where id=p_trip_id for update;
  if not found then raise exception 'Trip not found'; end if;
  if v_trip.status='completed' then raise exception 'Completed trips reject route changes'; end if;
  if p_origin_latitude not between -90 and 90 or p_origin_longitude not between -180 and 180
    or p_destination_latitude not between -90 and 90 or p_destination_longitude not between -180 and 180
    or p_distance_meters<=0 or p_duration_seconds<=0 then raise exception 'Invalid route summary'; end if;
  if char_length(trim(coalesce(p_origin_name,''))) not between 1 and 160
    or char_length(trim(coalesce(p_destination_name,''))) not between 1 and 160
    or char_length(trim(coalesce(p_routing_provider,''))) not between 1 and 40 then
    raise exception 'Invalid route labels';
  end if;
  if jsonb_typeof(p_geometry_geojson)<>'object'
    or p_geometry_geojson->>'type'<>'LineString'
    or jsonb_typeof(p_geometry_geojson->'coordinates')<>'array'
    or jsonb_array_length(p_geometry_geojson->'coordinates')<2 then
    raise exception 'Invalid route geometry';
  end if;
  if jsonb_typeof(p_points)<>'array' or jsonb_array_length(p_points)<2
    or jsonb_array_length(p_points)>10000 then raise exception 'Invalid route geometry points'; end if;
  if jsonb_typeof(p_waypoints)<>'array' or jsonb_array_length(p_waypoints)>8 then
    raise exception 'A route supports at most eight waypoints'; end if;
  if jsonb_typeof(p_steps)<>'array' or jsonb_array_length(p_steps)>2000 then
    raise exception 'Invalid route steps'; end if;

  select coalesce(max(version),0)+1 into v_version from public.trip_planned_routes where trip_id=p_trip_id;
  update public.trip_planned_routes set is_current=false where trip_id=p_trip_id and is_current;
  insert into public.trip_planned_routes(
    trip_id,version,is_current,origin_latitude,origin_longitude,origin_name,
    destination_latitude,destination_longitude,destination_name,geometry_geojson,
    distance_meters,duration_seconds,routing_provider,created_by
  ) values (
    p_trip_id,v_version,true,p_origin_latitude,p_origin_longitude,trim(p_origin_name),
    p_destination_latitude,p_destination_longitude,trim(p_destination_name),p_geometry_geojson,
    p_distance_meters,p_duration_seconds,trim(p_routing_provider),auth.uid()
  ) returning * into v_route;

  insert into public.trip_planned_route_points(route_id,sequence,latitude,longitude,cumulative_distance_meters)
  select v_route.id,x.sequence,x.latitude,x.longitude,x.cumulative_distance_meters
  from jsonb_to_recordset(p_points) as x(
    sequence integer, latitude double precision, longitude double precision,
    cumulative_distance_meters double precision
  );
  if (select count(*) from public.trip_planned_route_points where route_id=v_route.id)
    <>jsonb_array_length(p_points) then raise exception 'Route point payload is incomplete'; end if;

  insert into public.trip_route_waypoints(
    trip_id,route_id,sequence,title,latitude,longitude,radius_meters,created_by
  ) select p_trip_id,v_route.id,x.sequence,trim(x.title),x.latitude,x.longitude,
    coalesce(x.radius_meters,75),auth.uid()
  from jsonb_to_recordset(p_waypoints) as x(
    sequence integer,title text,latitude double precision,longitude double precision,radius_meters integer
  );

  insert into public.trip_route_steps(
    route_id,sequence,instruction,road_name,maneuver_type,maneuver_modifier,exit_number,
    latitude,longitude,progress_meters,distance_meters,duration_seconds
  ) select v_route.id,x.sequence,trim(x.instruction),coalesce(trim(x.road_name),''),
    trim(x.maneuver_type),x.maneuver_modifier,x.exit_number,x.latitude,x.longitude,
    x.progress_meters,x.distance_meters,x.duration_seconds
  from jsonb_to_recordset(p_steps) as x(
    sequence integer,instruction text,road_name text,maneuver_type text,maneuver_modifier text,
    exit_number integer,latitude double precision,longitude double precision,
    progress_meters double precision,distance_meters double precision,duration_seconds double precision
  );

  delete from public.trip_member_navigation_status where trip_id=p_trip_id;
  return v_route;
end;
$$;

create or replace function public.recompute_trip_navigation_statuses(p_trip_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_trip public.trips; v_route public.trip_planned_routes; v_leader_progress double precision;
  v_leader_speed double precision; loc record; previous public.trip_member_navigation_status;
  matched record; max_change double precision; elapsed_seconds double precision;
  v_state public.navigation_state; v_remaining double precision; v_speed_trustworthy boolean;
  v_leader_delta double precision; v_speed_delta double precision; v_prediction_seconds double precision;
  v_speed_started timestamptz; v_prediction_started timestamptz; v_speed_warning boolean;
  v_predicted boolean; v_deviation_count integer; v_next_step integer; v_eta timestamptz;
begin
  select * into v_trip from public.trips where id=p_trip_id;
  select * into v_route from public.trip_planned_routes where trip_id=p_trip_id and is_current;
  if not found then delete from public.trip_member_navigation_status where trip_id=p_trip_id; return; end if;

  select s.planned_route_progress_meters,l.smoothed_speed_mps into v_leader_progress,v_leader_speed
  from public.trip_locations l
  left join public.trip_member_navigation_status s on s.trip_id=l.trip_id and s.user_id=l.user_id
  where l.trip_id=p_trip_id and l.user_id=v_trip.route_leader_user_id;

  for loc in
    select m.user_id,m.sharing_enabled,m.sharing_expires_at,l.latitude,l.longitude,l.accuracy,
      l.sampled_at,l.speed_mps,l.smoothed_speed_mps,l.speed_sample_count,l.heading
    from public.trip_members m left join public.trip_locations l
      on l.trip_id=m.trip_id and l.user_id=m.user_id where m.trip_id=p_trip_id
    order by (m.user_id=v_trip.route_leader_user_id) desc, m.joined_at
  loop
    select * into previous from public.trip_member_navigation_status
      where trip_id=p_trip_id and user_id=loc.user_id;
    if not loc.sharing_enabled or (loc.sharing_expires_at is not null and loc.sharing_expires_at<=now())
      or loc.sampled_at is null or loc.sampled_at<now()-interval '5 minutes' then
      insert into public.trip_member_navigation_status(trip_id,user_id,route_id,navigation_state,sampled_at)
      values(p_trip_id,loc.user_id,v_route.id,'LOCATION_STALE',loc.sampled_at)
      on conflict(trip_id,user_id) do update set route_id=excluded.route_id,
        navigation_state='LOCATION_STALE',planned_route_progress_meters=null,route_distance_meters=null,
        remaining_distance_meters=null,leader_speed_delta_mps=null,leader_distance_delta_meters=null,
        estimated_arrival_at=null,speed_trustworthy=false,falling_behind_predicted=false,
        speed_difference_warning=false,reroute_suggested=false,sampled_at=excluded.sampled_at,updated_at=now();
      continue;
    end if;
    elapsed_seconds:=greatest(1,extract(epoch from (loc.sampled_at-coalesce(previous.sampled_at,loc.sampled_at))));
    max_change:=case when previous.planned_route_progress_meters is null then null
      else greatest(250.0,elapsed_seconds*70.0+coalesce(loc.accuracy,40.0)*2.0) end;
    select * into matched from public.match_planned_route(v_route.id,loc.latitude,loc.longitude,
      loc.accuracy,previous.planned_route_progress_meters,max_change) limit 1;
    v_speed_trustworthy:=loc.speed_sample_count>=3 and loc.accuracy<=50
      and loc.sampled_at>=now()-interval '60 seconds' and loc.smoothed_speed_mps is not null;
    v_deviation_count:=case when matched.navigation_state='OFF_ROUTE'
      then least(1000,coalesce(previous.deviation_sample_count,0)+1) else 0 end;
    v_state:=matched.navigation_state;
    v_remaining:=case when matched.progress_meters is null then null
      else greatest(0,v_route.distance_meters-matched.progress_meters) end;
    if loc.user_id=v_trip.route_leader_user_id then
      v_leader_progress:=matched.progress_meters;
      v_leader_speed:=case when v_speed_trustworthy then loc.smoothed_speed_mps else null end;
    end if;
    v_leader_delta:=case when v_leader_progress is null or matched.progress_meters is null then null
      else v_leader_progress-matched.progress_meters end;
    v_speed_delta:=case when v_leader_speed is null or not v_speed_trustworthy then null
      else v_leader_speed-loc.smoothed_speed_mps end;
    v_speed_started:=case when v_speed_delta>=4.1666667
      then coalesce(previous.speed_difference_started_at,loc.sampled_at) else null end;
    v_speed_warning:=v_speed_started is not null and now()-v_speed_started>=interval '60 seconds';
    v_prediction_seconds:=case when v_speed_delta>=5 and v_leader_delta is not null
      and v_leader_delta<v_trip.warning_distance_meters
      then (v_trip.warning_distance_meters-v_leader_delta)/v_speed_delta end;
    v_prediction_started:=case when v_prediction_seconds between 0 and 120
      then coalesce(previous.prediction_started_at,loc.sampled_at) else null end;
    v_predicted:=v_prediction_started is not null and now()-v_prediction_started>=interval '30 seconds';
    if matched.navigation_state='ON_ROUTE' then
      if v_predicted then v_state:='FALLING_BEHIND';
      elsif v_leader_delta is not null and v_leader_delta< -25 then v_state:='AHEAD';
      elsif v_speed_trustworthy and loc.smoothed_speed_mps<1 then v_state:='STOPPED';
      end if;
    end if;
    select min(sequence) into v_next_step from public.trip_route_steps
      where route_id=v_route.id and progress_meters>coalesce(matched.progress_meters,-1);
    v_eta:=case when v_speed_trustworthy and loc.smoothed_speed_mps>=1.4 and v_remaining is not null
      then now()+make_interval(secs=>v_remaining/loc.smoothed_speed_mps) end;
    insert into public.trip_member_navigation_status(
      trip_id,user_id,route_id,navigation_state,planned_route_progress_meters,route_distance_meters,
      remaining_distance_meters,matched_sequence,next_step_sequence,speed_mps,smoothed_speed_mps,
      heading,leader_speed_delta_mps,leader_distance_delta_meters,estimated_arrival_at,
      speed_trustworthy,speed_difference_warning,falling_behind_predicted,
      speed_difference_started_at,prediction_started_at,deviation_sample_count,reroute_suggested,sampled_at
    ) values (
      p_trip_id,loc.user_id,v_route.id,v_state,matched.progress_meters,matched.distance_meters,
      v_remaining,matched.matched_sequence,v_next_step,loc.speed_mps,loc.smoothed_speed_mps,
      loc.heading,v_speed_delta,v_leader_delta,v_eta,v_speed_trustworthy,v_speed_warning,v_predicted,
      v_speed_started,v_prediction_started,v_deviation_count,
      loc.user_id=v_trip.route_leader_user_id and v_deviation_count>=2,loc.sampled_at
    ) on conflict(trip_id,user_id) do update set
      route_id=excluded.route_id,navigation_state=excluded.navigation_state,
      planned_route_progress_meters=excluded.planned_route_progress_meters,
      route_distance_meters=excluded.route_distance_meters,
      remaining_distance_meters=excluded.remaining_distance_meters,
      matched_sequence=excluded.matched_sequence,next_step_sequence=excluded.next_step_sequence,
      speed_mps=excluded.speed_mps,smoothed_speed_mps=excluded.smoothed_speed_mps,
      heading=excluded.heading,leader_speed_delta_mps=excluded.leader_speed_delta_mps,
      leader_distance_delta_meters=excluded.leader_distance_delta_meters,
      estimated_arrival_at=excluded.estimated_arrival_at,speed_trustworthy=excluded.speed_trustworthy,
      speed_difference_warning=excluded.speed_difference_warning,
      falling_behind_predicted=excluded.falling_behind_predicted,
      speed_difference_started_at=excluded.speed_difference_started_at,
      prediction_started_at=excluded.prediction_started_at,
      deviation_sample_count=excluded.deviation_sample_count,
      reroute_suggested=excluded.reroute_suggested,sampled_at=excluded.sampled_at,updated_at=now();
  end loop;

  -- The leader can advance waypoints exactly once through accepted location samples.
  update public.trip_route_waypoints w set reached_at=now()
  from public.trip_locations l where w.route_id=v_route.id and w.reached_at is null
    and l.trip_id=p_trip_id and l.user_id=v_trip.route_leader_user_id
    and l.sampled_at>=now()-interval '60 seconds'
    and public.route_distance_meters(w.latitude,w.longitude,l.latitude,l.longitude)<=w.radius_meters;

  -- Refresh leader-relative fields after the leader's current planned projection is known.
  select s.planned_route_progress_meters,s.smoothed_speed_mps into v_leader_progress,v_leader_speed
  from public.trip_member_navigation_status s where s.trip_id=p_trip_id
    and s.user_id=v_trip.route_leader_user_id;
  update public.trip_member_navigation_status s set
    leader_distance_delta_meters=case when v_leader_progress is null or s.planned_route_progress_meters is null
      then null else v_leader_progress-s.planned_route_progress_meters end,
    leader_speed_delta_mps=case when v_leader_speed is null or not s.speed_trustworthy
      then null else v_leader_speed-s.smoothed_speed_mps end,updated_at=now()
  where s.trip_id=p_trip_id;
end;
$$;

create or replace function public.submit_trip_location_v2(
  p_trip_id uuid,
  p_sample_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision,
  p_sampled_at timestamptz,
  p_route_candidate boolean default false,
  p_speed_mps double precision default null,
  p_heading double precision default null
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_previous public.trip_locations; v_smoothed double precision; v_count integer;
  v_new_sample boolean;
begin
  if p_speed_mps is not null and (p_speed_mps<0 or p_speed_mps>70) then
    raise exception 'Invalid location speed'; end if;
  if p_heading is not null and (p_heading<0 or p_heading>360) then
    raise exception 'Invalid location heading'; end if;
  select * into v_previous from public.trip_locations where trip_id=p_trip_id and user_id=auth.uid();
  perform public.submit_trip_location(p_trip_id,p_sample_id,p_latitude,p_longitude,p_accuracy,
    p_sampled_at,p_route_candidate);
  insert into public.trip_navigation_location_samples(trip_id,sample_id,user_id)
  values(p_trip_id,p_sample_id,auth.uid()) on conflict do nothing returning true into v_new_sample;
  if not coalesce(v_new_sample,false) then return; end if;
  if p_speed_mps is null or p_accuracy is null or p_accuracy>50 then
    v_smoothed:=v_previous.smoothed_speed_mps; v_count:=coalesce(v_previous.speed_sample_count,0);
  else
    v_smoothed:=case when v_previous.smoothed_speed_mps is null then p_speed_mps
      else 0.3*p_speed_mps+0.7*v_previous.smoothed_speed_mps end;
    v_count:=least(1000000,coalesce(v_previous.speed_sample_count,0)+1);
  end if;
  update public.trip_locations set speed_mps=p_speed_mps,smoothed_speed_mps=v_smoothed,
    speed_sample_count=v_count,heading=p_heading where trip_id=p_trip_id and user_id=auth.uid()
    and sampled_at=p_sampled_at;
  perform public.recompute_trip_navigation_statuses(p_trip_id);
end;
$$;

revoke all on function public.match_planned_route(uuid,double precision,double precision,double precision,double precision,double precision) from public;
revoke all on function public.save_trip_planned_route(uuid,double precision,double precision,text,double precision,double precision,text,jsonb,double precision,double precision,text,jsonb,jsonb,jsonb) from public;
revoke all on function public.recompute_trip_navigation_statuses(uuid) from public;
revoke all on function public.submit_trip_location_v2(uuid,uuid,double precision,double precision,double precision,timestamptz,boolean,double precision,double precision) from public;
grant execute on function public.match_planned_route(uuid,double precision,double precision,double precision,double precision,double precision) to service_role;
grant execute on function public.recompute_trip_navigation_statuses(uuid) to service_role;
grant execute on function public.save_trip_planned_route(uuid,double precision,double precision,text,double precision,double precision,text,jsonb,double precision,double precision,text,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.submit_trip_location_v2(uuid,uuid,double precision,double precision,double precision,timestamptz,boolean,double precision,double precision) to authenticated;

alter publication supabase_realtime add table public.trip_planned_routes;
alter publication supabase_realtime add table public.trip_route_waypoints;
alter publication supabase_realtime add table public.trip_member_navigation_status;

-- -----------------------------------------------------------------------------
-- notification_preferences.test.sql
-- -----------------------------------------------------------------------------
reset role;
insert into public.profiles(id, display_name) values
('91000000-0000-4000-8000-000000000001', 'Preference One'),
('91000000-0000-4000-8000-000000000002', 'Preference Two'),
('91000000-0000-4000-8000-000000000003', 'Preference Nonmember');
insert into public.trips(id, name, invite_code, created_by, status)
values('92000000-0000-4000-8000-000000000001', 'Preference test', 'TRIP-PREF1', '91000000-0000-4000-8000-000000000001', 'active');
insert into public.trip_members(trip_id, user_id, role) values
('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'organizer'),
('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'member');

insert into tap_results select has_table('public', 'trip_notification_preferences', 'notification preference table exists');
insert into tap_results select is(
  coalesce((select warning_enabled and critical_enabled and stop_enabled and stale_enabled and member_left_enabled
    from public.trip_notification_preferences where false), true),
  true,
  'missing row preserves enabled defaults'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000001';
insert into tap_results select lives_ok($$insert into public.trip_notification_preferences(trip_id,user_id)
  values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001')$$,
  'member can create own preferences');
insert into tap_results select is((select count(*)::integer from public.trip_notification_preferences), 1, 'member reads own preferences');
insert into tap_results select throws_ok($$insert into public.trip_notification_preferences(trip_id,user_id)
  values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "trip_notification_preferences"',
  'member cannot create another member preferences');

set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000003';
insert into tap_results select throws_ok($$insert into public.trip_notification_preferences(trip_id,user_id)
  values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003')$$,
  '42501', 'new row violates row-level security policy for table "trip_notification_preferences"',
  'non-member cannot create preferences');

set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000002';
insert into tap_results select is((select count(*)::integer from public.trip_notification_preferences), 0, 'member cannot read another member preferences');
update public.trip_notification_preferences set warning_enabled=false
where trip_id='92000000-0000-4000-8000-000000000001' and user_id='91000000-0000-4000-8000-000000000001';
reset role;
insert into tap_results select is((select warning_enabled from public.trip_notification_preferences
  where trip_id='92000000-0000-4000-8000-000000000001' and user_id='91000000-0000-4000-8000-000000000001'),
  true, 'member cannot update another member preferences');


-- -----------------------------------------------------------------------------
-- leader_route.test.sql
-- -----------------------------------------------------------------------------
reset role;
insert into public.profiles(id,display_name) values
('10000000-0000-4000-8000-000000000001','Leader'),
('10000000-0000-4000-8000-000000000002','Follower'),
('10000000-0000-4000-8000-000000000003','Inactive');
insert into public.trips(id,name,invite_code,created_by,status,route_leader_user_id) values
('20000000-0000-4000-8000-000000000001','Route test','TRIP-ROUTE1','10000000-0000-4000-8000-000000000001','active','10000000-0000-4000-8000-000000000001');
insert into public.trip_members(trip_id,user_id,role,sharing_enabled,sharing_mode) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','organizer',true,'always'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member',true,'always'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','member',false,'off');
insert into public.trip_routes(trip_id,route_leader_user_id,total_length_meters) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',333);
insert into public.trip_route_points(trip_id,route_version,sequence,sample_id,latitude,longitude,accuracy,cumulative_distance_meters,sampled_at) values
('20000000-0000-4000-8000-000000000001',1,1,'30000000-0000-4000-8000-000000000001',0,0,5,0,now()-interval '4 minutes'),
('20000000-0000-4000-8000-000000000001',1,2,'30000000-0000-4000-8000-000000000002',0,0.001,5,111,now()-interval '3 minutes'),
('20000000-0000-4000-8000-000000000001',1,3,'30000000-0000-4000-8000-000000000003',0.001,0.001,5,222,now()-interval '2 minutes'),
('20000000-0000-4000-8000-000000000001',1,4,'30000000-0000-4000-8000-000000000004',0.001,0,5,333,now()-interval '1 minute');

insert into tap_results select ok(abs(public.route_distance_meters(0,0,0,0.001)-111.19)<1,'straight route distance');
insert into tap_results select ok(public.route_distance_meters(0,0,0.001,0.001)>110,'curved route segment');
insert into tap_results select is((select round(progress_meters)::int from public.match_trip_route('20000000-0000-4000-8000-000000000001',0,0.0005,5,null,null)),56,'straight projection');
insert into tap_results select is((select state::text from public.match_trip_route('20000000-0000-4000-8000-000000000001',0.0005,0.001,5,null,null)),'ON_ROUTE','turn projection');
insert into tap_results select is((select state::text from public.match_trip_route('20000000-0000-4000-8000-000000000001',0.01,0.01,5,null,null)),'OFF_ROUTE','off route');
insert into tap_results select is((select state::text from public.match_trip_route('20000000-0000-4000-8000-000000000001',0.001,0.0001,5,25,80)),'OFF_ROUTE','continuity rejects false parallel/loop snap');
insert into tap_results select ok((select progress_meters from public.match_trip_route('20000000-0000-4000-8000-000000000001',0.001,0.0001,5,320,80))>300,'previous progress selects loop section');
insert into tap_results select ok(public.route_distance_meters(0,0,0,0.000001)<1,'GPS jitter is negligible');

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into tap_results select lives_ok($$select public.submit_trip_location('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005',0.001,0.0015,5,now(),true)$$,'leader appends route');
insert into tap_results select is((select count(*)::int from public.trip_route_points where sample_id='30000000-0000-4000-8000-000000000005'),1,'offline duplicate route point idempotent');
insert into tap_results select lives_ok($$select public.submit_trip_location('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005',0.001,0.0015,5,now(),true)$$,'duplicate replay accepted');
insert into tap_results select is((select count(*)::int from public.trip_route_points where sample_id='30000000-0000-4000-8000-000000000005'),1,'duplicate replay does not append');

-- submit_trip_location above already created the leader's latest-location row.
insert into public.trip_locations(trip_id,user_id,latitude,longitude,accuracy,sampled_at,updated_at) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',0,0.0005,5,now(),now());
select public.recompute_trip_route_statuses('20000000-0000-4000-8000-000000000001');
insert into tap_results select is((select state::text from public.trip_member_route_status where user_id='10000000-0000-4000-8000-000000000003'),'LOCATION_INACTIVE','inactive member state');
insert into tap_results select ok((select delta_meters from public.trip_member_route_status where user_id='10000000-0000-4000-8000-000000000002')>200,'member behind by route distance');

-- Discard the baseline episode produced while establishing projection state.
-- Threshold assertions below then measure only their own synthetic trip episodes.
delete from public.lag_alert_events where trip_id='20000000-0000-4000-8000-000000000001';
update public.trip_routes set total_length_meters=100 where trip_id='20000000-0000-4000-8000-000000000001';
select public.recompute_trip_route_statuses('20000000-0000-4000-8000-000000000001');
update public.trip_routes set total_length_meters=260 where trip_id='20000000-0000-4000-8000-000000000001';
select public.recompute_trip_route_statuses('20000000-0000-4000-8000-000000000001');
insert into tap_results select is((select count(*)::int from public.lag_alert_events where trip_id='20000000-0000-4000-8000-000000000001' and level='warning'),1,'200m warning episode');
select public.recompute_trip_route_statuses('20000000-0000-4000-8000-000000000001');
insert into tap_results select is((select count(*)::int from public.lag_alert_events where trip_id='20000000-0000-4000-8000-000000000001' and level='warning'),1,'concurrent/replay warning dedupe');
update public.trip_routes set total_length_meters=560 where trip_id='20000000-0000-4000-8000-000000000001';
select public.recompute_trip_route_statuses('20000000-0000-4000-8000-000000000001');
insert into tap_results select is((select count(*)::int from public.lag_alert_events where trip_id='20000000-0000-4000-8000-000000000001' and level='critical'),1,'500m critical episode');
insert into tap_results select ok((select delta_meters from public.trip_member_route_status where user_id='10000000-0000-4000-8000-000000000002')>0,'behind delta remains positive');
update public.trip_routes set total_length_meters=10 where trip_id='20000000-0000-4000-8000-000000000001';
select public.recompute_trip_route_statuses('20000000-0000-4000-8000-000000000001');
insert into tap_results select ok((select delta_meters from public.trip_member_route_status where user_id='10000000-0000-4000-8000-000000000002')<0,'ahead delta is not clamped');
insert into tap_results select ok((select warning_armed and critical_armed from public.lag_alert_states where user_id='10000000-0000-4000-8000-000000000002'),'threshold hysteresis rearms');

insert into tap_results select lives_ok($$select public.set_route_leader('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')$$,'matched leader transfer');
update public.trips set status='completed' where id='20000000-0000-4000-8000-000000000001';
insert into tap_results select throws_ok($$select public.set_route_leader('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')$$,'Completed trips reject route leader changes','trip completion blocks leader transfer');
insert into tap_results select is((select count(*)::int from public.trip_route_points where trip_id='20000000-0000-4000-8000-000000000001'),5,'completed route history preserved');


-- -----------------------------------------------------------------------------
-- active_trip_workspace.test.sql
-- -----------------------------------------------------------------------------
reset role;
insert into public.profiles(id,display_name) values
('a1000000-0000-4000-8000-000000000001','Workspace Host'),
('a1000000-0000-4000-8000-000000000002','Workspace Member'),
('a1000000-0000-4000-8000-000000000003','Workspace Outsider');
insert into public.trips(id,name,invite_code,created_by,status,started_at)
values('a2000000-0000-4000-8000-000000000001','Workspace test','TRIP-WORK1','a1000000-0000-4000-8000-000000000001','active',now()-interval '1 hour');
insert into public.trip_members(trip_id,user_id,role) values
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','organizer'),
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','member');

insert into tap_results select has_column('public','trips','warning_distance_meters','warning threshold exists');
insert into tap_results select has_column('public','trip_members','sharing_expires_at','timed sharing expiry exists');
insert into tap_results select has_column('public','trip_stops','review_status','stop review state exists');
insert into tap_results select has_table('public','trip_member_events','member event table exists');

set local role authenticated;
set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000001';
insert into tap_results select lives_ok($$select public.update_trip_alert_thresholds('a2000000-0000-4000-8000-000000000001',250,600)$$,'organizer updates thresholds');
insert into tap_results select is((select warning_distance_meters from public.trips where id='a2000000-0000-4000-8000-000000000001'),250,'warning threshold persisted');
insert into tap_results select throws_ok($$select public.update_trip_alert_thresholds('a2000000-0000-4000-8000-000000000001',425,600)$$,'P0001','Invalid alert thresholds','invalid threshold rejected');

set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000002';
insert into tap_results select throws_ok($$select public.update_trip_alert_thresholds('a2000000-0000-4000-8000-000000000001',200,500)$$,'P0001','Organizer required','member cannot update thresholds');
insert into tap_results select lives_ok($$select public.set_trip_sharing('a2000000-0000-4000-8000-000000000001','foreground',120)$$,'member enables timed sharing');
insert into tap_results select ok((select sharing_expires_at>now()+interval '119 minutes' from public.trip_members where trip_id='a2000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000002'),'expiry is server assigned');

reset role;
insert into public.trip_stops(id,trip_id,user_id,latitude,longitude,title,source,arrived_at,review_status)
values('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',10,20,'Auto','automatic',now()-interval '10 minutes','needs_review');
set local role authenticated;
set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000001';
insert into tap_results select lives_ok($$select public.review_trip_stop('a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','confirm','Confirmed',null,'food',now())$$,'organizer confirms automatic stop');
insert into tap_results select is((select review_status::text from public.trip_stops where id='a3000000-0000-4000-8000-000000000001'),'confirmed','review persisted');
insert into tap_results select is((select latitude from public.trip_stops where id='a3000000-0000-4000-8000-000000000001'),10::double precision,'review cannot mutate coordinates');
insert into tap_results select ok((select elapsed_seconds>=3500 and stop_count=1 from public.get_trip_statistics('a2000000-0000-4000-8000-000000000001')),'member reads canonical statistics');

insert into tap_results select ok(not has_table_privilege('authenticated','public.trip_stops','UPDATE'),'direct stop metadata updates are revoked');
set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000002';
insert into tap_results select lives_ok($$select public.update_own_trip_stop('a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',null,null,now(),null)$$,'owner records automatic stop departure through validated RPC');
insert into tap_results select throws_ok($$select public.review_trip_stop('a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','confirm')$$,'P0001','Active trip organizer required','member cannot review an automatic stop');

reset role;
insert into public.trip_member_events(trip_id,user_id,event_type) values
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','member_removed');
set local role authenticated;
set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000001';
insert into tap_results select is((select count(*)::integer from public.trip_member_events where trip_id='a2000000-0000-4000-8000-000000000001'),1,'member reads trip alert history');
set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000003';
insert into tap_results select is((select count(*)::integer from public.trip_member_events where trip_id='a2000000-0000-4000-8000-000000000001'),0,'outsider cannot read trip alert history');
insert into tap_results select is((select count(*)::integer from public.get_trip_statistics('a2000000-0000-4000-8000-000000000001')),0,'outsider cannot read trip statistics');

reset role;
update public.trip_members set sharing_expires_at=now()-interval '1 minute' where trip_id='a2000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000002';
insert into tap_results select isnt(public.member_can_share('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002'),true,'expired timed sharing is inactive');
update public.trip_members set sharing_expires_at=null where trip_id='a2000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000002';
insert into tap_results select lives_ok($$select public.leave_trip('a2000000-0000-4000-8000-000000000001')$$,'member leaves through canonical RPC');
set local "request.jwt.claim.sub"='a1000000-0000-4000-8000-000000000001';
insert into tap_results select is((select count(*)::integer from public.trip_member_events where trip_id='a2000000-0000-4000-8000-000000000001' and event_type='member_left'),1,'leave creates one departure event');
insert into tap_results select is((select count(*)::integer from public.trip_members where trip_id='a2000000-0000-4000-8000-000000000001' and user_id='a1000000-0000-4000-8000-000000000002'),0,'leave removes membership');


-- -----------------------------------------------------------------------------
-- route_navigation_v2.test.sql
-- -----------------------------------------------------------------------------
reset role;
insert into public.profiles(id,display_name) values
('b1000000-0000-4000-8000-000000000001','Navigation Host'),
('b1000000-0000-4000-8000-000000000002','Navigation Member'),
('b1000000-0000-4000-8000-000000000003','Navigation Outsider');
insert into public.trips(id,name,invite_code,created_by,status,route_leader_user_id) values
('b2000000-0000-4000-8000-000000000001','Navigation test','TRIP-NAVV2','b1000000-0000-4000-8000-000000000001','active','b1000000-0000-4000-8000-000000000001');
insert into public.trip_members(trip_id,user_id,role,sharing_enabled,sharing_mode) values
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','organizer',true,'always'),
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','member',true,'always');

insert into tap_results select has_table('public','trip_planned_routes','planned routes table exists');
insert into tap_results select has_table('public','trip_member_navigation_status','navigation status table exists');
insert into tap_results select has_function('public','submit_trip_location',array['uuid','uuid','double precision','double precision','double precision','timestamp with time zone','boolean'],'V1 location RPC contract remains available');
insert into tap_results select has_function('public','submit_trip_location_v2',array['uuid','uuid','double precision','double precision','double precision','timestamp with time zone','boolean','double precision','double precision'],'V2 location RPC has a separate contract');

set local role authenticated;
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';
insert into tap_results select lives_ok($$select public.submit_trip_location(
  'b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001',0,0,5,now(),false
)$$,'V1 client location write still works');
insert into tap_results select lives_ok($$select public.submit_trip_location_v2(
  'b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002',0,0.0001,5,now(),false,12,90
)$$,'V2 client location write works without planned route');
insert into tap_results select is((select round(speed_mps)::integer from public.trip_locations where trip_id='b2000000-0000-4000-8000-000000000001' and user_id='b1000000-0000-4000-8000-000000000001'),12,'V2 speed persists');
insert into tap_results select lives_ok($$select public.submit_trip_location_v2(
  'b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002',0,0.0001,5,now(),false,12,90
)$$,'V2 duplicate sample replay is accepted');
insert into tap_results select is((select speed_sample_count from public.trip_locations where trip_id='b2000000-0000-4000-8000-000000000001' and user_id='b1000000-0000-4000-8000-000000000001'),1,'V2 duplicate replay does not skew speed samples');

insert into tap_results select lives_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'Origin',0,0.003,'Destination',
  '{"type":"LineString","coordinates":[[0,0],[0.001,0],[0.002,0],[0.003,0]]}'::jsonb,
  333,30,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0},{"sequence":1,"latitude":0,"longitude":0.001,"cumulative_distance_meters":111},{"sequence":2,"latitude":0,"longitude":0.002,"cumulative_distance_meters":222},{"sequence":3,"latitude":0,"longitude":0.003,"cumulative_distance_meters":333}]'::jsonb,
  '[{"sequence":1,"title":"Fuel","latitude":0,"longitude":0.002,"radius_meters":75}]'::jsonb,
  '[{"sequence":0,"instruction":"Depart","road_name":"Test Road","maneuver_type":"depart","latitude":0,"longitude":0,"progress_meters":0,"distance_meters":333,"duration_seconds":30}]'::jsonb
)$$,'organizer saves planned route');
insert into tap_results select is((select version from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001' and is_current),1,'first route version is current');
insert into tap_results select is((select count(*)::integer from public.trip_route_waypoints where trip_id='b2000000-0000-4000-8000-000000000001'),1,'waypoint persisted');

set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000002';
insert into tap_results select throws_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'Origin',0,0.003,'Destination',
  '{"type":"LineString","coordinates":[[0,0],[0.003,0]]}'::jsonb,333,30,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0},{"sequence":1,"latitude":0,"longitude":0.003,"cumulative_distance_meters":333}]'::jsonb
)$$,'P0001','Organizer required','member cannot save planned route');

set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';
insert into tap_results select lives_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'New origin',0,0.004,'New destination',
  '{"type":"LineString","coordinates":[[0,0],[0.004,0]]}'::jsonb,444,40,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0},{"sequence":1,"latitude":0,"longitude":0.004,"cumulative_distance_meters":444}]'::jsonb
)$$,'organizer creates a new route version');
insert into tap_results select is((select count(*)::integer from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001'),2,'route history is preserved');
insert into tap_results select is((select version from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001' and is_current),2,'new route version becomes current');

insert into tap_results select throws_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'Bad',0,0.005,'Bad route',
  '{"type":"LineString","coordinates":[[0,0],[0.005,0]]}'::jsonb,555,50,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0}]'::jsonb
)$$,'P0001','Invalid route geometry points','invalid route transaction is rejected');
insert into tap_results select is((select count(*)::integer from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001'),2,'failed route save rolls back without a partial version');

set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000003';
insert into tap_results select is((select count(*)::integer from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001'),0,'outsider cannot read planned route');
insert into tap_results select is((select count(*)::integer from public.trip_member_navigation_status where trip_id='b2000000-0000-4000-8000-000000000001'),0,'outsider cannot read navigation status');

reset role;
update public.trips set status='completed' where id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';
insert into tap_results select throws_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'Origin',0,0.003,'Destination',
  '{"type":"LineString","coordinates":[[0,0],[0.003,0]]}'::jsonb,333,30,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0},{"sequence":1,"latitude":0,"longitude":0.003,"cumulative_distance_meters":333}]'::jsonb
)$$,'P0001','Completed trips reject route changes','completed trip remains immutable');

reset role;
insert into tap_results select * from finish();

do $$
declare
  v_passed integer;
  v_failed integer;
  v_failures text;
begin
  select count(*) filter (where line like 'ok %'),
    count(*) filter (where line like 'not ok%'),
    string_agg(line, E'\n' order by line) filter (where line like 'not ok%')
  into v_passed,v_failed,v_failures
  from tap_results;

  if v_failed > 0 then
    raise exception using
      errcode='P0001',
      message=format('VALIDATION FAILED: %s passed, %s failed. %s',v_passed,v_failed,v_failures);
  end if;
  if v_passed <> 76 then
    raise exception using
      errcode='P0001',
      message=format('VALIDATION INCOMPLETE: expected 76 passing tests, observed %s',v_passed);
  end if;
  raise exception using
    errcode='P0001',
    message='VALIDATION PASSED: all 76 pgTAP tests passed; V2 changes rolled back';
end;
$$;
