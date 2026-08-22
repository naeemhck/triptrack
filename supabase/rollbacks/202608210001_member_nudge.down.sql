-- FAILSAFE ROLLBACK for 202608210001_member_nudge.sql
-- Do not put this in supabase/migrations. Apply only if you need to undo
-- the member-nudge deploy on the linked project:
--
--   npx supabase db query --linked -f supabase/rollbacks/202608210001_member_nudge.down.sql
--   npx supabase functions delete send-member-nudge --linked
--
-- This restores list_trip_alert_events to the pre-nudge definition and
-- removes nudge tables, triggers, RPCs, realtime, and the preference column.

drop trigger if exists member_nudge_after_insert on public.member_nudge_events;
drop function if exists public.notify_member_nudge();
drop function if exists public.send_member_nudge(uuid, uuid);

create or replace function public.list_trip_alert_events(p_trip_id uuid,p_limit integer default 50)
returns table(id text,event_type text,user_id uuid,display_name text,created_at timestamptz,behind_meters integer)
language sql stable security definer set search_path=public as $$
  select e.id,e.event_type,e.user_id,e.display_name,e.created_at,e.behind_meters from (
    select l.id::text,l.level::text event_type,l.user_id,p.display_name,l.created_at,l.behind_meters from public.lag_alert_events l join public.profiles p on p.id=l.user_id where l.trip_id=p_trip_id
    union all select s.id::text,'stale',s.stale_user_id,p.display_name,s.detected_at,null from public.stale_alert_episodes s join public.profiles p on p.id=s.stale_user_id where s.trip_id=p_trip_id
    union all select m.id::text,m.event_type::text,m.user_id,p.display_name,m.created_at,null from public.trip_member_events m join public.profiles p on p.id=m.user_id where m.trip_id=p_trip_id
  ) e where public.is_trip_member(p_trip_id) order by e.created_at desc limit least(greatest(p_limit,1),50);
$$;

revoke all on function public.list_trip_alert_events(uuid,integer) from public;
grant execute on function public.list_trip_alert_events(uuid,integer) to authenticated;

do $$
begin
  alter publication supabase_realtime drop table public.member_nudge_events;
exception
  when undefined_object then null;
  when undefined_table then null;
end $$;

drop table if exists public.member_nudge_events;

alter table public.trip_notification_preferences
  drop column if exists nudge_enabled;
