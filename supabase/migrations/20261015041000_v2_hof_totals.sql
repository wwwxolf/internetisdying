-- V2-only player leaderboard totals. Preserve V1 engine compatibility behind feature flag.
-- Actual World HP for V2 is settled once per UTC window, not attributable per player.
create or replace function iid_private.hall_of_fame() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid; active_v2 boolean; save_rows jsonb; kill_rows jsonb;
 save_total bigint; kill_total bigint;
begin
 u:=iid_private.require_player();
 select v2_enabled into strict active_v2 from public.iid_economy_control where id=1;
 if active_v2 then
  save_rows:=iid_private.hof_side(u,'v2_save_influence');
  kill_rows:=iid_private.hof_side(u,'v2_kill_influence');
  select coalesce(sum(v2_save_influence),0),coalesce(sum(v2_kill_influence),0)
   into save_total,kill_total from public.iid_hof_totals;
 else
  save_rows:=iid_private.hof_side(u,'v1_save_power');
  kill_rows:=iid_private.hof_side(u,'v1_kill_power');
  select coalesce(sum(v1_save_power),0),coalesce(sum(v1_kill_power),0)
   into save_total,kill_total from public.iid_hof_totals;
 end if;
 return jsonb_build_object(
  'engine_version',case when active_v2 then 2 else 1 end,
  'score_unit',case when active_v2 then 'WAR INFLUENCE' else 'PERSONAL POWER' end,
  'period','ALL TIME',
  'save',save_rows||jsonb_build_object('total_score',save_total),
  'kill',kill_rows||jsonb_build_object('total_score',kill_total));
end $$;
revoke all on function iid_private.hall_of_fame() from public,anon,authenticated;
grant execute on function iid_private.hall_of_fame() to authenticated;
