create table public.trip_notification_preferences (
  trip_id uuid not null,
  user_id uuid not null,
  warning_enabled boolean not null default true,
  critical_enabled boolean not null default true,
  stop_enabled boolean not null default true,
  stale_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id),
  foreign key (trip_id, user_id) references public.trip_members(trip_id, user_id) on delete cascade
);

create trigger trip_notification_preferences_updated_at
before update on public.trip_notification_preferences
for each row execute function public.set_updated_at();

alter table public.trip_notification_preferences enable row level security;

create policy notification_preferences_read_self
on public.trip_notification_preferences for select to authenticated
using (user_id = auth.uid() and public.is_trip_member(trip_id));

create policy notification_preferences_insert_self
on public.trip_notification_preferences for insert to authenticated
with check (user_id = auth.uid() and public.is_trip_member(trip_id));

create policy notification_preferences_update_self
on public.trip_notification_preferences for update to authenticated
using (user_id = auth.uid() and public.is_trip_member(trip_id))
with check (user_id = auth.uid() and public.is_trip_member(trip_id));

create policy notification_preferences_delete_self
on public.trip_notification_preferences for delete to authenticated
using (user_id = auth.uid() and public.is_trip_member(trip_id));

grant select, insert, update, delete on public.trip_notification_preferences to authenticated;
