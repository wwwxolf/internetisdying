-- Add latency-tolerant, server-persisted TAP batching without changing World HP or auth.
-- Migration is additive: previously deployed iid_battle_tap(uuid,int) still works.
-- Client can report only an absolute capped tap sequence, never HP, timing or power.
-- This is a rate/cap guard, NOT human-vs-bot verification.
create function iid_private.tap_batch(p_battle_id uuid,p_total integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := iid_private.require_player();
  b public.iid_battles;
  t timestamptz;
  delta integer;
begin
  select * into b from public.iid_battles where id=p_battle_id and user_id=u for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_total is null or p_total < 1 or p_total > 50 then raise exception 'INVALID_TAP_TOTAL'; end if;
  -- Retry and out-of-order acknowledgements can never double-count.
  if p_total <= b.counted_taps then
    return jsonb_build_object('counted_taps',b.counted_taps,'server_now',clock_timestamp());
  end if;
  delta := p_total - b.counted_taps;
  if delta > 10 then raise exception 'BATCH_TOO_LARGE'; end if;
  t := clock_timestamp();
  if b.settled_at is not null or t < b.starts_at or t >= b.ends_at then
    raise exception 'TAP_WINDOW_CLOSED';
  end if;
  -- Prevent a client from instantly claiming an entire batch; a paced automated
  -- client can still bypass human intent checks, so this is NOT anti-bot proof.
  if t < coalesce(b.last_tap_at,b.starts_at) + delta * interval '40 milliseconds' then
    raise exception 'TAP_TOO_FAST';
  end if;
  update public.iid_battles set counted_taps=p_total,last_tap_at=t
  where id=b.id;
  return jsonb_build_object('counted_taps',p_total,'server_now',t);
end $$;

revoke all on function iid_private.tap_batch(uuid,integer) from public,anon,authenticated;
grant execute on function iid_private.tap_batch(uuid,integer) to authenticated;

create function public.iid_battle_tap_batch(p_battle_id uuid,p_total integer) returns jsonb
language sql security invoker set search_path='' as
$$ select iid_private.tap_batch(p_battle_id,p_total) $$;
revoke all on function public.iid_battle_tap_batch(uuid,integer) from public,anon,authenticated;
grant execute on function public.iid_battle_tap_batch(uuid,integer) to authenticated;
