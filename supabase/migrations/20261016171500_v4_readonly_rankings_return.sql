-- V4-only presentation APIs. Never modify/activate legacy world or V4 epoch.
-- The ledger distinguishes FACTION POWER (contributions) from APPLIED WORLD HP.
-- Bound leaderboard and report reads to the currently published epoch.
create index v4_save_leaders on iid_v4.player_totals(epoch_id,save_power desc,user_id) where save_power>0;
create index v4_kill_leaders on iid_v4.player_totals(epoch_id,kill_power desc,user_id) where kill_power>0;
create index v4_verified_personal_best on iid_v4.attempts(epoch_id,user_id,power desc,completed_at,id) where completed_at is not null;
create index v4_report_settled on iid_v4.events(epoch_id,settled_at) where settled_at is not null;
create index v4_report_completed on iid_v4.attempts(epoch_id,completed_at) where completed_at is not null;
create table iid_v4.return_cursors(
  epoch_id uuid not null references iid_v4.epochs(id),
  user_id uuid not null references auth.users(id),
  opened_at timestamptz not null,
  visits integer not null default 0 check(visits >= 0),
  primary key(epoch_id,user_id)
);
alter table iid_v4.return_cursors enable row level security;
revoke all on iid_v4.return_cursors from public,anon,authenticated;

create function iid_v4.ranking_side(p_epoch uuid,p_user uuid,p_side text)
returns jsonb language sql stable security definer set search_path='' as $$
with scores as (
  select t.user_id,case when p_side='SAVE' then t.save_power else t.kill_power end as points
  from iid_v4.player_totals t where t.epoch_id=p_epoch
), ranked as (
  select user_id,points,
  row_number() over(order by points desc,user_id) as position
  from scores where points>0
), leaders as (
  select jsonb_agg(
   jsonb_build_object('rank',r.position,'nickname',p.nickname,
    'country_code',p.country_code,'custom_flag',p.custom_flag,
    'score',r.points,'is_you',r.user_id=p_user)
   order by r.position
  ) as rows
  from ranked r join public.iid_profiles p on p.user_id=r.user_id where r.position<=10
)
select jsonb_build_object(
  'total_score',coalesce((select sum(points) from scores),0),
  'top',coalesce((select rows from leaders),'[]'::jsonb),
  'self',coalesce(
   (select jsonb_build_object('rank',r.position,'nickname',p.nickname,
     'country_code',p.country_code,'custom_flag',p.custom_flag,
     'score',r.points,'qualified',true,'in_top10',r.position<=10,'is_you',true)
    from ranked r join public.iid_profiles p on p.user_id=r.user_id
    where r.user_id=p_user),
   (select jsonb_build_object('rank',null,'nickname',p.nickname,
     'country_code',p.country_code,'custom_flag',p.custom_flag,
     'score',0,'qualified',false,'in_top10',false,'is_you',true)
    from public.iid_profiles p where p.user_id=p_user)
  )
)
$$;
revoke all on function iid_v4.ranking_side(uuid,uuid,text) from public,anon,authenticated;

create function iid_v4.hall_of_fame() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 u uuid:=iid_private.require_player();e iid_v4.epochs;l jsonb;p jsonb;
begin
 select * into e from iid_v4.epochs where published order by starts_at desc limit 1;
 if not found then return null;end if;
 select coalesce(jsonb_agg(
   jsonb_build_object('nickname',z.nickname,'country_code',z.country_code,
     'custom_flag',z.custom_flag,'power',z.power,'action',z.action,
     'is_you',z.user_id=u)
   order by z.power desc,z.completed_at,z.user_id
 ),'[]'::jsonb) into l
 from (
   select * from (
     select distinct on (a.user_id) a.user_id,p.nickname,p.country_code,
       p.custom_flag,a.power,a.action,a.completed_at
     from iid_v4.attempts a
     join public.iid_profiles p on p.user_id=a.user_id
     where a.epoch_id=e.id and a.completed_at is not null
     order by a.user_id,a.power desc,a.completed_at,a.id
   ) best order by power desc,completed_at,user_id limit 3
 ) z;
 select jsonb_build_object(
  'battles',t.battles,'save_power',t.save_power,'kill_power',t.kill_power
 ) into p from iid_v4.player_totals t
 where t.epoch_id=e.id and t.user_id=u;
 return jsonb_build_object(
  'engine_version',4,'epoch_id',e.id,'starts_at',e.starts_at,'ends_at',e.deadline_at,
  'score_unit','FACTION POWER','save',iid_v4.ranking_side(e.id,u,'SAVE'),
  'kill',iid_v4.ranking_side(e.id,u,'KILL'),
  'legendary',l,
  'personal',coalesce(p,jsonb_build_object('battles',0,'save_power',0,'kill_power',0))
 );
end $$;
revoke all on function iid_v4.hall_of_fame() from public,anon,authenticated;
grant execute on function iid_v4.hall_of_fame() to authenticated;
create function public.iid_v4_hall_of_fame() returns jsonb
language sql security invoker set search_path='' as $$select iid_v4.hall_of_fame()$$;
revoke all on function public.iid_v4_hall_of_fame() from public,anon,authenticated;
grant execute on function public.iid_v4_hall_of_fame() to authenticated;

create function iid_v4.return_report() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=iid_private.require_player();e iid_v4.epochs;c iid_v4.return_cursors;
 t timestamptz:=clock_timestamp();since_at timestamptz;
 first_visit boolean; result jsonb;
begin
 select * into e from iid_v4.epochs where published order by starts_at desc limit 1 for share;
 if not found then return null;end if;
 t:=clock_timestamp(); -- capture after epoch lock so report HP and ledger cannot cross settlement
 insert into iid_v4.return_cursors(epoch_id,user_id,opened_at,visits)
  values(e.id,u,t,0) on conflict(epoch_id,user_id) do nothing;
 select * into strict c from iid_v4.return_cursors
  where epoch_id=e.id and user_id=u for update;
 first_visit:=c.visits=0;
 since_at:=case when first_visit then e.starts_at else greatest(e.starts_at,c.opened_at) end;
 -- Ledger applied_hp is authoritative; faction power is never labeled World HP.
 with settled as (
  select kind,applied,settled_at,scheduled_at
  from iid_v4.events
  where epoch_id=e.id and settled_at>since_at and settled_at<=t
 ), completed as (
  select action,power from iid_v4.attempts
  where epoch_id=e.id and completed_at>since_at and completed_at<=t
 ), latest as (
  select kind,applied,scheduled_at from settled
  order by settled_at desc,scheduled_at desc,kind limit 1
 )
 select jsonb_build_object(
  'engine_version',4,'source','V4_SETTLED_LEDGER','first_visit',first_visit,
  'from',since_at,'until',t,'world_hp',e.hp,'world_enabled',e.admission and e.status='ACTIVE',
  'world_status',e.status,'winner',e.winner,
  'save_power',coalesce((select sum(power) from completed where action='HEAL'),0),
  'kill_power',coalesce((select sum(power) from completed where action='KILL'),0),
  'heal_battles',(select count(*) from completed where action='HEAL'),
  'kill_battles',(select count(*) from completed where action='KILL'),
  'battle_world_hp',coalesce((select sum(applied) from settled where kind='BATTLE'),0),
  'decay_hp',-coalesce((select sum(applied) from settled where kind in('DECAY','FINAL')),0),
  'chaos_hp',coalesce((select sum(applied) from settled where kind='CHAOS'),0),
  'net_hp',coalesce((select sum(applied) from settled),0),
  'battle_windows',(select count(*) from settled where kind='BATTLE'),
  'decay_pulses',(select count(*) from settled where kind in('DECAY','FINAL')),
  'chaos_events',(select count(*) from settled where kind='CHAOS'),
  'latest_event',(select jsonb_build_object('kind',kind,'applied_hp',applied,
    'scheduled_at',scheduled_at) from latest)
 ) into result;
 update iid_v4.return_cursors set opened_at=t,visits=visits+1
 where epoch_id=e.id and user_id=u;
 return result;
end $$;
revoke all on function iid_v4.return_report() from public,anon,authenticated;
grant execute on function iid_v4.return_report() to authenticated;
create function public.iid_v4_return_report() returns jsonb
language sql security invoker set search_path='' as $$select iid_v4.return_report()$$;
revoke all on function public.iid_v4_return_report() from public,anon,authenticated;
grant execute on function public.iid_v4_return_report() to authenticated;
