begin;
create extension if not exists pgtap with schema extensions;
select plan(21);
create temporary table tap_results(line text) on commit drop;
grant insert,select on tap_results to authenticated;

insert into public.profiles(id,display_name) values
('b1000000-0000-4000-8000-000000000001','Navigation Host'),
('b1000000-0000-4000-8000-000000000002','Navigation Member'),
('b1000000-0000-4000-8000-000000000003','Navigation Outsider');
insert into public.trips(id,name,invite_code,created_by,status,route_leader_user_id) values
('b2000000-0000-4000-8000-000000000001','Navigation test','TRIP-NAVV2','b1000000-0000-4000-8000-000000000001','active','b1000000-0000-4000-8000-000000000001');
insert into public.trip_members(trip_id,user_id,role,sharing_enabled,sharing_mode) values
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','organizer',true,'always'),
('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','member',true,'always');

insert into tap_results select has_table('public','trip_planned_routes','planned routes table exists');
insert into tap_results select has_table('public','trip_member_navigation_status','navigation status table exists');
insert into tap_results select has_function('public','submit_trip_location',array['uuid','uuid','double precision','double precision','double precision','timestamp with time zone','boolean'],'V1 location RPC contract remains available');
insert into tap_results select has_function('public','submit_trip_location_v2',array['uuid','uuid','double precision','double precision','double precision','timestamp with time zone','boolean','double precision','double precision'],'V2 location RPC has a separate contract');

set local role authenticated;
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';
insert into tap_results select lives_ok($$select public.submit_trip_location(
  'b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001',0,0,5,now(),false
)$$,'V1 client location write still works');
insert into tap_results select lives_ok($$select public.submit_trip_location_v2(
  'b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002',0,0.0001,5,now(),false,12,90
)$$,'V2 client location write works without planned route');
insert into tap_results select is((select round(speed_mps)::integer from public.trip_locations where trip_id='b2000000-0000-4000-8000-000000000001' and user_id='b1000000-0000-4000-8000-000000000001'),12,'V2 speed persists');
insert into tap_results select lives_ok($$select public.submit_trip_location_v2(
  'b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002',0,0.0001,5,now(),false,12,90
)$$,'V2 duplicate sample replay is accepted');
insert into tap_results select is((select speed_sample_count from public.trip_locations where trip_id='b2000000-0000-4000-8000-000000000001' and user_id='b1000000-0000-4000-8000-000000000001'),1,'V2 duplicate replay does not skew speed samples');

insert into tap_results select lives_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'Origin',0,0.003,'Destination',
  '{"type":"LineString","coordinates":[[0,0],[0.001,0],[0.002,0],[0.003,0]]}'::jsonb,
  333,30,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0},{"sequence":1,"latitude":0,"longitude":0.001,"cumulative_distance_meters":111},{"sequence":2,"latitude":0,"longitude":0.002,"cumulative_distance_meters":222},{"sequence":3,"latitude":0,"longitude":0.003,"cumulative_distance_meters":333}]'::jsonb,
  '[{"sequence":1,"title":"Fuel","latitude":0,"longitude":0.002,"radius_meters":75}]'::jsonb,
  '[{"sequence":0,"instruction":"Depart","road_name":"Test Road","maneuver_type":"depart","latitude":0,"longitude":0,"progress_meters":0,"distance_meters":333,"duration_seconds":30}]'::jsonb
)$$,'organizer saves planned route');
insert into tap_results select is((select version from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001' and is_current),1,'first route version is current');
insert into tap_results select is((select count(*)::integer from public.trip_route_waypoints where trip_id='b2000000-0000-4000-8000-000000000001'),1,'waypoint persisted');

set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000002';
insert into tap_results select throws_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'Origin',0,0.003,'Destination',
  '{"type":"LineString","coordinates":[[0,0],[0.003,0]]}'::jsonb,333,30,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0},{"sequence":1,"latitude":0,"longitude":0.003,"cumulative_distance_meters":333}]'::jsonb
)$$,'P0001','Organizer required','member cannot save planned route');

set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';
insert into tap_results select lives_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'New origin',0,0.004,'New destination',
  '{"type":"LineString","coordinates":[[0,0],[0.004,0]]}'::jsonb,444,40,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0},{"sequence":1,"latitude":0,"longitude":0.004,"cumulative_distance_meters":444}]'::jsonb
)$$,'organizer creates a new route version');
insert into tap_results select is((select count(*)::integer from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001'),2,'route history is preserved');
insert into tap_results select is((select version from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001' and is_current),2,'new route version becomes current');

insert into tap_results select throws_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'Bad',0,0.005,'Bad route',
  '{"type":"LineString","coordinates":[[0,0],[0.005,0]]}'::jsonb,555,50,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0}]'::jsonb
)$$,'P0001','Invalid route geometry points','invalid route transaction is rejected');
insert into tap_results select is((select count(*)::integer from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001'),2,'failed route save rolls back without a partial version');

set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000003';
insert into tap_results select is((select count(*)::integer from public.trip_planned_routes where trip_id='b2000000-0000-4000-8000-000000000001'),0,'outsider cannot read planned route');
insert into tap_results select is((select count(*)::integer from public.trip_member_navigation_status where trip_id='b2000000-0000-4000-8000-000000000001'),0,'outsider cannot read navigation status');

reset role;
update public.trips set status='completed' where id='b2000000-0000-4000-8000-000000000001';
set local role authenticated;
set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';
insert into tap_results select throws_ok($$select public.save_trip_planned_route(
  'b2000000-0000-4000-8000-000000000001',0,0,'Origin',0,0.003,'Destination',
  '{"type":"LineString","coordinates":[[0,0],[0.003,0]]}'::jsonb,333,30,'osrm',
  '[{"sequence":0,"latitude":0,"longitude":0,"cumulative_distance_meters":0},{"sequence":1,"latitude":0,"longitude":0.003,"cumulative_distance_meters":333}]'::jsonb
)$$,'P0001','Completed trips reject route changes','completed trip remains immutable');

insert into tap_results select * from finish();
select line from tap_results;
rollback;
