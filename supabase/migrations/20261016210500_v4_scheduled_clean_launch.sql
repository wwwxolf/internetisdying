-- Owner-approved clean launch: 2026-10-17 00:00 UTC / 07:00 WIB.
-- Installation defines inert functions/config only. The separate per-minute
-- pg_cron job must be scheduled AFTER isolated tests. No early V2 shutdown.
-- Existing Google auth identities/sessions are preserved to allow re-onboarding;
-- all game profiles and V2 competitive ledgers are deliberately deleted.
create table iid_v4.clean_launch (
 id smallint primary key check(id=1),
 launch_at timestamptz not null,
 state text not null default 'SCHEDULED' check(state in ('SCHEDULED','COMPLETED')),
 launched_at timestamptz,
 epoch_id uuid references iid_v4.epochs(id),
 old_hp integer,
 old_version bigint,
 old_profiles integer,
 old_battles integer,
 old_cards integer,
 account_count integer,
 check ((state='SCHEDULED' and launched_at is null and epoch_id is null)
   or (state='COMPLETED' and launched_at is not null and epoch_id is not null))
);
insert into iid_v4.clean_launch(id,launch_at) values (1,'2026-10-17 00:00:00+00');
alter table iid_v4.clean_launch enable row level security;
revoke all on iid_v4.clean_launch from public,anon,authenticated;

create function iid_v4.execute_clean_launch() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 ctl iid_v4.clean_launch;
 v2_job bigint; v4_job bigint; launch_job bigint;
 oldworld public.iid_world; e uuid; t timestamptz;
 n_accounts integer; n_profiles integer; n_battles integer; n_cards integer;
 due integer;
begin
 -- Only trusted PostgreSQL owner / scheduler may execute. Browser roles
 -- receive no EXECUTE on this function or on any backing table.
 perform set_config('lock_timeout','3500ms',true);
 select * into strict ctl from iid_v4.clean_launch where id=1 for update;
 if ctl.state='COMPLETED' then
  return jsonb_build_object('status','COMPLETED','epoch_id',ctl.epoch_id);
 end if;
 t:=clock_timestamp();
 if t<ctl.launch_at then
  return jsonb_build_object('status','WAITING','launch_at',ctl.launch_at);
 end if;
 -- Fail safely rather than silently backdating a delayed day-old world.
 if t>=ctl.launch_at+interval '3 minutes' then
  return jsonb_build_object('status','MISSED_WINDOW','launch_at',ctl.launch_at);
 end if;
 select jobid into v2_job from cron.job where jobname='iid-v2-world-tick' and active;
 select jobid into v4_job from cron.job where jobname='iid-v4-settlement' and not active;
 select jobid into launch_job from cron.job where jobname='iid-v4-clean-launch';
 if v2_job is null or v4_job is null or launch_job is null then
  raise exception 'CUTOVER_CRON_INVARIANT';
 end if;
 if exists(select 1 from iid_v4.epochs) or
    exists(select 1 from iid_v4.attempts) or
    exists(select 1 from iid_v4.share_cards) then
  raise exception 'V4_NOT_CLEAN';
 end if;
 if (select legacy_frozen from iid_v4.cutover_control where id=1)
    or not (select legacy_admission_open from iid_v4.cutover_control where id=1)
 then raise exception 'LEGACY_ALREADY_PAUSED';end if;

 -- Freeze in-flight game writers in the SAME transaction as the reset;
 -- no partial deletions or partial engine-switch are committed on error.
 lock table public.iid_world,public.iid_battles,public.iid_chaos_votes,
  public.iid_chaos_results,public.iid_chaos_days,public.iid_decay_pulses,
  public.iid_share_cards,public.iid_player_presence,
  public.iid_hof_totals,public.iid_hof_season_totals,
  public.iid_v2_window_results,public.iid_v2_live_buckets,
  public.iid_profiles,public.iid_economy_control in access exclusive mode;

 select * into strict oldworld from public.iid_world where id=1 for update;
 select count(*) into n_accounts from auth.users where deleted_at is null;
 select count(*) into n_profiles from public.iid_profiles;
 select count(*) into n_battles from public.iid_battles;
 select count(*) into n_cards from public.iid_share_cards;
 if n_accounts<1 then raise exception 'NO_VERIFIED_AUTH_TO_RESET';end if;

 -- Disable the old scheduler and old World before arming freeze triggers.
 perform cron.alter_job(job_id=>v2_job,active=>false);
 update public.iid_world set enabled=false where id=1;

 -- Deleting old history is now explicitly approved. Do so BEFORE arming
 -- archive protection in the existing staged legacy-admission migration.
 delete from public.iid_chaos_votes;
 delete from public.iid_chaos_results;
 delete from public.iid_chaos_days;
 delete from public.iid_decay_pulses;
 delete from public.iid_v2_window_results;
 delete from public.iid_v2_live_buckets;
 delete from public.iid_share_cards;
 delete from public.iid_player_presence;
 delete from public.iid_battles;
 delete from public.iid_hof_season_totals;
 delete from public.iid_hof_totals;
 delete from public.iid_profiles;

 update iid_v4.cutover_control
  set legacy_admission_open=false,legacy_admission_paused_at=clock_timestamp(),
      legacy_frozen=true,armed_at=clock_timestamp() where id=1;
 -- New independent epoch, 30 days, 331 events, HP 500000.
 e:=iid_v4.prepare_epoch(ctl.launch_at);
 if (select count(*) from iid_v4.events where epoch_id=e)<>331
    or (select hp from iid_v4.epochs where id=e)<>500000
 then raise exception 'INVALID_V4_INITIAL_STATE';end if;

 update iid_v4.epochs set published=true,admission=false where id=e;
 -- At midnight there must be no due events; never open a backdated world.
 select count(*) into due from iid_v4.events
  where epoch_id=e and settled_at is null and scheduled_at<=clock_timestamp();
 if due<>0 then raise exception 'V4_HAS_BACKLOG';end if;
 perform cron.alter_job(job_id=>v4_job,active=>true);
 update iid_v4.epochs set admission=true where id=e;
 update iid_v4.clean_launch set state='COMPLETED',launched_at=clock_timestamp(),
  epoch_id=e,old_hp=oldworld.hp,old_version=oldworld.version,
  old_profiles=n_profiles,old_battles=n_battles,old_cards=n_cards,
  account_count=n_accounts where id=1;
 -- Self-disable once; retry remains possible after any aborted transaction.
 perform cron.alter_job(job_id=>launch_job,active=>false);

 if (select count(*) from auth.users where deleted_at is null)<>n_accounts
   or exists(select 1 from public.iid_profiles)
   or exists(select 1 from public.iid_battles)
   or exists(select 1 from public.iid_share_cards)
   or (select count(*) from iid_v4.player_totals)<>0
   or (select hp from iid_v4.epochs where id=e)<>500000
 then raise exception 'CUTOVER_POSTCONDITION_FAILED';end if;
 return jsonb_build_object('status','COMPLETED','epoch_id',e,
  'initial_hp',500000,'old_profiles_cleared',n_profiles,
  'old_battles_cleared',n_battles,'old_cards_cleared',n_cards,
  'google_accounts_preserved',n_accounts);
end $$;
revoke all on function iid_v4.execute_clean_launch() from public,anon,authenticated;
