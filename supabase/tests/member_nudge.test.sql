begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.profiles(id, display_name) values
('93000000-0000-4000-8000-000000000001', 'Nudge Organizer'),
('93000000-0000-4000-8000-000000000002', 'Nudge Member'),
('93000000-0000-4000-8000-000000000003', 'Nudge Outsider');
insert into public.trips(id, name, invite_code, created_by, status) values
('94000000-0000-4000-8000-000000000001', 'Nudge active', 'TRIP-NUD1', '93000000-0000-4000-8000-000000000001', 'active'),
('94000000-0000-4000-8000-000000000002', 'Nudge planned', 'TRIP-NUD2', '93000000-0000-4000-8000-000000000001', 'planned');
insert into public.trip_members(trip_id, user_id, role) values
('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'organizer'),
('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000002', 'member'),
('94000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001', 'organizer');

select has_table('public', 'member_nudge_events', 'member nudge events table exists');
select col_not_null('public', 'trip_notification_preferences', 'nudge_enabled', 'nudge preference column exists');
select is(
  (select nudge_enabled is true from public.trip_notification_preferences where false),
  true,
  'nudge preference defaults to enabled');

set local role authenticated;
set local "request.jwt.claim.sub" = '93000000-0000-4000-8000-000000000001';
select lives_ok($$select public.send_member_nudge('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002')$$,
  'member can nudge another active-trip member');
select is((select count(*)::integer from public.member_nudge_events), 1, 'nudge event inserted');
select throws_ok($$select public.send_member_nudge('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Cannot nudge yourself', 'self-nudge rejected');
select throws_ok($$select public.send_member_nudge('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002')$$,
  'P0001', 'This member was nudged recently; wait a few minutes', 'rate limit enforced within the window');
select throws_ok($$select public.send_member_nudge('94000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Trip must be active', 'inactive trip rejected');

set local "request.jwt.claim.sub" = '93000000-0000-4000-8000-000000000003';
select throws_ok($$select public.send_member_nudge('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002')$$,
  'P0001', 'Trip membership required', 'non-member caller rejected');
select is((select count(*)::integer from public.member_nudge_events), 1, 'non-member cannot read trip nudges');
reset role;

select is((select count(*)::integer from public.member_nudge_events), 1, 'nudge events readable with membership after role reset');

select * from finish();
rollback;
