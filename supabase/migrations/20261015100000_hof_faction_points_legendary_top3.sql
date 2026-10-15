-- Phase 3: 30-day HALL OF FAME cycles and LEGENDARY TOP 3 only.
-- This is NOT V3 World Epoch gameplay. World HP, battle rewards, RNG and timers unchanged.
-- The UTC anchor may be aligned with real World Epoch when V3 is approved.
create table public.iid_hof_season_totals(
 season_no integer not null check(season_no>0),
 user_id uuid not null references public.iid_profiles(user_id) on delete cascade,
 save_points bigint not null default 0 check(save_points>=0),
 kill_points bigint not null default 0 check(kill_points>=0),
 best_power integer not null default 0 check(best_power>=0),
 best_action text check(best_action in ('HEAL','KILL')),
 best_battle uuid,
 best_at timestamptz,
 primary key(season_no,user_id),
 constraint iid_hof_best_valid check (
  (best_power=0 and best_action is null and best_battle is null and best_at is null)
  or (best_power>0 and best_action is not null and best_battle is not null and best_at is not null)
 )
);
alter table public.iid_hof_season_totals enable row level security;
revoke all on table public.iid_hof_season_totals from public,anon,authenticated;
create index iid_hof_season_save on public.iid_hof_season_totals(season_no,save_points desc,user_id) where save_points>0;
create index iid_hof_season_kill on public.iid_hof_season_totals(season_no,kill_points desc,user_id) where kill_points>0;
create index iid_hof_season_legendary on public.iid_hof_season_totals(season_no,best_power desc,best_at,user_id) where best_power>0;

-- In UTC, season #1 starts 2026-10-15 00:00 and runs for exactly 30*24 hours.
-- Earlier battles remain in historical ledgers, but are not mislabeled as new-season feats.
create function iid_private.hof_season(p_time timestamptz) returns integer
language sql immutable strict set search_path='' as $$
 select case when p_time < timestamptz '2026-10-15 00:00:00+00' then 0
 else 1+floor(extract(epoch from (p_time-timestamptz '2026-10-15 00:00:00+00'))/2592000)::integer end
$$;
revoke all on function iid_private.hof_season(timestamptz) from public,anon,authenticated;

-- Settle once per battle. A legendary record is the player's single strongest
-- VERIFIED Personal Power (not World HP and not cumulative faction points).
create function iid_private.hof_record_season() returns trigger
language plpgsql security definer set search_path='' as $$
declare s integer; good_power integer;
begin
 if new.engine_version<>2 or new.war_influence is null or new.war_influence<=0 then return new;end if;
 s:=iid_private.hof_season(new.created_at);
 if s<1 then return new;end if;
 good_power:=greatest(0,coalesce(new.power,0));
 insert into public.iid_hof_season_totals
  (season_no,user_id,save_points,kill_points,best_power,best_action,best_battle,best_at)
 values(s,new.user_id,
  case when new.action='HEAL' then new.war_influence else 0 end,
  case when new.action='KILL' then new.war_influence else 0 end,
  good_power,case when good_power>0 then new.action end,
  case when good_power>0 then new.id end,
  case when good_power>0 then new.settled_at end)
 on conflict(season_no,user_id) do update set
 save_points=public.iid_hof_season_totals.save_points+excluded.save_points,
 kill_points=public.iid_hof_season_totals.kill_points+excluded.kill_points,
 best_action=case when excluded.best_power>public.iid_hof_season_totals.best_power then excluded.best_action else public.iid_hof_season_totals.best_action end,
 best_battle=case when excluded.best_power>public.iid_hof_season_totals.best_power then excluded.best_battle else public.iid_hof_season_totals.best_battle end,
 best_at=case when excluded.best_power>public.iid_hof_season_totals.best_power then excluded.best_at else public.iid_hof_season_totals.best_at end,
 best_power=greatest(public.iid_hof_season_totals.best_power,excluded.best_power);
 return new;
end $$;
revoke all on function iid_private.hof_record_season() from public,anon,authenticated;

-- Prevent a settlement/backfill race; no world ledger is modified.
lock table public.iid_battles in share row exclusive mode;
create trigger iid_hof_season_verified_settlement
after update of settled_at on public.iid_battles
for each row when(old.settled_at is null and new.settled_at is not null)
execute function iid_private.hof_record_season();

-- One-time backfill: include only genuinely settled V2 battles in valid seasons.
with season_battles as(
 select b.*,iid_private.hof_season(b.created_at) as sn
 from public.iid_battles b
 where b.engine_version=2 and b.settled_at is not null and b.war_influence>0
), aggregates as(
 select sn as season_no,user_id,
  coalesce(sum(war_influence::bigint) filter(where action='HEAL'),0) as save_points,
  coalesce(sum(war_influence::bigint) filter(where action='KILL'),0) as kill_points
 from season_battles where sn>0 group by sn,user_id
), best as(
 select sn as season_no,user_id,power,id,action,settled_at,
 row_number() over(partition by sn,user_id order by power desc,settled_at asc,id asc) as rn
 from season_battles where sn>0 and power>0
)
insert into public.iid_hof_season_totals
 (season_no,user_id,save_points,kill_points,best_power,best_action,best_battle,best_at)
select a.season_no,a.user_id,a.save_points,a.kill_points,coalesce(b.power,0),
 b.action,b.id,b.settled_at
from aggregates a left join best b on b.season_no=a.season_no and b.user_id=a.user_id and b.rn=1
on conflict(season_no,user_id) do nothing;

-- Querying current season visits at most one row per player rather than all battle events.
create function iid_private.hof_season_side(p_user uuid,p_season integer,p_side text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c text; top_rows jsonb; self_score bigint; self_rank bigint;
        self_profile public.iid_profiles; total_score bigint;
begin
 if p_side not in ('save','kill') then raise exception 'INVALID_HOF_SIDE';end if;
 c:=case when p_side='save' then 'save_points' else 'kill_points' end;
 execute format($query$
 select coalesce(jsonb_agg(jsonb_build_object('rank',z.rank,'nickname',z.nickname,
   'country_code',z.country_code,'custom_flag',z.custom_flag,
   'is_you',z.user_id=$1,'score',z.score) order by z.rank),'[]'::jsonb)
 from(select row_number() over(order by t.%1$I desc,t.user_id) as rank,
  t.user_id,t.%1$I as score,p.nickname,p.country_code,p.custom_flag
  from public.iid_hof_season_totals t
  join public.iid_profiles p on p.user_id=t.user_id
  where t.season_no=$2 and t.%1$I>0
  order by t.%1$I desc,t.user_id limit 10) z
 $query$,c) into top_rows using p_user,p_season;
 execute format('select %I from public.iid_hof_season_totals where season_no=$1 and user_id=$2',c)
  into self_score using p_season,p_user;
 if coalesce(self_score,0)>0 then
  execute format('select count(*)+1 from public.iid_hof_season_totals where season_no=$1 and (%1$I>$2 or (%1$I=$2 and user_id<$3))',c)
  into self_rank using p_season,self_score,p_user;
 end if;
 execute format('select coalesce(sum(%I),0) from public.iid_hof_season_totals where season_no=$1',c)
  into total_score using p_season;
 select * into strict self_profile from public.iid_profiles where user_id=p_user;
 return jsonb_build_object('top',top_rows,'total_score',total_score,
  'self',jsonb_build_object('rank',self_rank,'qualified',self_rank is not null,
   'in_top10',coalesce(self_rank<=10,false),'score',coalesce(self_score,0),
   'nickname',self_profile.nickname,'country_code',self_profile.country_code,
   'custom_flag',self_profile.custom_flag));
end $$;
revoke all on function iid_private.hof_season_side(uuid,integer,text) from public,anon,authenticated;

create or replace function iid_private.hall_of_fame() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=iid_private.require_player(); active_v2 boolean;
 s integer; starts timestamptz; legend jsonb;
 legacy_save jsonb;legacy_kill jsonb;save_total bigint;kill_total bigint;
begin
 select v2_enabled into strict active_v2 from public.iid_economy_control where id=1;
 if not active_v2 then
  legacy_save:=iid_private.hof_side(u,'v1_save_power');
  legacy_kill:=iid_private.hof_side(u,'v1_kill_power');
  select coalesce(sum(v1_save_power),0),coalesce(sum(v1_kill_power),0)
   into save_total,kill_total from public.iid_hof_totals;
  return jsonb_build_object('engine_version',1,'score_unit','PERSONAL POWER',
   'period','ALL TIME','legendary','[]'::jsonb,
   'save',legacy_save||jsonb_build_object('total_score',save_total),
   'kill',legacy_kill||jsonb_build_object('total_score',kill_total));
 end if;
 s:=iid_private.hof_season(clock_timestamp());
 starts:=timestamptz '2026-10-15 00:00:00+00'+(greatest(s,1)-1)*interval '30 days';
 select coalesce(jsonb_agg(jsonb_build_object(
  'rank',q.rank,'nickname',q.nickname,'country_code',q.country_code,
  'custom_flag',q.custom_flag,'is_you',q.user_id=u,
  'power',q.best_power,'action',q.best_action,'at',q.best_at)
  order by q.rank),'[]'::jsonb)
 into legend
 from(
  select row_number() over(order by t.best_power desc,t.best_at,t.user_id) as rank,
  t.user_id,t.best_power,t.best_action,t.best_at,p.nickname,p.country_code,p.custom_flag
  from public.iid_hof_season_totals t
  join public.iid_profiles p on p.user_id=t.user_id
  where t.season_no=s and t.best_power>0
  order by t.best_power desc,t.best_at,t.user_id limit 3
 ) q;
 return jsonb_build_object('engine_version',2,'score_unit','FACTION POINTS',
  'period','30-DAY LEADERBOARD CYCLE','season',jsonb_build_object(
   'number',s,'starts_at',starts,'ends_at',starts+interval '30 days'),
  'legendary',legend,
  'save',iid_private.hof_season_side(u,s,'save'),
  'kill',iid_private.hof_season_side(u,s,'kill'));
end $$;
revoke all on function iid_private.hall_of_fame() from public,anon,authenticated;
grant execute on function iid_private.hall_of_fame() to authenticated;

-- Developer reset must clear the new seasonal aggregates too, but leave auth/profile intact.
create or replace function public.iid_developer_reset(p_confirm text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid;
 current_hp integer;
 old_battles integer;
begin
 -- Real Google session + current profile, no reliance on UI or JWT user_metadata.
 u:=iid_private.require_player();
 if not exists(select 1 from iid_private.iid_developer_operators where user_id=u)
 then raise exception 'DEVELOPER_ONLY' using errcode='42501'; end if;
 if p_confirm is distinct from 'RESET WORLD_001'
 then raise exception 'RESET_CONFIRMATION_REQUIRED' using errcode='22023';end if;
 perform set_config('lock_timeout','3000',true);
 -- Fail closed if additional accounts exist; never wipe another person's progress.
 if (select count(*) from auth.users where deleted_at is null)<>1
  or (select count(*) from public.iid_profiles)<>1
 then raise exception 'RESET_DISABLED_MULTIPLAYER' using errcode='42501'; end if;
 -- Serialize against live battle writes and scheduled V2 window settlements.
 lock table public.iid_battles in access exclusive mode;
 lock table public.iid_v2_window_results in access exclusive mode;
 lock table public.iid_v2_live_buckets in access exclusive mode;
 if (select count(*) from auth.users where deleted_at is null)<>1
  or (select count(*) from public.iid_profiles)<>1
 then raise exception 'RESET_DISABLED_MULTIPLAYER' using errcode='42501'; end if;
 select hp into strict current_hp from public.iid_world where id=1 for update;
 select count(*) into old_battles from public.iid_battles;
 -- Keep Google auth, developer authorization and character identity.
 -- Clear all gameplay windows, momentum, rankings and secondary event records.
 delete from public.iid_chaos_votes;
 delete from public.iid_chaos_results;
 delete from public.iid_chaos_days;
 delete from public.iid_decay_pulses;
 delete from public.iid_share_cards;
 delete from public.iid_player_presence;
 delete from public.iid_battles;
 delete from public.iid_hof_totals;
 delete from public.iid_hof_season_totals;
 delete from public.iid_v2_window_results;
 delete from public.iid_v2_live_buckets;
 update public.iid_world set hp=500000,version=0,updated_at=clock_timestamp() where id=1;
 -- Existing 4h windows must not be replayed after a developer reset.
 update public.iid_economy_control set activated_at=clock_timestamp() where id=1 and v2_enabled=true;
 if (select hp from public.iid_world where id=1)<>500000
  or exists(select 1 from public.iid_battles)
  or exists(select 1 from public.iid_hof_totals)
  or exists(select 1 from public.iid_hof_season_totals)
  or exists(select 1 from public.iid_v2_live_buckets)
  or exists(select 1 from public.iid_v2_window_results)
 then raise exception 'RESET_POSTCONDITION_FAILED';end if;
 return jsonb_build_object('ok',true,'world_hp',500000,'previous_hp',current_hp,
  'deleted_battles',old_battles,'player_identity_kept',true);
end $$;
revoke all on function public.iid_developer_reset(text) from public,anon,authenticated;
grant execute on function public.iid_developer_reset(text) to authenticated;

