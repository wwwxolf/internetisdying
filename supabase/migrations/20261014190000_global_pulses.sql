-- GLOBAL PULSES: total SERVER-CONFIRMED taps from completed battles only.
-- Public aggregate only; no player details, nicknames or auth information.
-- Uses legacy internal HEAL/KILL unchanged. Does not activate any game engine.
create function public.iid_global_pulses() returns jsonb
language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'total_pulses',coalesce(pg_catalog.sum(b.counted_taps),0)::bigint,
    'settled_battles',pg_catalog.count(*)::bigint,
    'world_active',(select w.enabled from public.iid_world w where w.id=1)
  )
  from public.iid_battles b
  where b.settled_at is not null
$$;
revoke all on function public.iid_global_pulses() from public,anon,authenticated;
grant execute on function public.iid_global_pulses() to anon,authenticated;
comment on function public.iid_global_pulses() is
  'Public aggregate of accepted server taps in settled battles; independent of HEAL vs KILL.';
