begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.profiles(id, display_name) values
('91000000-0000-4000-8000-000000000001', 'Preference One'),
('91000000-0000-4000-8000-000000000002', 'Preference Two'),
('91000000-0000-4000-8000-000000000003', 'Preference Nonmember');
insert into public.trips(id, name, invite_code, created_by, status)
values('92000000-0000-4000-8000-000000000001', 'Preference test', 'TRIP-PREF1', '91000000-0000-4000-8000-000000000001', 'active');
insert into public.trip_members(trip_id, user_id, role) values
('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'organizer'),
('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'member');

select has_table('public', 'trip_notification_preferences', 'notification preference table exists');
select is(
  coalesce((select warning_enabled and critical_enabled and stop_enabled and stale_enabled and member_left_enabled
    from public.trip_notification_preferences where false), true),
  true,
  'missing row preserves enabled defaults'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000001';
select lives_ok($$insert into public.trip_notification_preferences(trip_id,user_id)
  values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001')$$,
  'member can create own preferences');
select is((select count(*)::integer from public.trip_notification_preferences), 1, 'member reads own preferences');
select throws_ok($$insert into public.trip_notification_preferences(trip_id,user_id)
  values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "trip_notification_preferences"',
  'member cannot create another member preferences');

set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000003';
select throws_ok($$insert into public.trip_notification_preferences(trip_id,user_id)
  values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003')$$,
  '42501', 'new row violates row-level security policy for table "trip_notification_preferences"',
  'non-member cannot create preferences');

set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.trip_notification_preferences), 0, 'member cannot read another member preferences');
update public.trip_notification_preferences set warning_enabled=false
where trip_id='92000000-0000-4000-8000-000000000001' and user_id='91000000-0000-4000-8000-000000000001';
reset role;
select is((select warning_enabled from public.trip_notification_preferences
  where trip_id='92000000-0000-4000-8000-000000000001' and user_id='91000000-0000-4000-8000-000000000001'),
  true, 'member cannot update another member preferences');

select * from finish();
rollback;
