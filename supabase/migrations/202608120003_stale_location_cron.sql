create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_stale_location_check()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
   where name = 'triptrack_cron_secret'
   limit 1;

  if cron_secret is null or length(cron_secret) < 32 then
    raise warning 'TripTrack stale-location check skipped: Cron secret is not configured';
    return null;
  end if;

  select net.http_post(
    url := 'https://fdykfiejzmwdesczduun.supabase.co/functions/v1/check-stale-locations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 10000
  ) into request_id;

  return request_id;
exception when others then
  raise warning 'TripTrack stale-location check enqueue failed';
  return null;
end;
$$;

revoke all on function public.invoke_stale_location_check() from public;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
    from cron.job
   where jobname = 'triptrack-check-stale-locations'
   limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'triptrack-check-stale-locations',
    '*/15 * * * *',
    'select public.invoke_stale_location_check()'
  );
end;
$$;
