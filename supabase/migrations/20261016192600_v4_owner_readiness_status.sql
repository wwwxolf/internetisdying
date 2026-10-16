-- Read-only, owner-only V4 readiness and scheduler health snapshot.
-- No public wrapper, no browser grants, no cron mutation. Not a go-live permit.
create function iid_v4.cutover_readiness() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  tick_time timestamptz:=clock_timestamp();
  legacy record; control record;
  v2_job record; v4_job record; last_v2 record; last_v4 record;
  old_pending bigint;old_overdue bigint;
  epoch_total bigint; epoch_published bigint;due_events bigint;
  result jsonb;
begin
  select hp,version,enabled into strict legacy from public.iid_world where id=1;
  select legacy_frozen,armed_at into strict control from iid_v4.cutover_control where id=1;
  select count(*),count(*) filter(where ends_at<=tick_time)
   into old_pending,old_overdue from public.iid_battles where settled_at is null;
  select count(*),count(*) filter(where published)
   into epoch_total,epoch_published from iid_v4.epochs;
  select count(*) into due_events from iid_v4.events
   where settled_at is null and scheduled_at<=tick_time;
  select jobid,active,schedule into v2_job from cron.job where jobname='iid-v2-world-tick';
  select jobid,active,schedule into v4_job from cron.job where jobname='iid-v4-settlement';
  if v2_job.jobid is not null then
   select status,start_time into last_v2 from cron.job_run_details
    where jobid=v2_job.jobid order by start_time desc limit 1;
  end if;
  if v4_job.jobid is not null then
   select status,start_time into last_v4 from cron.job_run_details
    where jobid=v4_job.jobid order by start_time desc limit 1;
  end if;
  result:=jsonb_build_object(
   'measured_at',tick_time,'read_only',true,
   'cutover_authorized',false,'production_ready',false,
   'v2',jsonb_build_object('hp',legacy.hp,'version',legacy.version,
    'enabled',legacy.enabled,'unfinished_battles',old_pending,
    'overdue_battles',old_overdue,'cron_active',coalesce(v2_job.active,false),
    'cron_last_status',last_v2.status,'cron_last_started_at',last_v2.start_time),
   'v4',jsonb_build_object('epochs',epoch_total,'published_epochs',epoch_published,
    'due_events',due_events,'cron_registered',v4_job.jobid is not null,
    'cron_active',coalesce(v4_job.active,false),
    'cron_last_status',last_v4.status,'cron_last_started_at',last_v4.start_time),
   'freeze',jsonb_build_object('legacy_frozen',control.legacy_frozen,'armed_at',control.armed_at),
   'legacy_cron_healthy',coalesce(v2_job.active,false)
    and last_v2.status='succeeded' and last_v2.start_time>tick_time-interval '6 minutes',
   'manual_blockers',jsonb_build_array('OWNER_APPROVAL_REQUIRED',
    'FULL_AUTH_AND_DATABASE_RESTORE_BACKUP_NOT_ATTESTED',
    'MOBILE_OAUTH_AND_V4_END_TO_END_NOT_ATTESTED',
    'LEGACY_ENTRYPOINT_FREEZE_NOT_COMPLETED')
  );
  return result;
end $$;
revoke all on function iid_v4.cutover_readiness() from public,anon,authenticated;
