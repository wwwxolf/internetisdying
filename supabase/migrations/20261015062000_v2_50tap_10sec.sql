-- V2 50 taps / 10s active, 2s ready, capped tier bonus +6%.
-- V1 remains unchanged. All functions are preserved and updated from their live definitions.
-- Apply transactionally before deploying the version-bumped browser bundle.
-- Activation safety: never change a battle's runtime contract mid-flight.
do $safety$
begin
 if exists(select 1 from public.iid_battles where engine_version=2 and settled_at is null)
 then raise exception 'V2_TAP_UPGRADE_PENDING_BATTLES'; end if;
end $safety$;

-- V2 tap tiers: all tap counts are server-verified; no client-provided bonuses.
create or replace function iid_private.v2_tap_bonus(p_taps integer)
returns integer language sql immutable strict set search_path='' as $$
select case
 when p_taps>=50 then 6
 when p_taps>=42 then 5
 when p_taps>=34 then 4
 when p_taps>=25 then 3
 when p_taps>=17 then 2
 when p_taps>=9 then 1
 else 0 end
$$;
revoke all on function iid_private.v2_tap_bonus(integer) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION iid_private.start_battle(p_request_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=iid_private.require_player(); b public.iid_battles;
 t timestamptz; day_utc date; slot_no integer; v2 boolean;
begin
 if p_request_id is null or p_action is null or p_action not in ('HEAL','KILL')
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
   t+case when v2 then interval '12 seconds' else interval '23 seconds' end
 from public.iid_profiles where user_id=u returning * into b;
 return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp());
end $function$;

CREATE OR REPLACE FUNCTION iid_private.tap_battle(p_battle_id uuid, p_seq integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=iid_private.require_player(); b public.iid_battles; t timestamptz; max_n integer;
begin
 select * into b from public.iid_battles where id=p_battle_id and user_id=u for update;
 if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
 max_n:=case when b.engine_version=2 then 50 else 50 end;
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
end $function$;

CREATE OR REPLACE FUNCTION iid_private.tap_batch(p_battle_id uuid, p_total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=iid_private.require_player(); b public.iid_battles;
 t timestamptz; delta integer; max_n integer;
begin
 select * into b from public.iid_battles where id=p_battle_id and user_id=u for update;
 if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
 max_n:=case when b.engine_version=2 then 50 else 50 end;
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
end $function$;

CREATE OR REPLACE FUNCTION iid_private.settle_v2_due(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 v_bonus:=iid_private.v2_tap_bonus(b.counted_taps);
 v_power:=round(v_base::numeric*v_crit/100*(100+v_bonus)/100)::integer;
 v_influence:=round(100*sqrt(v_power::numeric/400))::integer;
 select * into strict w from public.iid_world where id=1;
 update public.iid_battles set settled_at=clock_timestamp(),base=v_base,
  critical=v_crit,bonus=v_bonus,power=v_power,war_influence=v_influence,
  hp_before=w.hp,hp_after=w.hp,applied_hp=0,world_version=w.version
 where id=b.id returning * into b;
 return to_jsonb(b);
end $function$;

CREATE OR REPLACE FUNCTION iid_private.economy_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 return jsonb_build_object('enabled',flag,'duration_seconds',10,'ready_seconds',2,
  'max_taps',50,'save_influence',a,'kill_influence',b,'battle_count',n,
  'window_start',s,'latest_window',recent,'server_now',t);
end $function$;
