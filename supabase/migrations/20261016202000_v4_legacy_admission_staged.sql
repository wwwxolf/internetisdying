-- V4 final cutover preparation. SAFE DEFAULT: V1/V2 admission remains OPEN.
-- NEVER flip legacy_admission_open=false in this migration.
-- All prior V2 sessions may still finish and settle during approved draining.
alter table iid_v4.cutover_control
 add column legacy_admission_open boolean not null default true,
 add column legacy_admission_paused_at timestamptz;
alter table iid_v4.cutover_control
 add constraint iid_v4_admission_pause_consistent check (
   (legacy_admission_open and legacy_admission_paused_at is null)
   or (not legacy_admission_open and legacy_admission_paused_at is not null)
 );
-- Serialize new inserts with the owner transaction changing admission_open.
-- A caller who was mid-insert either commits before the pause or is rejected.
create function iid_v4.legacy_input_gate() returns trigger
language plpgsql security definer set search_path='' as $$
declare gate_open boolean;
begin
 select legacy_admission_open into strict gate_open
  from iid_v4.cutover_control where id=1 for share;
 if not gate_open or exists(select 1 from iid_v4.epochs where published) then
   raise exception 'LEGACY_ADMISSION_CLOSED' using errcode='55000';
 end if;
 return new;
end $$;
revoke all on function iid_v4.legacy_input_gate()
 from public,anon,authenticated;
create trigger iid_v4_guard_legacy_battle_admission
 before insert on public.iid_battles for each row
 execute function iid_v4.legacy_input_gate();
create trigger iid_v4_guard_legacy_vote_admission
 before insert on public.iid_chaos_votes for each row
 execute function iid_v4.legacy_input_gate();

-- Once the owner pauses admission, destructive changes to archived V2 ledgers
-- are also rejected, including legacy developer reset and stale browser tabs.
-- Accepted UPDATE/settle of an already existing battle is intentionally allowed
-- until the separate world freeze is armed after drain.
create function iid_v4.legacy_history_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare gate_open boolean;
begin
 select legacy_admission_open into strict gate_open
  from iid_v4.cutover_control where id=1 for share;
 if not gate_open or exists(select 1 from iid_v4.epochs where published) then
   raise exception 'LEGACY_HISTORY_PROTECTED' using errcode='55000';
 end if;
 if tg_op='DELETE' then return old;end if;
 return null;
end $$;
revoke all on function iid_v4.legacy_history_guard()
 from public,anon,authenticated;
-- Do not include iid_player_presence: its ephemeral upkeep is independent
-- and the archive's source of truth is the settled immutable ledgers below.
do $$
declare tbl text;
begin
 foreach tbl in array array[
  'iid_battles','iid_chaos_votes','iid_chaos_results','iid_chaos_days',
  'iid_decay_pulses','iid_v2_window_results','iid_v2_live_buckets',
  'iid_hof_totals','iid_hof_season_totals','iid_share_cards'
 ] loop
  execute format(
    'create trigger %I before delete or truncate on public.%I for each statement execute function iid_v4.legacy_history_guard()',
    'iid_v4_archive_guard_'||tbl,tbl
  );
 end loop;
end $$;
-- The history guard is intentionally statement-level; any DELETE fails while
-- paused, including multirow wipes. It never changes existing history.
