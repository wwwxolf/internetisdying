-- Register ONLY a disabled V4 cron entry. This DOES NOT activate the V4
-- economy, create an epoch, stop V2, or run settlement.
-- Activate only through owner-approved V2->V4 cutover runbook.
do $$
declare v_job bigint; v_active boolean;
begin
 if not exists(select 1 from pg_extension where extname='pg_cron') then
   raise exception 'PG_CRON_REQUIRED';
 end if;
 if exists(select 1 from cron.job where jobname='iid-v4-settlement') then
   raise exception 'V4_CRON_ALREADY_REGISTERED';
 end if;
 -- Both operations happen in one transaction, never committing active=true.
 select cron.schedule('iid-v4-settlement','* * * * *',
    'select iid_v4.scheduler_tick()') into v_job;
 perform cron.alter_job(job_id=>v_job,active=>false);
 select active into v_active from cron.job where jobid=v_job;
 if v_active is distinct from false then
   raise exception 'V4_CRON_FAILED_TO_DISABLE';
 end if;
end $$;
