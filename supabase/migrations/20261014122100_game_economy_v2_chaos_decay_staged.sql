-- Staged V2 adaptive World Decay and participation-weighted Daily Chaos.
-- No feature flag, scheduler, or pause state changed during this migration.
alter table public.iid_decay_pulses
 add column active_users bigint,
 add column economy_version smallint not null default 1;
alter table public.iid_decay_pulses
 drop constraint iid_decay_pulses_rolled_hp_check,
 drop constraint iid_decay_pulses_applied_hp_check;
alter table public.iid_decay_pulses
 add constraint iid_decay_v2_roll check(
   (economy_version=1 and rolled_hp between 800 and 1000)
   or (economy_version=2 and rolled_hp between 540 and 2750)),
 add constraint iid_decay_v2_applied check(
   applied_hp>=0 and applied_hp<=case when economy_version=1 then 1000 else 2750 end);

create function iid_private.chaos_impact_v2(p_damage bigint,p_recovery bigint,p_quorum integer)
returns integer language plpgsql immutable set search_path='' as $$
declare n numeric; diff numeric; x numeric; magnitude integer;
begin
 if p_damage is null or p_recovery is null or p_quorum is null or
 p_damage<0 or p_recovery<0 or p_quorum<1 then
 raise exception 'INVALID_VOTE_COUNTS';end if;
 n:=p_damage::numeric+p_recovery::numeric;
 if n<p_quorum or p_damage=p_recovery then return 0;end if;
 diff:=abs(p_recovery::numeric-p_damage::numeric)/n;
 x:=(3000+9000*(1-exp(-n/150)))*power(diff,0.6::numeric);
 magnitude:=least(12000,round(x)::integer);
 return case when p_recovery>p_damage then magnitude else -magnitude end;
end $$;
revoke all on function iid_private.chaos_impact_v2(bigint,bigint,integer)
 from public,anon,authenticated;

create or replace function iid_private.process_decay() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.iid_chaos_control; w public.iid_world;
 current_slot bigint; last_slot bigint; i bigint; roll integer;
 new_hp integer; processed integer:=0; t timestamptz:=clock_timestamp();
 v2 boolean; active_users bigint; due_at timestamptz; base_decay integer;
begin
 select v2_enabled into strict v2 from public.iid_economy_control where id=1;
 select * into strict c from public.iid_chaos_control where id=1 for update;
 select * into strict w from public.iid_world where id=1 for update;
 if not c.enabled or not w.enabled or c.decay_anchor_at is null then
   return jsonb_build_object('status','PAUSED','processed',0);
 end if;
 current_slot:=floor(extract(epoch from (t-c.decay_anchor_at))/21600)::bigint;
 if current_slot<1 then return jsonb_build_object('status','WAITING','processed',0); end if;
 select coalesce(max(slot_no),0) into last_slot from public.iid_decay_pulses;
 for i in (last_slot+1)..least(current_slot,last_slot+8) loop
   due_at:=c.decay_anchor_at+i*interval '6 hours';
   if v2 then
     select count(distinct user_id) into active_users from public.iid_battles
     where settled_at>due_at-interval '24 hours' and settled_at<=due_at;
     base_decay:=round(600+1900*least(1::numeric,sqrt(active_users::numeric/200)))::integer;
     roll:=round(base_decay::numeric*(90+iid_private.random_int(21))/100)::integer;
   else
     active_users:=null;
     roll:=800+iid_private.random_int(201);
   end if;
   new_hp:=greatest(0,w.hp-roll);
   update public.iid_world set hp=new_hp,version=version+1,updated_at=t where id=1;
   insert into public.iid_decay_pulses(slot_no,scheduled_at,rolled_hp,applied_hp,hp_after,world_version,active_users,economy_version)
     values(i,due_at,roll,w.hp-new_hp,new_hp,w.version+1,active_users,case when v2 then 2 else 1 end);
   w.hp:=new_hp;w.version:=w.version+1;
   processed:=processed+1;
 end loop;
 return jsonb_build_object('status','OK','processed',processed,'hp',w.hp);
end $$;

create or replace function iid_private.resolve_previous_chaos() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.iid_chaos_control; w public.iid_world;
 d date:=((clock_timestamp() at time zone 'UTC')::date-1);
 rotation smallint; damage_n bigint; recovery_n bigint; total_n bigint;
 winner text; nominal integer:=0; after_hp integer; effect integer;
 recorded jsonb;
begin
 select * into strict c from public.iid_chaos_control where id=1;
 if not c.enabled or c.anchor_utc is null or d<c.anchor_utc then
   return jsonb_build_object('status','PAUSED_OR_NOT_STARTED'); end if;
 insert into public.iid_chaos_days(day_utc,rotation_day)
   values(d,iid_private.chaos_rotation(d,c.anchor_utc))
   on conflict(day_utc) do nothing;
 select rotation_day into strict rotation from public.iid_chaos_days where day_utc=d for update;
 select to_jsonb(r) into recorded from public.iid_chaos_results r where day_utc=d;
 if recorded is not null then return recorded; end if;
 select * into strict w from public.iid_world where id=1 for update;
 if not w.enabled then return jsonb_build_object('status','WORLD_PAUSED');end if;
 select count(*) filter(where choice='damage'),count(*) filter(where choice='recovery')
   into damage_n,recovery_n from public.iid_chaos_votes where day_utc=d;
 total_n:=damage_n+recovery_n;
 if total_n<c.min_votes then winner:='no_quorum';
 elsif damage_n=recovery_n then winner:='tie';
 elsif damage_n>recovery_n then winner:='damage';
 else winner:='recovery'; end if;
 -- Numeric rounding and winner direction are computed atomically from the
 -- CLOSED day's voter ledger, not from the browser.
 nominal:=case when (select v2_enabled from public.iid_economy_control where id=1)
   then iid_private.chaos_impact_v2(damage_n,recovery_n,10)
   else iid_private.chaos_impact(damage_n,recovery_n,c.min_votes) end;
 after_hp:=greatest(0,least(1000000,w.hp+nominal));
 effect:=after_hp-w.hp;
 if nominal<>0 then
  update public.iid_world set hp=after_hp,version=version+1,updated_at=clock_timestamp() where id=1;
 end if;
 update public.iid_chaos_days set closed=true where day_utc=d;
 insert into public.iid_chaos_results(day_utc,rotation_day,damage_votes,recovery_votes,
   winner,nominal_hp,applied_hp,hp_after,world_version)
 values(d,rotation,damage_n,recovery_n,winner,nominal,effect,after_hp,
   case when nominal<>0 then w.version+1 else w.version end)
 returning to_jsonb(iid_chaos_results) into recorded;
 return recorded;
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
  'projected_impact_hp',case when (select v2_enabled from public.iid_economy_control where id=1)
   then iid_private.chaos_impact_v2(votes_d,votes_r,10)
   else iid_private.chaos_impact(votes_d,votes_r,c.min_votes) end,
  'maximum_impact_hp',12000,'formula_version',case when (select v2_enabled from public.iid_economy_control where id=1) then 'HYBRID_V2' else 'HYBRID_V1' end,
  'closes_at',((d+1)::timestamp at time zone 'UTC'),
  'next_decay_at',next_pulse,'last_decay',last_pulse,'latest_result',last_result,
  'min_votes',case when (select v2_enabled from public.iid_economy_control where id=1) then 10 else c.min_votes end,'preview',not c.enabled
 );
end $$;
