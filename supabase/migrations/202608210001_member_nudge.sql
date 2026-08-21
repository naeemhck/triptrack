-- Member nudge: a trip member can send a "where are you?" prompt to another
-- member of an active trip. Events fan out through the same pg_net -> edge
-- function -> Expo push pipeline as lag/departure alerts, with per-recipient
-- preference gating and notification_deliveries idempotency.

alter table public.trip_notification_preferences
  add column nudge_enabled boolean not null default true;

create table public.member_nudge_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete restrict,
  to_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint member_nudge_no_self check (to_user_id <> from_user_id)
);
create index member_nudge_events_trip_idx on public.member_nudge_events(trip_id,created_at desc);
create index member_nudge_events_rate_idx on public.member_nudge_events(from_user_id,to_user_id,created_at desc);

alter table public.member_nudge_events enable row level security;
create policy member_nudge_events_read_members on public.member_nudge_events for select to authenticated
using(public.is_trip_member(trip_id));
-- No insert/update/delete policies: rows are created only inside send_member_nudge.
grant select on public.member_nudge_events to authenticated;

create or replace function public.send_member_nudge(p_trip_id uuid,p_to_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_event uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_to_user_id is null then raise exception 'Target member is required'; end if;
  if p_to_user_id=v_user then raise exception 'Cannot nudge yourself'; end if;
  if not public.trip_is_active(p_trip_id) then raise exception 'Trip must be active'; end if;
  if not public.is_trip_member(p_trip_id) then raise exception 'Trip membership required'; end if;
  if not exists(select 1 from public.trip_members where trip_id=p_trip_id and user_id=p_to_user_id) then
    raise exception 'Target must be a trip member';
  end if;
  if exists(select 1 from public.member_nudge_events
    where trip_id=p_trip_id and from_user_id=v_user and to_user_id=p_to_user_id
    and created_at>now()-interval '5 minutes') then
    raise exception 'This member was nudged recently; wait a few minutes';
  end if;
  insert into public.member_nudge_events(trip_id,from_user_id,to_user_id)
  values(p_trip_id,v_user,p_to_user_id)
  returning id into v_event;
  return v_event;
end; $$;
revoke all on function public.send_member_nudge(uuid,uuid) from public;
grant execute on function public.send_member_nudge(uuid,uuid) to authenticated;

create or replace function public.notify_member_nudge() returns trigger
language plpgsql security definer set search_path=public,vault,net as $$
declare webhook_secret text;
begin
  begin
    select decrypted_secret into webhook_secret from vault.decrypted_secrets
    where name='triptrack_database_webhook_secret' limit 1;
    if webhook_secret is null or length(webhook_secret)<32 then
      raise warning 'TripTrack nudge dispatch skipped: webhook secret is not configured';
      return new;
    end if;
    perform net.http_post(
      url:='https://fdykfiejzmwdesczduun.supabase.co/functions/v1/send-member-nudge',
      headers:=jsonb_build_object('Content-Type','application/json','x-triptrack-webhook-secret',webhook_secret),
      body:=jsonb_build_object('type','INSERT','table','member_nudge_events','record',to_jsonb(new)));
  exception when others then
    raise warning 'TripTrack nudge dispatch could not be queued';
  end;
  return new;
end; $$;
create trigger member_nudge_after_insert after insert on public.member_nudge_events
for each row execute function public.notify_member_nudge();

-- Nudges appear in the in-app activity feed regardless of push preferences.
create or replace function public.list_trip_alert_events(p_trip_id uuid,p_limit integer default 50)
returns table(id text,event_type text,user_id uuid,display_name text,created_at timestamptz,behind_meters integer)
language sql stable security definer set search_path=public as $$
  select e.id,e.event_type,e.user_id,e.display_name,e.created_at,e.behind_meters from (
    select l.id::text,l.level::text event_type,l.user_id,p.display_name,l.created_at,l.behind_meters from public.lag_alert_events l join public.profiles p on p.id=l.user_id where l.trip_id=p_trip_id
    union all select s.id::text,'stale',s.stale_user_id,p.display_name,s.detected_at,null from public.stale_alert_episodes s join public.profiles p on p.id=s.stale_user_id where s.trip_id=p_trip_id
    union all select m.id::text,m.event_type::text,m.user_id,p.display_name,m.created_at,null from public.trip_member_events m join public.profiles p on p.id=m.user_id where m.trip_id=p_trip_id
    union all select n.id::text,'member_nudge',n.from_user_id,p.display_name,n.created_at,null from public.member_nudge_events n join public.profiles p on p.id=n.from_user_id where n.trip_id=p_trip_id
  ) e where public.is_trip_member(p_trip_id) order by e.created_at desc limit least(greatest(p_limit,1),50);
$$;

alter publication supabase_realtime add table public.member_nudge_events;
