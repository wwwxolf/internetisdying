-- V4 staged automatic settlement runner. No epoch created, no cron installed
-- or enabled by this migration. V2 remains authoritative until explicit cutover.
-- pg_cron invokes this function as owner only once the separate disabled job is
-- explicitly enabled. 4 x 16 = max 64 ordered settlements per minute.
create function iid_v4.scheduler_tick() returns jsonb
language plpgsql set search_path='' as $$
declare
 current_epoch uuid; settled integer:=0; batch integer:=0;
 remaining integer:=0; state text;
begin
 select id into current_epoch from iid_v4.epochs
 where published and status='ACTIVE' order by starts_at desc limit 1;
 if current_epoch is null then
  return jsonb_build_object('status','IDLE','settled',0,'remaining_due',0);
 end if;
 for i in 1..4 loop
  select iid_v4.settle_due() into batch;
  settled:=settled+batch;
  exit when batch<16;
 end loop;
 select status into state from iid_v4.epochs where id=current_epoch;
 if state='ACTIVE' then
  select count(*) into remaining from iid_v4.events
  where epoch_id=current_epoch and settled_at is null
   and scheduled_at<=clock_timestamp();
 end if;
 return jsonb_build_object(
   'status',case when state='FINAL' then 'FINAL'
                 when remaining>0 then 'CATCHING_UP'
                 else 'CURRENT' end,
   'settled',settled,'remaining_due',remaining,
   'epoch_id',current_epoch
 );
end $$;
revoke all on function iid_v4.scheduler_tick() from public,anon,authenticated;
