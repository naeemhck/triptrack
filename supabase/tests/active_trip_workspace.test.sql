begin;
create extension if not exists pgtap with schema extensions;
select plan(24);
create temporary table tap_results(line text) on commit drop;

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

insert into tap_results select * from finish();
select * from tap_results;
rollback;
