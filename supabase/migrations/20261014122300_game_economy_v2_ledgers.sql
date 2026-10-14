-- Keep share and return snapshots truthful after V2 collective World HP
-- is applied at the end of each UTC faction battle window.
-- A V2 player's battle has personal POWER but no direct applied HP;
-- the immutable window ledger becomes the real signed world-change source.
create or replace function iid_private.share_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=iid_private.require_player();
  prev public.iid_player_presence;
  t timestamptz:=clock_timestamp();
  since_at timestamptz;
  data jsonb;
begin
  select * into prev from public.iid_player_presence where user_id=u;
  if not found or prev.last_digest is null then
    raise exception 'RETURN_REPORT_NOT_READY';
  end if;
  since_at:=greatest(
    coalesce(nullif(prev.last_digest->>'from','')::timestamptz,
             nullif(prev.last_digest->>'until','')::timestamptz,
             prev.last_active_at),
    t-interval '30 days'
  );
  -- Single SELECT statement ensures aggregate counts and world health are
  -- from a common MVCC read snapshot; actual applied HP, not nominal power.
  with battles as (
    select count(*) filter(where action='HEAL') as saves,
      count(*) filter(where action='KILL') as kills,
      coalesce(sum(applied_hp) filter(where action='HEAL'),0)::bigint as save_hp,
      coalesce(sum(applied_hp) filter(where action='KILL'),0)::bigint as kill_hp
    from public.iid_battles
    where settled_at>since_at and settled_at<=t
  ),war as (
    select coalesce(sum(greatest(applied_hp,0)),0)::bigint as save_hp,
           coalesce(sum(greatest(-applied_hp,0)),0)::bigint as kill_hp
    from public.iid_v2_window_results
    where settled_at>since_at and settled_at<=t
  ),decay as (
    select count(*) as pulses,
      coalesce(sum(applied_hp),0)::bigint as hp
    from public.iid_decay_pulses
    where settled_at>since_at and settled_at<=t
  ),chaos as (
    select count(*) as events,
      coalesce(sum(applied_hp),0)::bigint as hp
    from public.iid_chaos_results
    where settled_at>since_at and settled_at<=t
  )
  select jsonb_build_object(
    'source','SERVER_LEDGER','snapshot_at',t,'from',since_at,
    'world_hp',w.hp,'world_enabled',w.enabled,'world_version',w.version,
    'heal_battles',b.saves,'kill_battles',b.kills,
    'heal_hp',b.save_hp+war.save_hp,'kill_hp',b.kill_hp+war.kill_hp,
    'decay_pulses',d.pulses,'decay_hp',d.hp,
    'chaos_events',c.events,'chaos_hp',c.hp,
    'net_hp',b.save_hp+war.save_hp-b.kill_hp-war.kill_hp-d.hp+c.hp
  ) into data
  from public.iid_world w
  cross join battles b cross join war cross join decay d cross join chaos c
  where w.id=1;
  if data is null then raise exception 'WORLD_NOT_FOUND';end if;
  return data;
end $$;

create or replace function iid_private.return_digest(p_mode text default 'open') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=iid_private.require_player();
 t timestamptz:=clock_timestamp();
 prev public.iid_player_presence;
 since_at timestamptz;
 has_previous boolean;
 battle_h bigint:=0; battle_k bigint:=0;
 heal_hp bigint:=0; kill_hp bigint:=0;
 decay_hp bigint:=0; decay_count bigint:=0;
 event_hp bigint:=0; event_count bigint:=0;
 war_save bigint:=0; war_kill bigint:=0;
 last_event jsonb;
 world_hp integer;
 body jsonb;
begin
 if p_mode is null or p_mode not in ('open','heartbeat') then
   raise exception 'INVALID_PRESENCE_MODE';
 end if;

 -- Concurrent opens and heartbeat are serialized per account, preventing
 -- double-counting and cross-account access to the digest.
 insert into public.iid_player_presence(user_id,last_active_at)
   values(u,t) on conflict(user_id) do nothing;
 select * into strict prev from public.iid_player_presence
   where user_id=u for update;

 if p_mode='heartbeat' then
   update public.iid_player_presence set last_active_at=t where user_id=u;
   return jsonb_build_object('heartbeat',true,'server_now',t);
 end if;

 -- A quick page reload should not erase the return report.
 if prev.last_digest is not null and prev.last_digest_at>t-interval '5 minutes' then
   -- Replay must NOT advance the activity cursor: otherwise any world
   -- events that happen between refreshes can be lost from later digests.
   return prev.last_digest || jsonb_build_object('replayed',true,'server_now',t);
 end if;

 -- On first visit, last_active_at was initialized to t.
 has_previous := prev.last_active_at < t-interval '1 second';
 since_at := greatest(prev.last_active_at,t-interval '30 days');
 select hp into strict world_hp from public.iid_world where id=1;
 if has_previous then
   select count(*) filter(where action='HEAL'),count(*) filter(where action='KILL'),
     coalesce(sum(applied_hp) filter(where action='HEAL'),0),
     coalesce(sum(applied_hp) filter(where action='KILL'),0)
   into battle_h,battle_k,heal_hp,kill_hp
   from public.iid_battles
   where settled_at>since_at and settled_at<=t;

   select coalesce(sum(greatest(applied_hp,0)),0),
          coalesce(sum(greatest(-applied_hp,0)),0)
     into war_save,war_kill from public.iid_v2_window_results
     where settled_at>since_at and settled_at<=t;
   heal_hp:=heal_hp+war_save;
   kill_hp:=kill_hp+war_kill;

   select count(*),coalesce(sum(applied_hp),0) into decay_count,decay_hp
   from public.iid_decay_pulses
   where settled_at>since_at and settled_at<=t;

   select count(*),coalesce(sum(applied_hp),0) into event_count,event_hp
   from public.iid_chaos_results
   where settled_at>since_at and settled_at<=t;

   select jsonb_build_object(
     'day_utc',r.day_utc,'winner',r.winner,'applied_hp',r.applied_hp,
     'title',case r.winner
       when 'damage' then e.damage_title
       when 'recovery' then e.recovery_title
       else 'CHAOS STALEMATE' end)
   into last_event
   from public.iid_chaos_results r
     join public.iid_chaos_catalog e on e.day_rotation=r.rotation_day
   where r.settled_at>since_at and r.settled_at<=t
   order by r.settled_at desc limit 1;
 end if;

 body:=jsonb_build_object(
   'first_visit',not has_previous,
   'from',case when has_previous then since_at else null end,
   'until',t,
   'time_limited',has_previous and prev.last_active_at<since_at,
   'heal_battles',battle_h,'kill_battles',battle_k,
   'heal_hp',heal_hp,'kill_hp',kill_hp,
   'decay_pulses',decay_count,'decay_hp',decay_hp,
   'chaos_events',event_count,'chaos_hp',event_hp,
   'net_hp',heal_hp-kill_hp-decay_hp+event_hp,
   'latest_event',last_event,
   'world_hp',world_hp,
   'world_enabled',(select enabled from public.iid_world where id=1),
   'server_now',t,
   'source','SERVER_LEDGER',
   'replayed',false
 );
 update public.iid_player_presence
   set last_active_at=t,last_digest_at=t,last_digest=body
   where user_id=u;
 return body;
end $$
