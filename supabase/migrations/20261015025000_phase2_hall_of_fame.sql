-- Phase 2: read-only global Hall of Fame for individually verified battles.
-- Aggregates are transactional and version-separated; no gameplay/HP changes.
create table public.iid_hof_totals (
 user_id uuid primary key references public.iid_profiles(user_id) on delete cascade,
 v1_save_power bigint not null default 0 check (v1_save_power>=0),
 v1_kill_power bigint not null default 0 check (v1_kill_power>=0),
 v2_save_influence bigint not null default 0 check (v2_save_influence>=0),
 v2_kill_influence bigint not null default 0 check (v2_kill_influence>=0)
);
alter table public.iid_hof_totals enable row level security;
revoke all on table public.iid_hof_totals from public,anon,authenticated;
create index iid_hof_v1_save_rank on public.iid_hof_totals(v1_save_power desc,user_id) where v1_save_power>0;
create index iid_hof_v1_kill_rank on public.iid_hof_totals(v1_kill_power desc,user_id) where v1_kill_power>0;
create index iid_hof_v2_save_rank on public.iid_hof_totals(v2_save_influence desc,user_id) where v2_save_influence>0;
create index iid_hof_v2_kill_rank on public.iid_hof_totals(v2_kill_influence desc,user_id) where v2_kill_influence>0;

create function iid_private.hof_record_settlement() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 v_power bigint;
begin
 -- The trigger only fires on the first transition to a verified settlement.
 v_power:=case when new.engine_version=2 then new.war_influence else new.power end;
 if v_power is null or v_power<=0 then return new; end if;
 insert into public.iid_hof_totals(user_id,v1_save_power,v1_kill_power,v2_save_influence,v2_kill_influence)
 values(new.user_id,
  case when new.engine_version=1 and new.action='HEAL' then v_power else 0 end,
  case when new.engine_version=1 and new.action='KILL' then v_power else 0 end,
  case when new.engine_version=2 and new.action='HEAL' then v_power else 0 end,
  case when new.engine_version=2 and new.action='KILL' then v_power else 0 end)
 on conflict(user_id) do update set
  v1_save_power=public.iid_hof_totals.v1_save_power+excluded.v1_save_power,
  v1_kill_power=public.iid_hof_totals.v1_kill_power+excluded.v1_kill_power,
  v2_save_influence=public.iid_hof_totals.v2_save_influence+excluded.v2_save_influence,
  v2_kill_influence=public.iid_hof_totals.v2_kill_influence+excluded.v2_kill_influence;
 return new;
end $$;
revoke all on function iid_private.hof_record_settlement() from public,anon,authenticated;

-- Block new settlements for a moment to avoid racing the one-time backfill.
lock table public.iid_battles in share row exclusive mode;
create trigger iid_hof_verified_settlement
after update of settled_at on public.iid_battles
for each row
when (old.settled_at is null and new.settled_at is not null)
execute function iid_private.hof_record_settlement();

insert into public.iid_hof_totals(user_id,v1_save_power,v1_kill_power,v2_save_influence,v2_kill_influence)
select user_id,
 coalesce(sum(power::bigint) filter(where engine_version=1 and action='HEAL'),0),
 coalesce(sum(power::bigint) filter(where engine_version=1 and action='KILL'),0),
 coalesce(sum(war_influence::bigint) filter(where engine_version=2 and action='HEAL'),0),
 coalesce(sum(war_influence::bigint) filter(where engine_version=2 and action='KILL'),0)
from public.iid_battles where settled_at is not null group by user_id
on conflict(user_id) do update set
 v1_save_power=excluded.v1_save_power,
 v1_kill_power=excluded.v1_kill_power,
 v2_save_influence=excluded.v2_save_influence,
 v2_kill_influence=excluded.v2_kill_influence;

-- Private query helper: the only possible score columns are from this whitelist.
-- Top rows expose ONLY rank, nickname and nationality/flag (not player UUID).
create function iid_private.hof_side(p_user uuid,p_column text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 top_rows jsonb; self_score bigint; self_rank bigint; self_profile public.iid_profiles;
begin
 if p_column not in ('v1_save_power','v1_kill_power','v2_save_influence','v2_kill_influence')
 then raise exception 'INVALID_RANKING_COLUMN'; end if;
 execute format($query$
  select coalesce(jsonb_agg(
    jsonb_build_object('rank',z.rank,'nickname',z.nickname,
     'country_code',z.country_code,'custom_flag',z.custom_flag,'is_you',z.user_id=$1)
    order by z.rank),'[]'::jsonb)
  from (
    select row_number() over(order by t.%1$I desc,t.user_id) as rank,
       t.user_id,p.nickname,p.country_code,p.custom_flag
    from public.iid_hof_totals t
    join public.iid_profiles p on p.user_id=t.user_id
    where t.%1$I>0
    order by t.%1$I desc,t.user_id
    limit 10
  ) z
 $query$,p_column) into top_rows using p_user;
 select * into strict self_profile from public.iid_profiles where user_id=p_user;
 execute format('select %I from public.iid_hof_totals where user_id=$1',p_column)
   into self_score using p_user;
 if coalesce(self_score,0)>0 then
   execute format(
     'select count(*)+1 from public.iid_hof_totals where %1$I>$1 or (%1$I=$1 and user_id<$2)',
     p_column)
     into self_rank using self_score,p_user;
 end if;
 return jsonb_build_object(
  'top',top_rows,
  'self',jsonb_build_object('rank',self_rank,'qualified',self_rank is not null,
   'in_top10',coalesce(self_rank<=10,false),
   'nickname',self_profile.nickname,'country_code',self_profile.country_code,
   'custom_flag',self_profile.custom_flag));
end $$;
revoke all on function iid_private.hof_side(uuid,text) from public,anon,authenticated;

create function iid_private.hall_of_fame() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; active_v2 boolean;
begin
 u:=iid_private.require_player();
 select v2_enabled into strict active_v2 from public.iid_economy_control where id=1;
 return jsonb_build_object('engine_version',case when active_v2 then 2 else 1 end,
  'score_unit',case when active_v2 then 'WAR INFLUENCE' else 'PERSONAL POWER' end,
  'period','ALL TIME',
  'save',iid_private.hof_side(u,case when active_v2 then 'v2_save_influence' else 'v1_save_power' end),
  'kill',iid_private.hof_side(u,case when active_v2 then 'v2_kill_influence' else 'v1_kill_power' end));
end $$;
revoke all on function iid_private.hall_of_fame() from public,anon,authenticated;
grant execute on function iid_private.hall_of_fame() to authenticated;

create function public.iid_hall_of_fame() returns jsonb
language sql security invoker set search_path='' as $$
 select iid_private.hall_of_fame()
$$;
revoke all on function public.iid_hall_of_fame() from public,anon,authenticated;
grant execute on function public.iid_hall_of_fame() to authenticated;
