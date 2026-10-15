-- NULL NOT IN (...) is UNKNOWN, so reject NULL explicitly before replay/resume.
create or replace function iid_private.start_battle(p_request_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
   t+case when v2 then interval '14 seconds' else interval '23 seconds' end
 from public.iid_profiles where user_id=u returning * into b;
 return to_jsonb(b)||jsonb_build_object('server_now',clock_timestamp());
end $$;
