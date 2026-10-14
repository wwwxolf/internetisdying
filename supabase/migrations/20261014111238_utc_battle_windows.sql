-- Convert the existing six daily battle slots from Asia/Jakarta to UTC.
-- Slots are 00:00–03:59, 04:00–07:59, 08:00–11:59,
-- 12:00–15:59, 16:00–19:59, and 20:00–23:59 UTC.
-- Server enforces one start per UTC slot, based on immutable created_at.
-- A battle created under the previous scheme is counted in its real UTC
-- window; we do not erase or rewrite historical battles.
-- World Decay remains on its existing 6-hour interval and PAUSED;
-- this migration does not change clocks for Daily Chaos or activate jobs.

create or replace function iid_private.start_battle(p_request_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := iid_private.require_player(); b public.iid_battles; t timestamptz; today_utc date; slot_no integer;
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
  -- Fixed six UTC windows, one battle START per player per window.
  -- Record created_at is authoritative; settling after a window boundary
  -- cannot give a second attempt in the old window.
  today_utc:=(t at time zone 'UTC')::date;
  slot_no:=(extract(hour from t at time zone 'UTC')::int / 4);
  if exists(select 1 from public.iid_battles
            where user_id=u and (created_at at time zone 'UTC')::date=today_utc
              and (extract(hour from created_at at time zone 'UTC')::int / 4)=slot_no)
  then raise exception 'WINDOW_ALREADY_USED'; end if;
  insert into public.iid_battles(user_id,request_id,nickname,action,created_at,starts_at,ends_at)
    select u,p_request_id,nickname,p_action,t,t+interval '3 seconds',t+interval '23 seconds'
    from public.iid_profiles where user_id=u returning * into b;
  return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp());
end $$;

create or replace function iid_private.battle_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := iid_private.require_player(); t timestamptz:=clock_timestamp(); m timestamptz;
  n bigint; heals bigint; kills bigint; heal_hp bigint; kill_hp bigint; next_at timestamptz;
  recent_count bigint; oldest timestamptz; active jsonb; latest jsonb;
  today_utc date; slot_no integer; slots_used jsonb; today_start timestamptz;
begin
  m:=date_trunc('month',t at time zone 'UTC') at time zone 'UTC';
  select count(*),count(*) filter(where action='HEAL'),count(*) filter(where action='KILL'),
    coalesce(sum(applied_hp) filter(where action='HEAL'),0),coalesce(sum(applied_hp) filter(where action='KILL'),0)
    into n,heals,kills,heal_hp,kill_hp from public.iid_battles
    where user_id=u and settled_at>=m and settled_at < m+interval '1 month';
  today_utc:=(t at time zone 'UTC')::date;
  slot_no:=(extract(hour from t at time zone 'UTC')::int / 4);
  today_start:=(today_utc::timestamp at time zone 'UTC');
  select coalesce(jsonb_agg(exists(
    select 1 from public.iid_battles b
    where b.user_id=u and b.created_at>=today_start
      and b.created_at<today_start+interval '1 day'
      and (extract(hour from b.created_at at time zone 'UTC')::int / 4)=x.i
  ) order by x.i),'[]'::jsonb)
  into slots_used from generate_series(0,5) x(i);
  -- Keep legacy rolling_count for read-only compatibility, never as a gate.
  select count(*),min(settled_at) into recent_count,oldest from public.iid_battles
   where user_id=u and settled_at>t-interval '24 hours';
  if slots_used->>slot_no='true' then
    next_at:=today_start+(slot_no+1)*interval '4 hours';
  else
    next_at:=t;
  end if;
  select to_jsonb(b) into active from public.iid_battles b where user_id=u and settled_at is null;
  select to_jsonb(b) into latest from public.iid_battles b where user_id=u and settled_at is not null order by settled_at desc limit 1;
  return jsonb_build_object('server_now',t,'world',(select to_jsonb(w) from public.iid_world w where id=1),
    'active',active,'latest',latest,'next_battle_at',next_at,'rolling_count',recent_count,
    'window_timezone','UTC','window_day',today_utc,'window_slot',slot_no,
    'window_used',slots_used,
    'monthly',jsonb_build_object('month',to_char(m at time zone 'UTC','YYYY-MM'),'timezone','UTC',
      'nickname',(select nickname from public.iid_profiles where user_id=u),'battle_count',n,
      'heal_count',heals,'kill_count',kills,'heal_hp',heal_hp,'kill_hp',kill_hp,
      'tier',case when n>=90 then 'Ancestral' when n>=45 then 'Legendary' when n>=15 then 'Rare' when n>=1 then 'Common' else null end));
end $$;
