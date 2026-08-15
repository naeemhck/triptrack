create or replace function public.notify_lag_alert() returns trigger
language plpgsql security definer set search_path = public, vault, net as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name='triptrack_database_webhook_secret'
  order by created_at desc limit 1;
  if webhook_secret is null then
    raise warning 'TripTrack lag alert dispatch skipped: webhook secret is unavailable';
    return new;
  end if;
  begin
    perform net.http_post(
      url := 'https://fdykfiejzmwdesczduun.supabase.co/functions/v1/send-lag-alert',
      headers := jsonb_build_object('content-type','application/json','x-triptrack-webhook-secret',webhook_secret),
      body := jsonb_build_object('record',jsonb_build_object('id',new.id))
    );
  exception when others then
    raise warning 'TripTrack lag alert dispatch could not be queued';
  end;
  return new;
end;
$$;

create trigger lag_alert_after_insert after insert on public.lag_alert_events
for each row execute function public.notify_lag_alert();
