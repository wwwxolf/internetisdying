-- THE INTERNET IS DYING: versioned V2 combat, initially disabled.
-- Historical V1 rows, world HP, and Daily Chaos/Decay are unchanged by this migration.
create table public.iid_economy_control (
 id integer primary key check(id=1),
 v2_enabled boolean not null default false,
 activated_at timestamptz
);
insert into public.iid_economy_control(id) values(1);
alter table public.iid_economy_control enable row level security;
revoke all on public.iid_economy_control from public,anon,authenticated;

alter table public.iid_battles
 add column engine_version smallint not null default 1,
 add column war_influence integer;

alter table public.iid_battles
 drop constraint iid_battles_check,
 drop constraint iid_battles_check1,
 drop constraint iid_battles_critical_check,
 drop constraint iid_battles_bonus_check,
 drop constraint iid_battles_counted_taps_check;

alter table public.iid_battles
 add constraint iid_battles_v2_version check(engine_version in (1,2)),
 add constraint iid_battles_v2_duration check(
  (engine_version=1 and ends_at=starts_at+interval '20 seconds')
  or (engine_version=2 and ends_at=starts_at+interval '12 seconds')),
 add constraint iid_battles_v2_ready check(
  (engine_version=1 and starts_at=created_at+interval '3 seconds')
  or (engine_version=2 and starts_at=created_at+interval '2 seconds')),
 add constraint iid_battles_v2_critical check(
  critical is null or
  (engine_version=1 and critical between 1 and 3) or
  (engine_version=2 and critical in (100,150,200))),
 add constraint iid_battles_v2_bonus check(
  bonus is null or
  (engine_version=1 and bonus in (0,2,4,6,8,10)) or
  (engine_version=2 and bonus between 0 and 6)),
 add constraint iid_battles_v2_taps check(
  (engine_version=1 and counted_taps between 0 and 50)
  or (engine_version=2 and counted_taps between 0 and 24)),
 add constraint iid_battles_v2_influence check(
  (engine_version=1 and war_influence is null)
  or (engine_version=2 and
    ((settled_at is null and war_influence is null)
      or (settled_at is not null and war_influence between 0 and 400))));

create table public.iid_v2_window_results (
 slot_start timestamptz primary key,
 save_influence bigint not null default 0,
 kill_influence bigint not null default 0,
 battle_count bigint not null default 0,
 nominal_hp integer not null check(nominal_hp between -6000 and 6000),
 applied_hp integer not null,
 hp_after integer not null check(hp_after between 0 and 1000000),
 world_version bigint not null,
 settled_at timestamptz not null default clock_timestamp()
);
alter table public.iid_v2_window_results enable row level security;
revoke all on public.iid_v2_window_results from public,anon,authenticated;

-- Choose V1 or V2 by a server-owned flag, preserving the six UTC slots.
create or replace function iid_private.start_battle(p_request_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); b public.iid_battles;
 t timestamptz; day_utc date; slot_no integer; v2 boolean;
begin
 if p_request_id is null or p_action not in ('HEAL','KILL')
  then raise exception 'INVALID_START'; end if;
 select * into b from public.iid_battles where user_id=u and request_id=p_request_id;
 if found then
   if b.action<>p_action then raise exception 'REQUEST_CONFLICT'; end if;
   return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp());
 end if;
 select * into b from public.iid_battles where user_id=u and settled_at is null;
 if found then return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp()); end if;
 if not (select enabled from public.iid_world where id=1) then raise exception 'BATTLE_PAUSED'; end if;
 t:=clock_timestamp();
 day_utc:=(t at time zone 'UTC')::date;
 slot_no:=extract(hour from t at time zone 'UTC')::integer/4;
 if exists(select 1 from public.iid_battles where user_id=u
   and (created_at at time zone 'UTC')::date=day_utc
   and extract(hour from created_at at time zone 'UTC')::integer/4=slot_no)
 then raise exception 'WINDOW_ALREADY_USED'; end if;
 select v2_enabled into strict v2 from public.iid_economy_control where id=1;
 insert into public.iid_battles(user_id,request_id,nickname,action,engine_version,created_at,starts_at,ends_at)
 select u,p_request_id,nickname,p_action,case when v2 then 2 else 1 end,
   t,t+case when v2 then interval '2 seconds' else interval '3 seconds' end,
   t+case when v2 then interval '14 seconds' else interval '23 seconds' end
 from public.iid_profiles where user_id=u returning * into b;
 return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp());
end $$;

-- Verified per-battle tap totals, with version-specific caps and pacing.
create or replace function iid_private.tap_batch(p_battle_id uuid,p_total integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); b public.iid_battles;
 t timestamptz; delta integer; max_n integer;
begin
 select * into b from public.iid_battles where id=p_battle_id and user_id=u for update;
 if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
 max_n:=case when b.engine_version=2 then 24 else 50 end;
 if p_total is null or p_total<1 or p_total>max_n then raise exception 'INVALID_TAP_TOTAL'; end if;
 if p_total<=b.counted_taps then
  return jsonb_build_object('counted_taps',b.counted_taps,'server_now',clock_timestamp());
 end if;
 delta:=p_total-b.counted_taps;
 if delta>10 then raise exception 'BATCH_TOO_LARGE'; end if;
 t:=clock_timestamp();
 if b.settled_at is not null or t<b.starts_at or t>=b.ends_at then
   raise exception 'TAP_WINDOW_CLOSED'; end if;
 if t<coalesce(b.last_tap_at,b.starts_at)+delta*interval '40 milliseconds' then
   raise exception 'TAP_TOO_FAST'; end if;
 update public.iid_battles set counted_taps=p_total,last_tap_at=t where id=b.id;
 return jsonb_build_object('counted_taps',p_total,'server_now',t);
end $$;

create or replace function iid_private.tap_battle(p_battle_id uuid,p_seq integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); b public.iid_battles; t timestamptz; max_n integer;
begin
 select * into b from public.iid_battles where id=p_battle_id and user_id=u for update;
 if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
 max_n:=case when b.engine_version=2 then 24 else 50 end;
 if p_seq is null or p_seq<1 or p_seq>max_n then raise exception 'INVALID_SEQUENCE'; end if;
 if p_seq<=b.counted_taps then
  return jsonb_build_object('counted_taps',b.counted_taps,'server_now',clock_timestamp());end if;
 if p_seq<>b.counted_taps+1 then raise exception 'SEQUENCE_GAP'; end if;
 t:=clock_timestamp();
 if b.settled_at is not null or t<b.starts_at or t>=b.ends_at then
  raise exception 'TAP_WINDOW_CLOSED'; end if;
 if b.last_tap_at is not null and t<b.last_tap_at+interval '50 milliseconds' then
  raise exception 'TAP_TOO_FAST'; end if;
 update public.iid_battles set counted_taps=counted_taps+1,last_tap_at=t where id=b.id returning * into b;
 return jsonb_build_object('counted_taps',b.counted_taps,'server_now',clock_timestamp());
end $$;

-- Internal settled V2 result: Personal Power and Influence only.
-- The *collective* window settlement later adjusts authoritative world HP.
create or replace function iid_private.settle_v2_due(p_battle_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.iid_battles; w public.iid_world;
 r integer; c integer; v_base integer; v_crit integer; v_bonus integer;
 v_power integer; v_influence integer;
begin
 select * into b from public.iid_battles
 where id=p_battle_id and engine_version=2 for update;
 if not found then raise exception 'V2_BATTLE_NOT_FOUND'; end if;
 if b.settled_at is not null then return to_jsonb(b); end if;
 if clock_timestamp()<b.ends_at then raise exception 'BATTLE_NOT_FINISHED'; end if;
 r:=iid_private.random_int(100); c:=iid_private.random_int(100);
 v_base:=case when r<55 then 100+iid_private.random_int(150)
   when r<85 then 250+iid_private.random_int(350)
   when r<97 then 600+iid_private.random_int(700)
   else 1300+iid_private.random_int(1201) end;
 v_crit:=case when c<90 then 100 when c<99 then 150 else 200 end;
 v_bonus:=least(6,b.counted_taps/4);
 v_power:=round(v_base::numeric*v_crit/100*(100+v_bonus)/100)::integer;
 v_influence:=round(100*sqrt(v_power::numeric/400))::integer;
 select * into strict w from public.iid_world where id=1;
 update public.iid_battles set settled_at=clock_timestamp(),base=v_base,
  critical=v_crit,bonus=v_bonus,power=v_power,war_influence=v_influence,
  hp_before=w.hp,hp_after=w.hp,applied_hp=0,world_version=w.version
 where id=b.id returning * into b;
 return to_jsonb(b);
end $$;
revoke all on function iid_private.settle_v2_due(uuid) from public,anon,authenticated;

-- V1 preserves existing immediate world-HP application; V2 stores the result for
-- deterministic UTC-window aggregation. No V1 history is rewritten.
create or replace function iid_private.settle_battle(p_battle_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); b public.iid_battles; w public.iid_world;
 r integer;c integer;v_base integer;v_crit integer;v_bonus integer;
 v_power integer;v_after integer;t timestamptz;
begin
 select * into b from public.iid_battles where id=p_battle_id and user_id=u for update;
 if not found then raise exception 'BATTLE_NOT_FOUND';end if;
 if b.settled_at is not null then return to_jsonb(b);end if;
 if clock_timestamp()<b.ends_at then raise exception 'BATTLE_NOT_FINISHED';end if;
 if b.engine_version=2 then return iid_private.settle_v2_due(b.id);end if;
 select * into strict w from public.iid_world where id=1 for update;
 t:=clock_timestamp();
 r:=iid_private.random_int(100);c:=iid_private.random_int(100);
 v_base:=case when r<60 then iid_private.random_int(501)
  when r<90 then 501+iid_private.random_int(1500)
  when r<99 then 2001+iid_private.random_int(8000)
  else 10001+iid_private.random_int(15000) end;
 v_crit:=case when c<95 then 1 when c<99 then 2 else 3 end;
 v_bonus:=(b.counted_taps/10)*2;
 v_power:=round(v_base::numeric*v_crit*(100+v_bonus)/100)::integer;
 v_after:=greatest(0,least(1000000,w.hp+
  case when b.action='HEAL' then v_power else -v_power end));
 update public.iid_world set hp=v_after,version=version+1,updated_at=t where id=1;
 update public.iid_battles set settled_at=t,base=v_base,critical=v_crit,
  bonus=v_bonus,power=v_power,hp_before=w.hp,hp_after=v_after,
  applied_hp=abs(v_after-w.hp),world_version=w.version+1
 where id=b.id returning * into b;
 return to_jsonb(b);
end $$;

-- Server-owned status for the progressive frontend, authenticated by require_player.
create or replace function iid_private.economy_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=iid_private.require_player(); flag boolean; t timestamptz:=clock_timestamp();
 s timestamptz; a bigint; b bigint; n bigint; recent jsonb;
begin
 select v2_enabled into strict flag from public.iid_economy_control where id=1;
 s:=date_trunc('hour',t)-mod(extract(hour from t at time zone 'UTC')::integer,4)*interval '1 hour';
 select coalesce(sum(war_influence) filter(where action='HEAL'),0),
  coalesce(sum(war_influence) filter(where action='KILL'),0), count(*)
 into a,b,n from public.iid_battles where engine_version=2
  and settled_at is not null and created_at>=s and created_at<s+interval '4 hours';
 select to_jsonb(x) into recent from public.iid_v2_window_results x order by slot_start desc limit 1;
 return jsonb_build_object('enabled',flag,'duration_seconds',12,'ready_seconds',2,
  'max_taps',24,'save_influence',a,'kill_influence',b,'battle_count',n,
  'window_start',s,'latest_window',recent,'server_now',t);
end $$;
revoke all on function iid_private.economy_status() from public,anon,authenticated;
grant execute on function iid_private.economy_status() to authenticated;
create function public.iid_economy_status() returns jsonb
language sql security invoker set search_path='' as $$
 select iid_private.economy_status() $$;
revoke all on function public.iid_economy_status() from public,anon,authenticated;
grant execute on function public.iid_economy_status() to authenticated;

-- Scheduler-only function, not granted to API roles. Window closure is idempotent.
create or replace function iid_private.process_v2_windows() returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctrl public.iid_economy_control; world public.iid_world;
 t timestamptz:=clock_timestamp(); current_start timestamptz;
 s timestamptz; first_slot timestamptz; rec record;
 saves bigint;kills bigint;n bigint;q numeric;z numeric;
 nominal integer;after_hp integer; applied integer;processed integer:=0;
begin
 select * into strict ctrl from public.iid_economy_control where id=1 for update;
 if not ctrl.v2_enabled or ctrl.activated_at is null then
   return jsonb_build_object('status','PAUSED','processed',0);end if;
 if not (select enabled from public.iid_world where id=1) then
   return jsonb_build_object('status','WORLD_PAUSED','processed',0);end if;
 current_start:=date_trunc('hour',t at time zone 'UTC')
    at time zone 'UTC';
 current_start:=current_start-mod(extract(hour from t at time zone 'UTC')::integer,4)*interval '1 hour';
 first_slot:=date_trunc('hour',ctrl.activated_at at time zone 'UTC') at time zone 'UTC';
 first_slot:=first_slot-mod(extract(hour from ctrl.activated_at at time zone 'UTC')::integer,4)*interval '1 hour';
 for s in select g.slot from generate_series(first_slot,current_start-interval '4 hours',interval '4 hours') g(slot)
   where not exists(select 1 from public.iid_v2_window_results x where x.slot_start=g.slot)
   order by g.slot limit 12
 loop
   if t<s+interval '4 hours 90 seconds' then exit;end if;
   for rec in select id from public.iid_battles
       where engine_version=2 and created_at>=s and created_at<s+interval '4 hours'
       and settled_at is null and ends_at<=t
       order by created_at,id
   loop perform iid_private.settle_v2_due(rec.id);end loop;
   select coalesce(sum(war_influence) filter(where action='HEAL'),0),
      coalesce(sum(war_influence) filter(where action='KILL'),0),count(*)
    into saves,kills,n from public.iid_battles
     where engine_version=2 and created_at>=s and created_at<s+interval '4 hours'
       and settled_at is not null;
   q:=case when saves+kills=0 then 0::numeric
     else (saves-kills)::numeric/(saves+kills) end;
   z:=exp(2*q/0.12::numeric);
   nominal:=round(6000::numeric*n/(n+2::numeric)*(z-1)/(z+1))::integer;
   select * into strict world from public.iid_world where id=1 for update;
   after_hp:=greatest(0,least(1000000,world.hp+nominal));
   applied:=after_hp-world.hp;
   if applied<>0 then
     update public.iid_world set hp=after_hp,version=version+1,updated_at=t where id=1;
   end if;
   insert into public.iid_v2_window_results(slot_start,save_influence,kill_influence,
     battle_count,nominal_hp,applied_hp,hp_after,world_version)
   values(s,saves,kills,n,nominal,applied,after_hp,
     world.version+case when applied<>0 then 1 else 0 end);
   processed:=processed+1;
 end loop;
 return jsonb_build_object('status','OK','processed',processed,'server_now',t);
end $$;
revoke all on function iid_private.process_v2_windows() from public,anon,authenticated;
