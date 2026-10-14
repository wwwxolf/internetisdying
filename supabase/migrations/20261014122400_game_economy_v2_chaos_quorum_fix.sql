-- Correct V2 quorum consistency (10 votes) without changing V1 quorum (20).
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
 if total_n<(case when (select v2_enabled from public.iid_economy_control where id=1) then 10 else c.min_votes end) then winner:='no_quorum';
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
