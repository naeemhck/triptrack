begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
create temporary table tap_results(line text) on commit drop;
grant insert,select on tap_results to authenticated;

insert into public.profiles(id,display_name) values
('b1000000-0000-4000-8000-000000000001','Trip Creator');

set local role authenticated;
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';

insert into tap_results select lives_ok(
  $$select public.create_trip('Leader Default Test', '2026-08-16'::date, '2026-08-20'::date)$$,
  'organizer creates trip with create_trip RPC'
);

insert into tap_results select is(
  (select route_leader_user_id::text from public.trips where name = 'Leader Default Test'),
  'b1000000-0000-4000-8000-000000000001',
  'create_trip sets route_leader_user_id to the creator'
);

insert into tap_results select is(
  (select created_by::text from public.trips where name = 'Leader Default Test'),
  'b1000000-0000-4000-8000-000000000001',
  'creator is organizer'
);

select * from finish();
rollback;
