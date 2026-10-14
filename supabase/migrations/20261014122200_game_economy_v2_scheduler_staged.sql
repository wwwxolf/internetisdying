-- V2 world tick: safe to install while economy V2 flag is OFF.
-- One entrypoint: settle closed 4-hour war windows, then decay, then Daily Chaos.
create or replace function iid_private.run_v2_scheduler() returns jsonb
language plpgsql security definer set search_path='' as $$
declare w jsonb;d jsonb;c jsonb;
begin
 if not (select v2_enabled from public.iid_economy_control where id=1) then
  return jsonb_build_object('status','V2_PAUSED');end if;
 w:=iid_private.process_v2_windows();
 d:=iid_private.process_decay();
 c:=iid_private.resolve_previous_chaos();
 return jsonb_build_object('status','OK','windows',w,'decay',d,'chaos',c);
end $$;
revoke all on function iid_private.run_v2_scheduler() from public,anon,authenticated;
create extension if not exists pg_cron;
select cron.schedule('iid-v2-world-tick','*/2 * * * *',
 'select iid_private.run_v2_scheduler()');
