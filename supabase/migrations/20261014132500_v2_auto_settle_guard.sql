-- Auto-settle completed V2 rounds even if the player closed the browser.
-- Do not enable V2 here. Continue using idempotent server-side timestamps.
create or replace function iid_private.run_v2_scheduler() returns jsonb
language plpgsql security definer set search_path='' as $$
declare w jsonb; d jsonb; c jsonb; battle_record record;
 settled_count integer:=0; t timestamptz:=clock_timestamp();
begin
 if not (select v2_enabled from public.iid_economy_control where id=1) then
  return jsonb_build_object('status','V2_PAUSED');end if;
 -- Settle all ended sessions within a bounded work batch each two-minute tick.
 -- Every settled V2 battle only records personal power/influence; it does not
 -- modify world HP until the immutable faction window settlement.
 for battle_record in
  select id from public.iid_battles
  where engine_version=2 and settled_at is null and ends_at<=t
  order by ends_at,id limit 1000
 loop
  perform iid_private.settle_v2_due(battle_record.id);
  settled_count:=settled_count+1;
 end loop;
 w:=iid_private.process_v2_windows();
 d:=iid_private.process_decay();
 c:=iid_private.resolve_previous_chaos();
 return jsonb_build_object('status','OK','auto_settled',settled_count,
  'windows',w,'decay',d,'chaos',c);
end $$;
revoke all on function iid_private.run_v2_scheduler()
 from public,anon,authenticated;
