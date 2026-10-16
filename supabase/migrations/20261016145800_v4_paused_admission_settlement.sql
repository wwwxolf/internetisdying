-- V4 only: pausing new admission must NOT block recovery of already scheduled
-- world events. No existing epoch is created/published, and legacy V2 is untouched.
-- Operator must still explicitly schedule the separate V4 runner at activation.
create or replace function iid_v4.settle_due() returns integer
language plpgsql set search_path='' as $$
declare
 e iid_v4.epochs;g iid_v4.events;s bigint;k bigint;d integer;v_hp integer;n integer:=0;
begin
 if not pg_try_advisory_xact_lock(484944,4) then return 0;end if;
 -- published + ACTIVE only; admission is an input gate, not a settlement gate.
 select * into e from iid_v4.epochs
 where status='ACTIVE' and published for update;
 if not found then return 0;end if;
 for g in
  select * from iid_v4.events
  where epoch_id=e.id and settled_at is null and scheduled_at<=clock_timestamp()
  order by scheduled_at,priority limit 16 for update
 loop
  select coalesce(sum(save_sum),0),coalesce(sum(kill_sum),0)
  into s,k from iid_v4.buckets
  where epoch_id=e.id and kind=g.kind and seq=g.seq;
  d:=case g.kind
    when 'BATTLE' then iid_v4.battle_delta(s,k)
    when 'CHAOS' then iid_v4.chaos_delta(s,k)
    else -g.decay end;
  v_hp:=greatest(0,least(1000000,e.hp+d));
  update iid_v4.events
   set settled_at=clock_timestamp(),nominal=d,applied=v_hp-e.hp,
   hp_before=e.hp,hp_after=v_hp,save_sum=s,kill_sum=k
   where epoch_id=e.id and kind=g.kind and seq=g.seq;
  update iid_v4.epochs
   set hp=v_hp,status=case when v_hp=0 or g.kind='FINAL' then 'FINAL' else 'ACTIVE' end,
   winner=case when v_hp=0 then 'KILL' when g.kind='FINAL' then 'SAVE' end,
   ended_at=case when v_hp=0 or g.kind='FINAL' then g.scheduled_at end,
   version=version+1
   where id=e.id returning * into e;
  n:=n+1;
  if e.status='FINAL' then exit;end if;
 end loop;
 return n;
end $$;
-- Keep the scheduler owner-only; no browser role gets EXECUTE.
revoke all on function iid_v4.settle_due() from public,anon,authenticated;
