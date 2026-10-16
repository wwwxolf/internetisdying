-- V4 immutable public-by-unguessable-URL share snapshots.
-- All numbers are ACTUALLY APPLIED world HP from settled V4 events, never
-- faction power or unfinalized battle influence. Does not activate an epoch.
create table iid_v4.share_cards (
 id uuid primary key default gen_random_uuid(),
 epoch_id uuid not null references iid_v4.epochs(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 snapshot jsonb not null,
 constraint v4_share_verified check (
  snapshot->>'source'='V4_SETTLED_LEDGER_SHARE'
  and snapshot->>'engine_version'='4'
  and snapshot->>'epoch_id'=epoch_id::text
 )
);
create index v4_share_owner_recent on iid_v4.share_cards(user_id,created_at desc);
alter table iid_v4.share_cards enable row level security;
revoke all on iid_v4.share_cards from public,anon,authenticated;

create function iid_v4.publish_share_card() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=iid_private.require_player();
 e iid_v4.epochs;
 now_at timestamptz;
 since_at timestamptz;
 d jsonb; card_id uuid;
begin
 -- Same gate as V4 route: no share endpoint while V2 is authoritative.
 select * into e from iid_v4.epochs where published order by starts_at desc limit 1 for share;
 if not found then raise exception 'V4_NOT_PUBLISHED';end if;
 now_at:=clock_timestamp();
 if now_at<e.starts_at then raise exception 'V4_NOT_STARTED';end if;
 if (select count(*) from iid_v4.share_cards
    where user_id=u and created_at>now_at-interval '1 hour')>=30 then
   raise exception 'SHARE_RATE_LIMITED';
 end if;
 -- Snapshot frozen to a clearly labeled most-recent-24h observation window.
 since_at:=greatest(e.starts_at,now_at-interval '24 hours');
 with settled as (
  select kind,applied from iid_v4.events
  where epoch_id=e.id and settled_at>since_at and settled_at<=now_at
 ), totals as (
  select
   coalesce(sum(greatest(applied,0)) filter(where kind='BATTLE'),0)::bigint as healed,
   coalesce(sum(greatest(-applied,0)) filter(where kind='BATTLE'),0)::bigint as damaged,
   coalesce(-sum(applied) filter(where kind in('DECAY','FINAL')),0)::bigint as decay,
   coalesce(sum(applied) filter(where kind='CHAOS'),0)::bigint as chaos,
   coalesce(sum(applied),0)::bigint as net,
   count(*) filter(where kind='BATTLE')::integer as war_windows,
   count(*) filter(where kind='BATTLE' and applied>0)::integer as healed_windows,
   count(*) filter(where kind='BATTLE' and applied<0)::integer as damaged_windows,
   count(*) filter(where kind in('DECAY','FINAL'))::integer as decay_pulses,
   count(*) filter(where kind='CHAOS')::integer as chaos_events
  from settled
 )
 select jsonb_build_object(
   'source','V4_SETTLED_LEDGER_SHARE','engine_version',4,
   'epoch_id',e.id,'snapshot_at',now_at,'from',since_at,
   'period','LAST_24H',
   'world_hp',e.hp,'world_status',e.status,'winner',e.winner,
   'world_version',e.version,
   'heal_hp',totals.healed,'kill_hp',totals.damaged,
   'decay_hp',totals.decay,'chaos_hp',totals.chaos,'net_hp',totals.net,
   'heal_battles',totals.healed_windows,'kill_battles',totals.damaged_windows,
   'battle_windows',totals.war_windows,'decay_pulses',totals.decay_pulses,
   'chaos_events',totals.chaos_events
 ) into d from totals;
 if d is null or (d->>'net_hp')::bigint <>
  ((d->>'heal_hp')::bigint-(d->>'kill_hp')::bigint-
   (d->>'decay_hp')::bigint+(d->>'chaos_hp')::bigint) then
  raise exception 'V4_SHARE_LEDGER_MISMATCH';
 end if;
 insert into iid_v4.share_cards(epoch_id,user_id,created_at,snapshot)
  values(e.id,u,now_at,d) returning id into card_id;
 return jsonb_build_object('id',card_id,'snapshot',d);
end $$;
revoke all on function iid_v4.publish_share_card() from public,anon,authenticated;
grant execute on function iid_v4.publish_share_card() to authenticated;
create function public.iid_v4_publish_share_card() returns jsonb
language sql security invoker set search_path='' as $$
 select iid_v4.publish_share_card()
$$;
revoke all on function public.iid_v4_publish_share_card() from public,anon,authenticated;
grant execute on function public.iid_v4_publish_share_card() to authenticated;

-- Anyone possessing the UUID may read ONLY the frozen, anonymous snapshot,
-- without identity, auth details, or access to V2 card storage.
create function iid_v4.public_share_card(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select c.snapshot from iid_v4.share_cards c where c.id=p_id
$$;
revoke all on function iid_v4.public_share_card(uuid) from public,anon,authenticated;
grant execute on function iid_v4.public_share_card(uuid) to anon,authenticated;
create function public.iid_v4_public_share_card(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select iid_v4.public_share_card(p_id)
$$;
revoke all on function public.iid_v4_public_share_card(uuid) from public,anon,authenticated;
grant execute on function public.iid_v4_public_share_card(uuid) to anon,authenticated;
