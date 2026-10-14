-- BREAKING INTERNET share snapshot — read-only verified ledger values as of share click.
-- Does not mutate world HP, player presence/cursors, battles or scheduler.
create function iid_private.share_snapshot() returns jsonb
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
    'heal_hp',b.save_hp,'kill_hp',b.kill_hp,
    'decay_pulses',d.pulses,'decay_hp',d.hp,
    'chaos_events',c.events,'chaos_hp',c.hp,
    'net_hp',b.save_hp-b.kill_hp-d.hp+c.hp
  ) into data
  from public.iid_world w
  cross join battles b cross join decay d cross join chaos c
  where w.id=1;
  if data is null then raise exception 'WORLD_NOT_FOUND';end if;
  return data;
end $$;

revoke all on function iid_private.share_snapshot() from public,anon,authenticated;
grant execute on function iid_private.share_snapshot() to authenticated;
create function public.iid_share_snapshot() returns jsonb
language sql security invoker set search_path='' as
$$ select iid_private.share_snapshot() $$;
revoke all on function public.iid_share_snapshot() from public,anon,authenticated;
grant execute on function public.iid_share_snapshot() to authenticated;
