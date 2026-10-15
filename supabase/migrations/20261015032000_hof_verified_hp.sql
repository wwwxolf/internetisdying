-- Only actual World HP applied by a verified V1 settlement is counted as player HP.
-- V2 individual war influence is NOT World HP: V2 war windows settle as a group.
-- Preserve existing ranking (V1 Personal Power or V2 War Influence) and world rules.
lock table public.iid_battles in share row exclusive mode;

alter table public.iid_hof_totals
  add column v1_save_hp bigint not null default 0 check (v1_save_hp>=0),
  add column v1_kill_hp bigint not null default 0 check (v1_kill_hp>=0);

update public.iid_hof_totals h set
 v1_save_hp=coalesce((
  select sum(greatest(b.applied_hp,0)::bigint)
  from public.iid_battles b where b.user_id=h.user_id and b.settled_at is not null
    and b.engine_version=1 and b.action='HEAL'),0),
 v1_kill_hp=coalesce((
  select sum(greatest(b.applied_hp,0)::bigint)
  from public.iid_battles b where b.user_id=h.user_id and b.settled_at is not null
    and b.engine_version=1 and b.action='KILL'),0);

-- Same trigger transition as Phase 2: only first successful settlement accrues.
create or replace function iid_private.hof_record_settlement() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_power bigint;
declare v_hp bigint;
begin
 v_power:=case when new.engine_version=2 then new.war_influence else new.power end;
 if v_power is null or v_power<=0 then return new; end if;
 v_hp:=case when new.engine_version=1 then greatest(coalesce(new.applied_hp,0),0)::bigint else 0 end;
 insert into public.iid_hof_totals(
  user_id,v1_save_power,v1_kill_power,v2_save_influence,v2_kill_influence,v1_save_hp,v1_kill_hp)
 values(new.user_id,
  case when new.engine_version=1 and new.action='HEAL' then v_power else 0 end,
  case when new.engine_version=1 and new.action='KILL' then v_power else 0 end,
  case when new.engine_version=2 and new.action='HEAL' then v_power else 0 end,
  case when new.engine_version=2 and new.action='KILL' then v_power else 0 end,
  case when new.engine_version=1 and new.action='HEAL' then v_hp else 0 end,
  case when new.engine_version=1 and new.action='KILL' then v_hp else 0 end)
 on conflict(user_id) do update set
  v1_save_power=public.iid_hof_totals.v1_save_power+excluded.v1_save_power,
  v1_kill_power=public.iid_hof_totals.v1_kill_power+excluded.v1_kill_power,
  v2_save_influence=public.iid_hof_totals.v2_save_influence+excluded.v2_save_influence,
  v2_kill_influence=public.iid_hof_totals.v2_kill_influence+excluded.v2_kill_influence,
  v1_save_hp=public.iid_hof_totals.v1_save_hp+excluded.v1_save_hp,
  v1_kill_hp=public.iid_hof_totals.v1_kill_hp+excluded.v1_kill_hp;
 return new;
end $$;
revoke all on function iid_private.hof_record_settlement() from public,anon,authenticated;

-- Preserve current ranking and privacy. Attach verified HP to each row and aggregate.
create or replace function iid_private.hof_side(p_user uuid,p_column text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 top_rows jsonb; self_score bigint; self_hp bigint; self_rank bigint;
 total_hp bigint; self_profile public.iid_profiles; p_hp_column text;
begin
 if p_column not in ('v1_save_power','v1_kill_power','v2_save_influence','v2_kill_influence')
 then raise exception 'INVALID_RANKING_COLUMN'; end if;
 p_hp_column:=case when p_column in ('v1_save_power','v2_save_influence')
   then 'v1_save_hp' else 'v1_kill_hp' end;
 execute format($query$
  select coalesce(jsonb_agg(
    jsonb_build_object('rank',z.rank,'nickname',z.nickname,
      'country_code',z.country_code,'custom_flag',z.custom_flag,
      'is_you',z.user_id=$1,'score',z.score,'hp',z.hp)
    order by z.rank),'[]'::jsonb)
  from (
    select row_number() over(order by t.%1$I desc,t.user_id) as rank,
      t.user_id,t.%1$I as score,t.%2$I as hp,p.nickname,p.country_code,p.custom_flag
    from public.iid_hof_totals t
    join public.iid_profiles p on p.user_id=t.user_id
    where t.%1$I>0
    order by t.%1$I desc,t.user_id
    limit 10
  ) z
 $query$,p_column,p_hp_column) into top_rows using p_user;
 select * into strict self_profile from public.iid_profiles where user_id=p_user;
 execute format('select %1$I,%2$I from public.iid_hof_totals where user_id=$1',p_column,p_hp_column)
   into self_score,self_hp using p_user;
 if coalesce(self_score,0)>0 then
   execute format(
     'select count(*)+1 from public.iid_hof_totals where %1$I>$1 or (%1$I=$1 and user_id<$2)',
     p_column) into self_rank using self_score,p_user;
 end if;
 execute format('select coalesce(sum(%I),0)::bigint from public.iid_hof_totals',p_hp_column)
   into total_hp;
 return jsonb_build_object(
  'top',top_rows,'total_hp',total_hp,
  'self',jsonb_build_object('rank',self_rank,'qualified',self_rank is not null,
   'in_top10',coalesce(self_rank<=10,false),'score',coalesce(self_score,0),
   'hp',coalesce(self_hp,0),'nickname',self_profile.nickname,
   'country_code',self_profile.country_code,'custom_flag',self_profile.custom_flag));
end $$;
revoke all on function iid_private.hof_side(uuid,text) from public,anon,authenticated;
