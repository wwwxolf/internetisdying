-- Production remains paused until independent concurrency and Google OAuth QA.
create schema iid_private;
revoke all on schema iid_private from public, anon, authenticated;
grant usage on schema iid_private to authenticated;

create table public.iid_world (
  id integer primary key check (id = 1),
  hp integer not null check (hp between 0 and 1000000),
  enabled boolean not null default false,
  version bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.iid_world(id,hp) values(1,500000);

-- Deliberately no cascading auth FK: deleting an account must not erase history.
create table public.iid_battles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id uuid not null,
  nickname text not null,
  action text not null check (action in ('HEAL','KILL')),
  created_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  counted_taps integer not null default 0 check(counted_taps between 0 and 50),
  last_tap_at timestamptz,
  settled_at timestamptz,
  base integer check(base between 0 and 25000),
  critical integer check(critical between 1 and 3),
  bonus integer check(bonus in (0,2,4,6,8,10)),
  power integer check(power between 0 and 82500),
  hp_before integer check(hp_before between 0 and 1000000),
  hp_after integer check(hp_after between 0 and 1000000),
  applied_hp integer check(applied_hp between 0 and 82500),
  world_version bigint,
  unique(user_id,request_id),
  check(ends_at = starts_at + interval '20 seconds'),
  check(starts_at = created_at + interval '3 seconds'),
  check((settled_at is null and base is null and critical is null and bonus is null
    and power is null and hp_before is null and hp_after is null and applied_hp is null and world_version is null)
    or (settled_at >= ends_at and base is not null and critical is not null and bonus is not null
    and power is not null and hp_before is not null and hp_after is not null and applied_hp is not null and world_version is not null))
);
create unique index iid_one_pending_battle on public.iid_battles(user_id) where settled_at is null;
create index iid_battle_month_history on public.iid_battles(user_id,settled_at desc) where settled_at is not null;

alter table public.iid_world enable row level security;
alter table public.iid_battles enable row level security;
revoke all on public.iid_world, public.iid_battles from public,anon,authenticated;
grant select on public.iid_world to anon,authenticated;
grant select on public.iid_battles to authenticated;
create policy iid_world_read on public.iid_world for select to anon,authenticated using(true);
create policy iid_history_owner on public.iid_battles for select to authenticated using((select auth.uid())=user_id);

create function iid_private.require_player() returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null or not exists(select 1 from auth.users where id=u and deleted_at is null
    and (banned_until is null or banned_until <= clock_timestamp()))
    or coalesce(auth.jwt()->'app_metadata'->>'provider','') <> 'google'
    or not exists(select 1 from auth.identities where user_id=u and provider='google')
    or not exists(select 1 from auth.sessions where user_id=u
      and id::text=auth.jwt()->>'session_id'
      and (not_after is null or not_after > clock_timestamp())) then
    raise exception 'GOOGLE_LOGIN_REQUIRED' using errcode='28000';
  end if;
  -- Consistent lock order for every mutation: player -> battle -> world.
  perform 1 from public.iid_profiles where user_id=u for update;
  if not found then raise exception 'PROFILE_REQUIRED'; end if;
  return u;
end $$;

-- Unbiased integer from the first 32 random bits of a cryptographic UUID v4.
-- Rejection sampling avoids modulo bias. No browser seed or random input.
create function iid_private.random_int(n integer) returns integer
language plpgsql volatile set search_path='' as $$
declare x bigint; limit_value bigint;
begin
  if n is null or n < 1 or n > 1000000 then raise exception 'INVALID_RANDOM_RANGE'; end if;
  limit_value := 4294967296 - mod(4294967296::bigint,n);
  loop
    x := ('x'||substr(gen_random_uuid()::text,1,8))::bit(32)::bigint;
    exit when x < limit_value;
  end loop;
  return mod(x,n)::integer;
end $$;

create function iid_private.start_battle(p_request_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := iid_private.require_player(); b public.iid_battles; t timestamptz; last_at timestamptz;
begin
  if p_request_id is null or p_action is null or p_action not in ('HEAL','KILL') then raise exception 'INVALID_START'; end if;
  select * into b from public.iid_battles where user_id=u and request_id=p_request_id;
  if found then
    if b.action <> p_action then raise exception 'REQUEST_CONFLICT'; end if;
    return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp());
  end if;
  select * into b from public.iid_battles where user_id=u and settled_at is null;
  if found then return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp()); end if;
  if not (select enabled from public.iid_world where id=1) then raise exception 'BATTLE_PAUSED'; end if;
  t:=clock_timestamp();
  select max(settled_at) into last_at from public.iid_battles where user_id=u;
  if last_at + interval '4 hours' > t then raise exception 'COOLDOWN_ACTIVE'; end if;
  if (select count(*) from public.iid_battles where user_id=u and settled_at > t-interval '24 hours') >= 6 then
    raise exception 'ROLLING_LIMIT_REACHED';
  end if;
  insert into public.iid_battles(user_id,request_id,nickname,action,created_at,starts_at,ends_at)
    select u,p_request_id,nickname,p_action,t,t+interval '3 seconds',t+interval '23 seconds'
    from public.iid_profiles where user_id=u returning * into b;
  return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp());
end $$;

create function iid_private.tap_battle(p_battle_id uuid,p_seq integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := iid_private.require_player(); b public.iid_battles; t timestamptz;
begin
  select * into b from public.iid_battles where id=p_battle_id and user_id=u for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_seq is null or p_seq < 1 or p_seq > 50 then raise exception 'INVALID_SEQUENCE'; end if;
  -- An acknowledged sequence can be replayed, but can never count twice.
  if p_seq <= b.counted_taps then return jsonb_build_object('counted_taps',b.counted_taps,'server_now',clock_timestamp()); end if;
  if p_seq <> b.counted_taps+1 then raise exception 'SEQUENCE_GAP'; end if;
  t:=clock_timestamp();
  if b.settled_at is not null or t < b.starts_at or t >= b.ends_at then raise exception 'TAP_WINDOW_CLOSED'; end if;
  if b.last_tap_at is not null and t < b.last_tap_at+interval '50 milliseconds' then raise exception 'TAP_TOO_FAST'; end if;
  update public.iid_battles set counted_taps=counted_taps+1,last_tap_at=t where id=b.id returning * into b;
  return jsonb_build_object('counted_taps',b.counted_taps,'server_now',clock_timestamp());
end $$;

create function iid_private.settle_battle(p_battle_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := iid_private.require_player(); b public.iid_battles; w public.iid_world;
  r integer; c integer; v_base integer; v_crit integer; v_bonus integer; v_power integer; v_after integer; t timestamptz;
begin
  select * into b from public.iid_battles where id=p_battle_id and user_id=u for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.settled_at is not null then return to_jsonb(b); end if;
  if clock_timestamp() < b.ends_at then raise exception 'BATTLE_NOT_FINISHED'; end if;
  select * into strict w from public.iid_world where id=1 for update;
  t:=clock_timestamp();
  r:=iid_private.random_int(100); c:=iid_private.random_int(100);
  v_base:=case when r<60 then iid_private.random_int(501)
    when r<90 then 501+iid_private.random_int(1500)
    when r<99 then 2001+iid_private.random_int(8000)
    else 10001+iid_private.random_int(15000) end;
  v_crit:=case when c<95 then 1 when c<99 then 2 else 3 end;
  v_bonus:=(b.counted_taps/10)*2;
  v_power:=round(v_base::numeric*v_crit*(100+v_bonus)/100)::integer;
  v_after:=greatest(0,least(1000000,w.hp+case when b.action='HEAL' then v_power else -v_power end));
  update public.iid_world set hp=v_after,version=version+1,updated_at=t where id=1;
  update public.iid_battles set settled_at=t,base=v_base,critical=v_crit,bonus=v_bonus,power=v_power,
    hp_before=w.hp,hp_after=v_after,applied_hp=abs(v_after-w.hp),world_version=w.version+1
    where id=b.id returning * into b;
  return to_jsonb(b);
end $$;

create function iid_private.battle_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := iid_private.require_player(); t timestamptz:=clock_timestamp(); m timestamptz;
  n bigint; heals bigint; kills bigint; heal_hp bigint; kill_hp bigint; next_at timestamptz;
  recent_count bigint; oldest timestamptz; active jsonb; latest jsonb;
begin
  m:=date_trunc('month',t at time zone 'UTC') at time zone 'UTC';
  select count(*),count(*) filter(where action='HEAL'),count(*) filter(where action='KILL'),
    coalesce(sum(applied_hp) filter(where action='HEAL'),0),coalesce(sum(applied_hp) filter(where action='KILL'),0)
    into n,heals,kills,heal_hp,kill_hp from public.iid_battles
    where user_id=u and settled_at>=m and settled_at < m+interval '1 month';
  select max(settled_at)+interval '4 hours' into next_at from public.iid_battles where user_id=u;
  select count(*),min(settled_at) into recent_count,oldest from public.iid_battles where user_id=u and settled_at>t-interval '24 hours';
  if recent_count>=6 then next_at:=greatest(next_at,oldest+interval '24 hours'); end if;
  select to_jsonb(b) into active from public.iid_battles b where user_id=u and settled_at is null;
  select to_jsonb(b) into latest from public.iid_battles b where user_id=u and settled_at is not null order by settled_at desc limit 1;
  return jsonb_build_object('server_now',t,'world',(select to_jsonb(w) from public.iid_world w where id=1),
    'active',active,'latest',latest,'next_battle_at',next_at,'rolling_count',recent_count,
    'monthly',jsonb_build_object('month',to_char(m at time zone 'UTC','YYYY-MM'),'timezone','UTC',
      'nickname',(select nickname from public.iid_profiles where user_id=u),'battle_count',n,
      'heal_count',heals,'kill_count',kills,'heal_hp',heal_hp,'kill_hp',kill_hp,
      'tier',case when n>=90 then 'Ancestral' when n>=45 then 'Legendary' when n>=15 then 'Rare' when n>=1 then 'Common' else null end));
end $$;

-- Only these four checked entrypoints are callable; no generic write/RNG API.
revoke all on all functions in schema iid_private from public,anon,authenticated;
grant execute on function iid_private.start_battle(uuid,text),iid_private.tap_battle(uuid,integer),
  iid_private.settle_battle(uuid),iid_private.battle_status() to authenticated;

create function public.iid_battle_start(p_request_id uuid,p_action text) returns jsonb
language sql security invoker set search_path='' as $$ select iid_private.start_battle(p_request_id,p_action) $$;
create function public.iid_battle_tap(p_battle_id uuid,p_seq integer) returns jsonb
language sql security invoker set search_path='' as $$ select iid_private.tap_battle(p_battle_id,p_seq) $$;
create function public.iid_battle_settle(p_battle_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select iid_private.settle_battle(p_battle_id) $$;
create function public.iid_battle_status() returns jsonb
language sql security invoker set search_path='' as $$ select iid_private.battle_status() $$;
revoke all on function public.iid_battle_start(uuid,text),public.iid_battle_tap(uuid,integer),
  public.iid_battle_settle(uuid),public.iid_battle_status() from public,anon,authenticated;
grant execute on function public.iid_battle_start(uuid,text),public.iid_battle_tap(uuid,integer),
  public.iid_battle_settle(uuid),public.iid_battle_status() to authenticated;
