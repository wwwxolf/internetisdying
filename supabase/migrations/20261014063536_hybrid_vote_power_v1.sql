-- Hybrid Vote Power V1 • additive migration • does not enable voting, decay or battle.
-- Existing results are retained; new result constraint permits scaled signed impact.
alter table public.iid_chaos_results
  drop constraint if exists iid_chaos_results_nominal_hp_check;
alter table public.iid_chaos_results
  add constraint iid_chaos_results_nominal_hp_check
  check(nominal_hp between -12000 and 12000);

-- Retire legacy fixed per-event HP fields. Events keep semantic direction;
-- actual HP is calculated from daily ledger totals at settlement.
alter table public.iid_chaos_catalog
  drop constraint if exists iid_chaos_catalog_damage_hp_check;
alter table public.iid_chaos_catalog
  drop constraint if exists iid_chaos_catalog_recovery_hp_check;
update public.iid_chaos_catalog set damage_hp=0,recovery_hp=0
  where damage_hp<>0 or recovery_hp<>0;
comment on column public.iid_chaos_catalog.damage_hp is 'Legacy fixed HP retired: 0. Actual impact uses iid_private.chaos_impact.';
comment on column public.iid_chaos_catalog.recovery_hp is 'Legacy fixed HP retired: 0. Actual impact uses iid_private.chaos_impact.';
alter table public.iid_chaos_catalog
  add constraint iid_chaos_catalog_damage_hp_check check(damage_hp=0);
alter table public.iid_chaos_catalog
  add constraint iid_chaos_catalog_recovery_hp_check check(recovery_hp=0);


-- Hybrid Vote Power V1:
-- 12000 × N/(N+160) × (abs(HEAL−KILL)/N)^0.7
-- Heavy turnout raises impact sublinearly; narrow margins reduce it.
-- Numeric exponentiation prevents premature integer division and numeric overflow
-- is bounded by the <=12000 theoretical maximum.
create function iid_private.chaos_impact(p_damage bigint,p_recovery bigint,p_quorum integer)
returns integer language plpgsql immutable set search_path='' as $$
declare n numeric; diff numeric; magnitude integer;
begin
 if p_damage is null or p_recovery is null or p_quorum is null
    or p_damage<0 or p_recovery<0 or p_quorum<1 then
   raise exception 'INVALID_VOTE_COUNTS'; end if;
 n:=p_damage::numeric+p_recovery::numeric;
 if n<p_quorum or p_damage=p_recovery then return 0; end if;
 diff:=abs(p_recovery::numeric-p_damage::numeric);
 magnitude:=least(12000,round(12000::numeric*n/(n+160::numeric)
                              * power(diff/n,0.7::numeric))::integer);
 if p_recovery>p_damage then return magnitude; end if;
 return -magnitude;
end $$;
revoke all on function iid_private.chaos_impact(bigint,bigint,integer)
  from public,anon,authenticated;

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
   select c.decay_anchor_at + (coalesce(max(slot_no),0)+1)*interval '3 hours'
   into next_pulse from public.iid_decay_pulses;
 end if;
 return jsonb_build_object(
  'server_now',t,'enabled',c.enabled and (select enabled from public.iid_world where id=1),
  'day_utc',d,'day_rotation',rotation,
  'event',(select to_jsonb(e) from public.iid_chaos_catalog e where e.day_rotation=rotation),
  'voted_for',vote_choice,'damage_votes',votes_d,'recovery_votes',votes_r,
  'projected_impact_hp',iid_private.chaos_impact(votes_d,votes_r,c.min_votes),
  'maximum_impact_hp',12000,'formula_version','HYBRID_V1',
  'closes_at',((d+1)::timestamp at time zone 'UTC'),
  'next_decay_at',next_pulse,'last_decay',last_pulse,'latest_result',last_result,
  'min_votes',c.min_votes,'preview',not c.enabled
 );
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
 nominal:=iid_private.chaos_impact(damage_n,recovery_n,c.min_votes);
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

-- Private calculation remains available only through checked, definer-owned
-- status and scheduler functions. No untrusted users can settle or adjust HP.
