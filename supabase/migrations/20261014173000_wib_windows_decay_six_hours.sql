-- Six fixed player battle windows per Asia/Jakarta day (UTC+7).
-- Window #1 00:00-03:59, #2 04:00-07:59, #3 08:00-11:59,
-- #4 12:00-15:59, #5 16:00-19:59, #6 20:00-23:59.
-- One authenticated battle creation in each window; status derived from
-- server times and immutable created_at, not local browser time.
-- World Decay interval changes from 3 hours to 6 hours, while remaining
-- PAUSED unless operators explicitly activate iid_chaos_control.
-- Existing historical decay slots retain their original schedule.
-- Safe rollout assumes decay has not started; prevent ambiguous rephasing.
do $$
begin
 if exists(select 1 from public.iid_decay_pulses)
    and exists(select 1 from public.iid_chaos_control where id=1 and decay_anchor_at is not null)
 then raise exception 'DECAY_SCHEDULE_ALREADY_STARTED_REQUIRES_MIGRATION_PLAN'; end if;
end $$;

create or replace function iid_private.start_battle(p_request_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := iid_private.require_player(); b public.iid_battles; t timestamptz; today_wib date; slot_no integer;
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
  -- Fixed six WIB windows, one battle START per player per window.
  -- Record created_at is authoritative; settling after a window boundary
  -- cannot give a second attempt in the old window.
  today_wib:=(t at time zone 'Asia/Jakarta')::date;
  slot_no:=(extract(hour from t at time zone 'Asia/Jakarta')::int / 4);
  if exists(select 1 from public.iid_battles
            where user_id=u and (created_at at time zone 'Asia/Jakarta')::date=today_wib
              and (extract(hour from created_at at time zone 'Asia/Jakarta')::int / 4)=slot_no)
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
  today_wib date; slot_no integer; slots_used jsonb; today_start timestamptz;
begin
  m:=date_trunc('month',t at time zone 'UTC') at time zone 'UTC';
  select count(*),count(*) filter(where action='HEAL'),count(*) filter(where action='KILL'),
    coalesce(sum(applied_hp) filter(where action='HEAL'),0),coalesce(sum(applied_hp) filter(where action='KILL'),0)
    into n,heals,kills,heal_hp,kill_hp from public.iid_battles
    where user_id=u and settled_at>=m and settled_at < m+interval '1 month';
  today_wib:=(t at time zone 'Asia/Jakarta')::date;
  slot_no:=(extract(hour from t at time zone 'Asia/Jakarta')::int / 4);
  today_start:=(today_wib::timestamp at time zone 'Asia/Jakarta');
  select coalesce(jsonb_agg(exists(
    select 1 from public.iid_battles b
    where b.user_id=u and b.created_at>=today_start
      and b.created_at<today_start+interval '1 day'
      and (extract(hour from b.created_at at time zone 'Asia/Jakarta')::int / 4)=x.i
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
    'window_timezone','Asia/Jakarta','window_day',today_wib,'window_slot',slot_no,
    'window_used',slots_used,
    'monthly',jsonb_build_object('month',to_char(m at time zone 'UTC','YYYY-MM'),'timezone','UTC',
      'nickname',(select nickname from public.iid_profiles where user_id=u),'battle_count',n,
      'heal_count',heals,'kill_count',kills,'heal_hp',heal_hp,'kill_hp',kill_hp,
      'tier',case when n>=90 then 'Ancestral' when n>=45 then 'Legendary' when n>=15 then 'Rare' when n>=1 then 'Common' else null end));
end $$;

create or replace function iid_private.chaos_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); c public.iid_chaos_control;
 t timestamptz:=clock_timestamp(); d date:=(t at time zone 'UTC')::date;
 rotation smallint; vote_choice text; votes_d bigint; votes_r bigint;
 next_pulse timestamptz; last_pulse jsonb; last_result jsonb;
begin
 select * into strict c from public.iid_chaos_control where id=1;
 rotation:=iid_private.chaos_rotation(d,c.anchor_utc);
 select v.choice into vote_choice from public.iid_chaos_votes v
   where v.day_utc=d and v.user_id=u;
 select count(*) filter(where choice='damage'),count(*) filter(where choice='recovery')
 into votes_d,votes_r from public.iid_chaos_votes where day_utc=d;
 select to_jsonb(p) into last_pulse from public.iid_decay_pulses p
  order by p.slot_no desc limit 1;
 select to_jsonb(r) into last_result from public.iid_chaos_results r
  order by r.day_utc desc limit 1;
 if c.decay_anchor_at is not null then
   select c.decay_anchor_at + (coalesce(max(slot_no),0)+1)*interval '6 hours'
   into next_pulse from public.iid_decay_pulses;
 end if;
 return jsonb_build_object(
  'server_now',t,'enabled',c.enabled and (select enabled from public.iid_world where id=1),
  'day_utc',d,'day_rotation',rotation,
  'event',(select to_jsonb(e) from public.iid_chaos_catalog e where e.day_rotation=rotation),
  'voted_for',vote_choice,'damage_votes',votes_d,'recovery_votes',votes_r,
  'closes_at',((d+1)::timestamp at time zone 'UTC'),
  'next_decay_at',next_pulse,'last_decay',last_pulse,'latest_result',last_result,
  'min_votes',c.min_votes,'preview',not c.enabled
 );
end $$;

create or replace function iid_private.process_decay() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.iid_chaos_control; w public.iid_world;
 current_slot bigint; last_slot bigint; i bigint; roll integer;
 new_hp integer; processed integer:=0; t timestamptz:=clock_timestamp();
begin
 select * into strict c from public.iid_chaos_control where id=1 for update;
 select * into strict w from public.iid_world where id=1 for update;
 if not c.enabled or not w.enabled or c.decay_anchor_at is null then
   return jsonb_build_object('status','PAUSED','processed',0);
 end if;
 current_slot:=floor(extract(epoch from (t-c.decay_anchor_at))/21600)::bigint;
 if current_slot<1 then return jsonb_build_object('status','WAITING','processed',0); end if;
 select coalesce(max(slot_no),0) into last_slot from public.iid_decay_pulses;
 for i in (last_slot+1)..least(current_slot,last_slot+8) loop
   roll:=800+iid_private.random_int(201);
   new_hp:=greatest(0,w.hp-roll);
   update public.iid_world set hp=new_hp,version=version+1,updated_at=t where id=1;
   insert into public.iid_decay_pulses(slot_no,scheduled_at,rolled_hp,applied_hp,hp_after,world_version)
     values(i,c.decay_anchor_at+i*interval '6 hours',roll,w.hp-new_hp,new_hp,w.version+1);
   w.hp:=new_hp;w.version:=w.version+1;
   processed:=processed+1;
 end loop;
 return jsonb_build_object('status','OK','processed',processed,'hp',w.hp);
end $$;
