create type public.stop_category as enum ('general', 'lodging', 'food', 'viewpoint', 'fuel');
create type public.stop_review_status as enum ('not_required', 'needs_review', 'confirmed');
create type public.trip_member_event_type as enum ('member_left', 'member_removed');

alter table public.trips
  add column warning_distance_meters integer not null default 200,
  add column critical_distance_meters integer not null default 500,
  add constraint trips_alert_thresholds_valid check (
    warning_distance_meters between 100 and 400
    and critical_distance_meters between 300 and 2000
    and warning_distance_meters % 50 = 0
    and critical_distance_meters % 50 = 0
    and critical_distance_meters >= warning_distance_meters + 100
  );

alter table public.trip_members add column sharing_expires_at timestamptz;
alter table public.trip_members add constraint trip_members_sharing_expiry_valid
  check (sharing_mode <> 'off' or sharing_expires_at is null);

alter table public.trip_stops
  add column category public.stop_category not null default 'general',
  add column review_status public.stop_review_status not null default 'not_required',
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz;
update public.trip_stops set review_status='confirmed',reviewed_at=updated_at where source='automatic';

create or replace function public.canonicalize_new_stop_review() returns trigger
language plpgsql set search_path=public as $$
begin
  new.category:=coalesce(new.category,'general');
  new.review_status:=case when new.source='automatic' then 'needs_review'::public.stop_review_status else 'not_required'::public.stop_review_status end;
  new.reviewed_by:=null;
  new.reviewed_at:=null;
  return new;
end; $$;
create trigger trip_stop_review_before_insert before insert on public.trip_stops
for each row execute function public.canonicalize_new_stop_review();

alter table public.trip_notification_preferences
  add column member_left_enabled boolean not null default true;

create table public.trip_member_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  event_type public.trip_member_event_type not null,
  created_at timestamptz not null default now()
);
create index trip_member_events_trip_idx on public.trip_member_events(trip_id,created_at desc);
alter table public.trip_member_events enable row level security;
create policy trip_member_events_read_members on public.trip_member_events for select to authenticated
using(public.is_trip_member(trip_id));
create policy lag_alert_events_read_members on public.lag_alert_events for select to authenticated
using(public.is_trip_member(trip_id));
create policy stale_alert_episodes_read_members on public.stale_alert_episodes for select to authenticated
using(public.is_trip_member(trip_id));
grant select on public.trip_member_events,public.lag_alert_events,public.stale_alert_episodes to authenticated;

create or replace function public.member_can_share(p_trip_id uuid,p_user_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id
    and sharing_enabled and sharing_mode<>'off' and (sharing_expires_at is null or sharing_expires_at>now()));
$$;

create or replace function public.set_trip_sharing(
  p_trip_id uuid,p_mode public.sharing_mode,p_duration_minutes integer default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.trip_is_active(p_trip_id) then raise exception 'Trip must be active'; end if;
  if p_duration_minutes is not null and p_duration_minutes<>120 then raise exception 'Invalid sharing duration'; end if;
  update public.trip_members set sharing_mode=p_mode,sharing_enabled=(p_mode<>'off'),
    sharing_expires_at=case when p_mode='off' then null when p_duration_minutes is null then null else now()+make_interval(mins=>p_duration_minutes) end
  where trip_id=p_trip_id and user_id=auth.uid();
  if not found then raise exception 'Trip membership required'; end if;
end; $$;

create or replace function public.end_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  update public.trips set status='completed',ended_at=now() where id=p_trip_id and status='active';
  if not found then raise exception 'Trip must be active'; end if;
  update public.trip_members set sharing_enabled=false,sharing_mode='off',sharing_expires_at=null where trip_id=p_trip_id;
  delete from public.trip_locations where trip_id=p_trip_id;
end; $$;

create or replace function public.update_trip_alert_thresholds(
  p_trip_id uuid,p_warning_meters integer,p_critical_meters integer
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  if p_warning_meters not between 100 and 400 or p_critical_meters not between 300 and 2000
    or p_warning_meters%50<>0 or p_critical_meters%50<>0
    or p_critical_meters<p_warning_meters+100 then raise exception 'Invalid alert thresholds'; end if;
  update public.trips set warning_distance_meters=p_warning_meters,
    critical_distance_meters=p_critical_meters,updated_at=now()
  where id=p_trip_id and status in ('planned','active');
  if not found then raise exception 'Trip settings are read-only'; end if;
  update public.lag_alert_states s set
    warning_armed=not exists(select 1 from public.trip_member_route_status r where r.trip_id=s.trip_id and r.user_id=s.user_id and r.state='ON_ROUTE' and r.delta_meters>=p_warning_meters),
    critical_armed=not exists(select 1 from public.trip_member_route_status r where r.trip_id=s.trip_id and r.user_id=s.user_id and r.state='ON_ROUTE' and r.delta_meters>=p_critical_meters),updated_at=now()
  where s.trip_id=p_trip_id;
end; $$;

create or replace function public.recompute_trip_route_statuses(p_trip_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_trip public.trips;v_leader_progress double precision;loc record;previous record;matched record;
  max_change double precision;elapsed_seconds double precision;alert_state public.lag_alert_states;v_delta double precision;
begin
  select * into v_trip from public.trips where id=p_trip_id for update;
  if not found or v_trip.status<>'active' or v_trip.route_leader_user_id is null then return;end if;
  select total_length_meters into v_leader_progress from public.trip_routes where trip_id=p_trip_id;
  if v_leader_progress is null then return;end if;
  for loc in select l.*,m.user_id member_user_id,m.sharing_enabled,m.sharing_expires_at from public.trip_members m
    left join public.trip_locations l on l.trip_id=m.trip_id and l.user_id=m.user_id where m.trip_id=p_trip_id
  loop
    if not loc.sharing_enabled or (loc.sharing_expires_at is not null and loc.sharing_expires_at<=now())
      or loc.sampled_at is null or loc.sampled_at<now()-interval '5 minutes' then
      insert into public.trip_member_route_status(trip_id,user_id,state,sampled_at) values(p_trip_id,loc.member_user_id,'LOCATION_INACTIVE',loc.sampled_at)
      on conflict(trip_id,user_id) do update set state='LOCATION_INACTIVE',route_progress_meters=null,route_distance_meters=null,
        leader_progress_meters=null,delta_meters=null,matched_sequence=null,sampled_at=excluded.sampled_at,updated_at=now();
      continue;
    end if;
    if loc.member_user_id=v_trip.route_leader_user_id then
      insert into public.trip_member_route_status(trip_id,user_id,state,route_version,route_progress_meters,route_distance_meters,leader_progress_meters,delta_meters,sampled_at)
      values(p_trip_id,loc.member_user_id,'ON_ROUTE',1,v_leader_progress,0,v_leader_progress,0,loc.sampled_at)
      on conflict(trip_id,user_id) do update set state='ON_ROUTE',route_version=1,route_progress_meters=v_leader_progress,
        route_distance_meters=0,leader_progress_meters=v_leader_progress,delta_meters=0,sampled_at=excluded.sampled_at,updated_at=now();
      continue;
    end if;
    select * into previous from public.trip_member_route_status where trip_id=p_trip_id and user_id=loc.member_user_id;
    elapsed_seconds:=greatest(1,extract(epoch from(loc.sampled_at-coalesce(previous.sampled_at,loc.sampled_at))));
    max_change:=case when previous.route_progress_meters is null then null else greatest(250.0,elapsed_seconds*55.0+coalesce(loc.accuracy,40.0)*2.0) end;
    select * into matched from public.match_trip_route(p_trip_id,loc.latitude,loc.longitude,loc.accuracy,previous.route_progress_meters,max_change) limit 1;
    v_delta:=case when matched.state='ON_ROUTE' then v_leader_progress-matched.progress_meters end;
    insert into public.trip_member_route_status(trip_id,user_id,state,route_version,route_progress_meters,route_distance_meters,leader_progress_meters,delta_meters,matched_sequence,sampled_at)
    values(p_trip_id,loc.member_user_id,matched.state,case when matched.state='ON_ROUTE' then 1 end,matched.progress_meters,matched.distance_meters,v_leader_progress,v_delta,matched.matched_sequence,loc.sampled_at)
    on conflict(trip_id,user_id) do update set state=excluded.state,route_version=excluded.route_version,route_progress_meters=excluded.route_progress_meters,
      route_distance_meters=excluded.route_distance_meters,leader_progress_meters=excluded.leader_progress_meters,delta_meters=excluded.delta_meters,
      matched_sequence=excluded.matched_sequence,sampled_at=excluded.sampled_at,updated_at=now();
    insert into public.lag_alert_states(trip_id,user_id) values(p_trip_id,loc.member_user_id) on conflict(trip_id,user_id) do nothing;
    select * into alert_state from public.lag_alert_states where trip_id=p_trip_id and user_id=loc.member_user_id for update;
    if matched.state<>'ON_ROUTE' then continue;end if;
    if v_delta<v_trip.warning_distance_meters*0.75 then alert_state.warning_armed:=true;end if;
    if v_delta<v_trip.critical_distance_meters*0.80 then alert_state.critical_armed:=true;end if;
    if v_delta>=v_trip.critical_distance_meters and alert_state.critical_armed then
      insert into public.lag_alert_events(trip_id,user_id,level,behind_meters) values(p_trip_id,loc.member_user_id,'critical',round(v_delta)::integer);
      alert_state.critical_armed:=false;alert_state.warning_armed:=false;
    elsif v_delta>=v_trip.warning_distance_meters and alert_state.warning_armed then
      insert into public.lag_alert_events(trip_id,user_id,level,behind_meters) values(p_trip_id,loc.member_user_id,'warning',round(v_delta)::integer);
      alert_state.warning_armed:=false;
    end if;
    update public.lag_alert_states set warning_armed=alert_state.warning_armed,critical_armed=alert_state.critical_armed,updated_at=now()
    where trip_id=p_trip_id and user_id=loc.member_user_id;
  end loop;
end; $$;

create or replace function public.review_trip_stop(
  p_trip_id uuid,p_stop_id uuid,p_action text,p_title text default null,p_note text default null,
  p_category public.stop_category default null,p_departed_at timestamptz default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_stop public.trip_stops;
begin
  if not public.is_trip_organizer(p_trip_id) or not public.trip_is_active(p_trip_id) then raise exception 'Active trip organizer required'; end if;
  select * into v_stop from public.trip_stops where id=p_stop_id and trip_id=p_trip_id for update;
  if not found or v_stop.source<>'automatic' then raise exception 'Automatic stop required'; end if;
  if p_action='delete' then delete from public.trip_stops where id=p_stop_id; return;
  elsif p_action<>'confirm' then raise exception 'Invalid review action'; end if;
  if p_title is not null and char_length(trim(p_title)) not between 1 and 160 then raise exception 'Invalid title'; end if;
  if p_note is not null and char_length(p_note)>2000 then raise exception 'Invalid note'; end if;
  if p_departed_at is not null and p_departed_at<v_stop.arrived_at then raise exception 'Invalid departure'; end if;
  update public.trip_stops set title=coalesce(trim(p_title),title),note=coalesce(p_note,note),
    category=coalesce(p_category,category),departed_at=coalesce(p_departed_at,departed_at),
    review_status='confirmed',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_stop_id;
end; $$;

create or replace function public.update_own_trip_stop(
  p_trip_id uuid,p_stop_id uuid,p_title text default null,p_note text default null,
  p_departed_at timestamptz default null,p_photo_path text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_stop public.trip_stops;
begin
  if auth.uid() is null or not public.trip_is_active(p_trip_id) then raise exception 'Active trip membership required'; end if;
  select * into v_stop from public.trip_stops where id=p_stop_id and trip_id=p_trip_id and user_id=auth.uid() for update;
  if not found then raise exception 'Canonical stop ownership required'; end if;
  if p_title is not null and char_length(trim(p_title)) not between 1 and 160 then raise exception 'Invalid title'; end if;
  if p_note is not null and char_length(p_note)>2000 then raise exception 'Invalid note'; end if;
  if p_departed_at is not null and p_departed_at<v_stop.arrived_at then raise exception 'Invalid departure'; end if;
  if p_photo_path is not null and p_photo_path<>(p_trip_id::text||'/'||p_stop_id::text||'/photo.jpg') then raise exception 'Invalid photo path'; end if;
  if v_stop.source='automatic' and (p_title is not null or p_note is not null) then raise exception 'Organizer review required'; end if;
  update public.trip_stops set title=coalesce(trim(p_title),title),note=coalesce(p_note,note),
    departed_at=coalesce(p_departed_at,departed_at),photo_path=coalesce(p_photo_path,photo_path),updated_at=now()
  where id=p_stop_id;
end; $$;

create or replace function public.get_trip_statistics(p_trip_id uuid)
returns table(elapsed_seconds bigint,route_distance_meters double precision,stop_count bigint,stopped_seconds bigint,moving_seconds bigint)
language sql stable security definer set search_path=public as $$
  with trip_data as (
    select greatest(0,extract(epoch from (coalesce(ended_at,case when status='active' then now() else started_at end)-started_at)))::bigint elapsed
    from public.trips where id=p_trip_id and public.is_trip_member(id)
  ), intervals as (
    select arrived_at s,least(coalesce(departed_at,now()),coalesce((select ended_at from public.trips where id=p_trip_id),now())) e
    from public.trip_stops where trip_id=p_trip_id and source='automatic' and review_status='confirmed'
      and arrived_at<coalesce(departed_at,now())
  ), ordered as (
    select s,e,max(e) over(order by s rows between unbounded preceding and 1 preceding) previous_end from intervals
  ), grouped as (
    select s,e,sum(case when previous_end is null or s>previous_end then 1 else 0 end) over(order by s) grp from ordered
  ), merged as (select min(s) s,max(e) e from grouped group by grp), totals as (
    select coalesce(sum(extract(epoch from(e-s))),0)::bigint stopped from merged
  )
  select t.elapsed,coalesce(r.total_length_meters,0),
    (select count(*) from public.trip_stops where trip_id=p_trip_id),least(t.elapsed,x.stopped),greatest(0,t.elapsed-least(t.elapsed,x.stopped))
  from trip_data t cross join totals x left join public.trip_routes r on r.trip_id=p_trip_id;
$$;

create or replace function public.list_trip_alert_events(p_trip_id uuid,p_limit integer default 50)
returns table(id text,event_type text,user_id uuid,display_name text,created_at timestamptz,behind_meters integer)
language sql stable security definer set search_path=public as $$
  select e.id,e.event_type,e.user_id,e.display_name,e.created_at,e.behind_meters from (
    select l.id::text,l.level::text event_type,l.user_id,p.display_name,l.created_at,l.behind_meters from public.lag_alert_events l join public.profiles p on p.id=l.user_id where l.trip_id=p_trip_id
    union all select s.id::text,'stale',s.stale_user_id,p.display_name,s.detected_at,null from public.stale_alert_episodes s join public.profiles p on p.id=s.stale_user_id where s.trip_id=p_trip_id
    union all select m.id::text,m.event_type::text,m.user_id,p.display_name,m.created_at,null from public.trip_member_events m join public.profiles p on p.id=m.user_id where m.trip_id=p_trip_id
  ) e where public.is_trip_member(p_trip_id) order by e.created_at desc limit least(greatest(p_limit,1),50);
$$;

create or replace function public.leave_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_role public.trip_role;v_status public.trip_status;v_leader uuid;v_user uuid:=auth.uid();
begin
  select tm.role,t.status,t.route_leader_user_id into v_role,v_status,v_leader from public.trip_members tm join public.trips t on t.id=tm.trip_id where tm.trip_id=p_trip_id and tm.user_id=v_user;
  if not found then return; end if;
  if v_role='organizer' then raise exception 'Organizer cannot leave; retain historical ownership'; end if;
  if v_status='active' and v_leader=v_user then raise exception 'Transfer Route Leader before leaving'; end if;
  insert into public.trip_member_events(trip_id,user_id,event_type) values(p_trip_id,v_user,'member_left');
  delete from public.trip_members where trip_id=p_trip_id and user_id=v_user;
end; $$;

create or replace function public.remove_trip_member(p_trip_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  if p_user_id=auth.uid() then raise exception 'Organizer cannot remove self'; end if;
  if exists(select 1 from public.trips where id=p_trip_id and status='active' and route_leader_user_id=p_user_id) then raise exception 'Transfer Route Leader before removing this member'; end if;
  if exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='member') then
    insert into public.trip_member_events(trip_id,user_id,event_type) values(p_trip_id,p_user_id,'member_removed');
    delete from public.trip_members where trip_id=p_trip_id and user_id=p_user_id and role='member';
  end if;
end; $$;

create or replace function public.notify_trip_member_event() returns trigger
language plpgsql security definer set search_path=public,vault,net as $$
declare webhook_secret text;
begin
  begin
    select decrypted_secret into webhook_secret from vault.decrypted_secrets where name='triptrack_database_webhook_secret' limit 1;
    if webhook_secret is null or length(webhook_secret)<32 then raise warning 'TripTrack member notification skipped: webhook secret is not configured';return new;end if;
    perform net.http_post(url:='https://fdykfiejzmwdesczduun.supabase.co/functions/v1/send-member-departure',
      headers:=jsonb_build_object('Content-Type','application/json','x-triptrack-webhook-secret',webhook_secret),
      body:=jsonb_build_object('type','INSERT','table','trip_member_events','record',to_jsonb(new)));
  exception when others then raise warning 'TripTrack member notification enqueue failed';
  end;
  return new;
end; $$;
create trigger trip_member_event_after_insert after insert on public.trip_member_events for each row execute function public.notify_trip_member_event();

revoke all on function public.set_trip_sharing(uuid,public.sharing_mode,integer) from public;
revoke all on function public.update_trip_alert_thresholds(uuid,integer,integer) from public;
revoke all on function public.review_trip_stop(uuid,uuid,text,text,text,public.stop_category,timestamptz) from public;
revoke all on function public.update_own_trip_stop(uuid,uuid,text,text,timestamptz,text) from public;
revoke all on function public.get_trip_statistics(uuid) from public;
revoke all on function public.list_trip_alert_events(uuid,integer) from public;
grant execute on function public.set_trip_sharing(uuid,public.sharing_mode,integer) to authenticated;
grant execute on function public.update_trip_alert_thresholds(uuid,integer,integer) to authenticated;
grant execute on function public.review_trip_stop(uuid,uuid,text,text,text,public.stop_category,timestamptz) to authenticated;
grant execute on function public.update_own_trip_stop(uuid,uuid,text,text,timestamptz,text) to authenticated;
grant execute on function public.get_trip_statistics(uuid) to authenticated;
grant execute on function public.list_trip_alert_events(uuid,integer) to authenticated;
alter publication supabase_realtime add table public.trip_member_events;
alter publication supabase_realtime add table public.stale_alert_episodes;

revoke update on public.trip_stops from authenticated;
