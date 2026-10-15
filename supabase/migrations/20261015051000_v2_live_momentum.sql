-- V2-only read model for cached public momentum, not the World HP ledger.
-- 64 shards avoid the single-row write hotspot at battle settlement.
create table public.iid_v2_live_buckets (
 slot_start timestamptz not null,
 bucket smallint not null check(bucket>=0 and bucket<64),
 save_influence bigint not null default 0 check(save_influence>=0),
 kill_influence bigint not null default 0 check(kill_influence>=0),
 battle_count bigint not null default 0 check(battle_count>=0),
 primary key(slot_start,bucket)
);
alter table public.iid_v2_live_buckets enable row level security;
revoke all on table public.iid_v2_live_buckets from public,anon,authenticated;

create function iid_private.v2_live_record_settlement() returns trigger
language plpgsql security definer set search_path='' as $$
declare s timestamptz; shard smallint; score bigint;
begin
 if new.engine_version<>2 or new.settled_at is null then return new;end if;
 score:=new.war_influence;
 if score is null or score<=0 or new.action not in ('HEAL','KILL') then
  return new;
 end if;
 s:=date_trunc('hour',new.created_at at time zone 'UTC') at time zone 'UTC';
 s:=s-mod(extract(hour from new.created_at at time zone 'UTC')::integer,4)*interval '1 hour';
 shard:=mod(abs(hashtext(new.id::text)::bigint),64)::smallint;
 insert into public.iid_v2_live_buckets as b (slot_start,bucket,save_influence,kill_influence,battle_count)
 values(s,shard,
  case when new.action='HEAL' then score else 0 end,
  case when new.action='KILL' then score else 0 end,1)
 on conflict(slot_start,bucket) do update
 set save_influence=b.save_influence+excluded.save_influence,
 kill_influence=b.kill_influence+excluded.kill_influence,
 battle_count=b.battle_count+1;
 return new;
end $$;
revoke all on function iid_private.v2_live_record_settlement() from public,anon,authenticated;

-- Atomic backfill + installation; concurrent battle settlements cannot be lost.
lock table public.iid_battles in share row exclusive mode;
create trigger iid_v2_live_verified_settlement
 after update of settled_at on public.iid_battles
 for each row
 when(old.settled_at is null and new.settled_at is not null and new.engine_version=2)
 execute function iid_private.v2_live_record_settlement();

insert into public.iid_v2_live_buckets(slot_start,bucket,save_influence,kill_influence,battle_count)
select
 (date_trunc('hour',created_at at time zone 'UTC') at time zone 'UTC')
 - mod(extract(hour from created_at at time zone 'UTC')::integer,4)*interval '1 hour',
 mod(abs(hashtext(id::text)::bigint),64)::smallint,
 coalesce(sum(war_influence::bigint) filter(where action='HEAL'),0),
 coalesce(sum(war_influence::bigint) filter(where action='KILL'),0),
 count(*)
from public.iid_battles
where engine_version=2 and settled_at is not null and war_influence>0
 and action in ('HEAL','KILL')
group by 1,2
on conflict(slot_start,bucket) do update set
 save_influence=excluded.save_influence,
 kill_influence=excluded.kill_influence,
 battle_count=excluded.battle_count;

-- Public API releases ONLY faction aggregates and window timestamps.
-- No player identities, individual battles, auth secrets, or row access.
create function iid_private.v2_live_public_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
declare t timestamptz:=clock_timestamp();s timestamptz; active boolean;
 sv bigint;kl bigint;n bigint;
begin
 select v2_enabled into strict active from public.iid_economy_control where id=1;
 s:=date_trunc('hour',t at time zone 'UTC') at time zone 'UTC';
 s:=s-mod(extract(hour from t at time zone 'UTC')::integer,4)*interval '1 hour';
 select coalesce(sum(save_influence),0),coalesce(sum(kill_influence),0),coalesce(sum(battle_count),0)
 into sv,kl,n from public.iid_v2_live_buckets where slot_start=s;
 return jsonb_build_object('enabled',active,
  'window_start',s,'window_end',s+interval '4 hours',
  'save_influence',case when active then sv else 0 end,
  'kill_influence',case when active then kl else 0 end,
  'battle_count',case when active then n else 0 end,
  'server_now',t);
end $$;
revoke all on function iid_private.v2_live_public_summary() from public,anon,authenticated;

-- Narrow security-definer wrapper required for anonymous public read access.
-- Fixed signature, no dynamic SQL, returns only aggregate data.
create function public.iid_public_v2_momentum() returns jsonb
language sql security definer set search_path='' as $$
 select iid_private.v2_live_public_summary()
$$;
revoke all on function public.iid_public_v2_momentum() from public,anon,authenticated;
grant execute on function public.iid_public_v2_momentum() to anon,authenticated;
