create or replace function public.end_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_organizer(p_trip_id) then raise exception 'Organizer required'; end if;
  update public.trips set status = 'completed', ended_at = now()
  where id = p_trip_id and status = 'active';
  if not found then raise exception 'Trip must be active'; end if;
  update public.trip_members set sharing_enabled = false, sharing_mode = 'off' where trip_id = p_trip_id;
  delete from public.trip_locations where trip_id = p_trip_id;
end;
$$;

revoke update on public.trip_members from authenticated;
grant update (sharing_enabled, sharing_mode) on public.trip_members to authenticated;

drop policy if exists stops_update_owner_active on public.trip_stops;
create policy stops_update_owner_active on public.trip_stops for update to authenticated
using (user_id = auth.uid() and public.is_trip_member(trip_id) and public.trip_is_active(trip_id))
with check (user_id = auth.uid() and public.is_trip_member(trip_id) and public.trip_is_active(trip_id));

drop policy if exists stop_photos_insert_owner_active on storage.objects;
create policy stop_photos_insert_owner_active on storage.objects for insert to authenticated
with check (
  bucket_id = 'trip-stop-photos'
  and name = public.storage_trip_id(name)::text || '/' || public.storage_stop_id(name)::text || '/photo.jpg'
  and public.is_trip_member(public.storage_trip_id(name))
  and public.trip_is_active(public.storage_trip_id(name))
  and exists (
    select 1 from public.trip_stops s
    where s.trip_id = public.storage_trip_id(name)
      and s.id = public.storage_stop_id(name)
      and s.user_id = auth.uid()
  )
  and coalesce((metadata->>'mimetype'), '') = 'image/jpeg'
  and coalesce((metadata->>'size')::bigint, 0) <= 10485760
);

drop policy if exists stop_photos_update_owner_active on storage.objects;
create policy stop_photos_update_owner_active on storage.objects for update to authenticated
using (
  bucket_id = 'trip-stop-photos'
  and name = public.storage_trip_id(name)::text || '/' || public.storage_stop_id(name)::text || '/photo.jpg'
  and public.is_trip_member(public.storage_trip_id(name))
  and public.trip_is_active(public.storage_trip_id(name))
  and exists (
    select 1 from public.trip_stops s
    where s.trip_id = public.storage_trip_id(name)
      and s.id = public.storage_stop_id(name)
      and s.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'trip-stop-photos'
  and name = public.storage_trip_id(name)::text || '/' || public.storage_stop_id(name)::text || '/photo.jpg'
  and public.is_trip_member(public.storage_trip_id(name))
  and public.trip_is_active(public.storage_trip_id(name))
  and exists (
    select 1 from public.trip_stops s
    where s.trip_id = public.storage_trip_id(name)
      and s.id = public.storage_stop_id(name)
      and s.user_id = auth.uid()
  )
  and coalesce((metadata->>'mimetype'), '') = 'image/jpeg'
  and coalesce((metadata->>'size')::bigint, 0) <= 10485760
);

revoke all on function public.create_trip(text, date, date) from public;
revoke all on function public.join_trip(text) from public;
revoke all on function public.preview_trip(text) from public;
revoke all on function public.start_trip(uuid) from public;
revoke all on function public.end_trip(uuid) from public;
revoke all on function public.leave_trip(uuid) from public;
revoke all on function public.remove_trip_member(uuid, uuid) from public;
revoke all on function public.register_push_token(text, text) from public;

grant execute on function public.create_trip(text, date, date) to authenticated;
grant execute on function public.join_trip(text) to authenticated;
grant execute on function public.preview_trip(text) to authenticated;
grant execute on function public.start_trip(uuid) to authenticated;
grant execute on function public.end_trip(uuid) to authenticated;
grant execute on function public.leave_trip(uuid) to authenticated;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
