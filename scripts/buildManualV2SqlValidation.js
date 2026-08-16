const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '202608150002_route_navigation_v2.sql',
);
const testPaths = [
  'notification_preferences.test.sql',
  'leader_route.test.sql',
  'active_trip_workspace.test.sql',
  'route_navigation_v2.test.sql',
].map((name) => path.join(root, 'supabase', 'tests', name));
const outputPath = path.join(root, 'supabase', 'tests', 'manual_v2_rollback_validation.sql');

const stripHarness = (source) =>
  source
    .replace(/^\s*begin;\s*/i, '')
    .replace(/^create extension if not exists pgtap with schema extensions;\s*$/gim, '')
    .replace(/^select plan\(\d+\);\s*$/gim, '')
    .replace(/^create temporary table tap_results\([^;]+;\s*$/gim, '')
    .replace(/^grant [^;]+tap_results[^;]*;\s*$/gim, '')
    .replace(/^insert into tap_results select \* from finish\(\);\s*$/gim, '')
    .replace(/^select \* from finish\(\);\s*$/gim, '')
    .replace(/^select (?:line|\*) from tap_results;\s*$/gim, '')
    .replace(/^rollback;\s*$/gim, '')
    .replace(
      /^select (is|isnt|ok|lives_ok|throws_ok|has_[a-z_]+)\(/gim,
      'insert into tap_results select $1(',
    )
    .trim();

const migration = fs.readFileSync(migrationPath, 'utf8').trim();
const suites = testPaths.map((testPath) => {
  const name = path.basename(testPath);
  return `\n-- -----------------------------------------------------------------------------\n-- ${name}\n-- -----------------------------------------------------------------------------\nreset role;\nselect set_config('request.jwt.claim.sub','',true);\nselect set_config('request.jwt.claims','{}',true);\n${stripHarness(fs.readFileSync(testPath, 'utf8'))}\n`;
});

const output = `-- TripTrack V2 rollback-only Supabase SQL Editor validation
--
-- EXPECTED RESULT:
--   ERROR P0001: VALIDATION PASSED: all 76 pgTAP tests passed; V2 changes rolled back
--
-- The final exception is deliberate. It guarantees that this validation cannot
-- persist the migration or test fixtures in the QA project. Any other error, or
-- a VALIDATION FAILED/INCOMPLETE message, is a real failure and must be reported.

begin;
create extension if not exists pgtap with schema extensions;
create temporary table tap_results(line text) on commit drop;
grant insert,select on tap_results to authenticated;
select plan(76);

-- Temporarily apply the complete forward-only V2 migration.
${migration}
${suites.join('\n')}
reset role;
insert into tap_results select * from finish();

do $$
declare
  v_passed integer;
  v_failed integer;
  v_failures text;
begin
  select count(*) filter (where line like 'ok %'),
    count(*) filter (where line like 'not ok%'),
    string_agg(line, E'\\n' order by line) filter (where line like 'not ok%')
  into v_passed,v_failed,v_failures
  from tap_results;

  if v_failed > 0 then
    raise exception using
      errcode='P0001',
      message=format('VALIDATION FAILED: %s passed, %s failed. %s',v_passed,v_failed,v_failures);
  end if;
  if v_passed <> 76 then
    raise exception using
      errcode='P0001',
      message=format('VALIDATION INCOMPLETE: expected 76 passing tests, observed %s',v_passed);
  end if;
  raise exception using
    errcode='P0001',
    message='VALIDATION PASSED: all 76 pgTAP tests passed; V2 changes rolled back';
end;
$$;
`;

fs.writeFileSync(outputPath, output.replace(/\r\n/g, '\n'));
console.log(path.relative(root, outputPath));
