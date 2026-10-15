-- OWNER-ONLY DEVELOPER MODE. Nothing is public or anonymous.
-- Assign the verified owner separately through trusted administrative SQL:
-- INSERT INTO iid_private.iid_developer_operators(user_id) VALUES(<verified-auth-uuid>);
-- Never assign roles based on nickname, country, or a browser-provided identifier.
create table iid_private.iid_developer_operators (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp()
);
alter table iid_private.iid_developer_operators enable row level security;
revoke all on table iid_private.iid_developer_operators from public,anon,authenticated;

create function iid_private.developer_allowed() returns boolean
language plpgsql security definer set search_path='' as $$
declare caller_id uuid;
begin
 caller_id:=iid_private.require_player();
 return exists(select 1 from iid_private.iid_developer_operators where user_id=caller_id)
  and (select count(*) from auth.users where deleted_at is null)=1
  and (select count(*) from public.iid_profiles)=1;
end $$;
revoke all on function iid_private.developer_allowed() from public,anon,authenticated;

create function public.iid_developer_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return jsonb_build_object('allowed',iid_private.developer_allowed());
end $$;
revoke all on function public.iid_developer_status() from public,anon,authenticated;
grant execute on function public.iid_developer_status() to authenticated;

create function public.iid_developer_reset(p_confirm text) returns jsonb
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
 delete from public.iid_v2_window_results;
 delete from public.iid_v2_live_buckets;
 update public.iid_world set hp=500000,version=0,updated_at=clock_timestamp() where id=1;
 -- Existing 4h windows must not be replayed after a developer reset.
 update public.iid_economy_control set activated_at=clock_timestamp() where id=1 and v2_enabled=true;
 if (select hp from public.iid_world where id=1)<>500000
  or exists(select 1 from public.iid_battles)
  or exists(select 1 from public.iid_hof_totals)
  or exists(select 1 from public.iid_v2_live_buckets)
  or exists(select 1 from public.iid_v2_window_results)
 then raise exception 'RESET_POSTCONDITION_FAILED';end if;
 return jsonb_build_object('ok',true,'world_hp',500000,'previous_hp',current_hp,
  'deleted_battles',old_battles,'player_identity_kept',true);
end $$;
revoke all on function public.iid_developer_reset(text) from public,anon,authenticated;
grant execute on function public.iid_developer_reset(text) to authenticated;
