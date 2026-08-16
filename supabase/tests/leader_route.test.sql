begin;
create extension if not exists pgtap with schema extensions;
select plan(23);
create temporary table tap_results(line text) on commit drop;

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

insert into tap_results select * from finish();
select line from tap_results;
rollback;
