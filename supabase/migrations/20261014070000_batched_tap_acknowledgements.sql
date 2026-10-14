-- PR-only change. DO NOT apply to production before staging HTTP tests.
-- Bounded cumulative tap acknowledgements remove the one-HTTP-request-per-gesture
-- bottleneck on mobile networks. This is fairness/latency mitigation, NOT bot detection.
-- p_seq is a monotone cumulative number of locally observed gestures, capped at 50.
-- The server counts no more than eight taps per second of elapsed SERVER time
-- (one initial tap as allowance), and it is always authoritative about acceptance.
create or replace function iid_private.tap_battle(p_battle_id uuid,p_seq integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid := iid_private.require_player();
  b public.iid_battles;
  t timestamptz;
  v_max_count integer;
begin
  select * into b from public.iid_battles
    where id=p_battle_id and user_id=u for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_seq is null or p_seq < 1 or p_seq > 50 then
    raise exception 'INVALID_SEQUENCE';
  end if;
  -- Replays never increment the tally, even if delivered out of order.
  if p_seq <= b.counted_taps then
    return jsonb_build_object(
      'counted_taps',b.counted_taps,'server_now',clock_timestamp()
    );
  end if;
  t:=clock_timestamp();
  if b.settled_at is not null or t < b.starts_at or t >= b.ends_at then
    raise exception 'TAP_WINDOW_CLOSED';
  end if;
  -- Uniform time-based ceiling, independently of how many requests were sent.
  -- The client MAY submit several taps in one acknowledged checkpoint.
  v_max_count:=least(50, 1 + floor(
    extract(epoch from (t-b.starts_at))*8.0
  )::integer);
  if p_seq > v_max_count then
    raise exception 'TAP_RATE_EXCEEDED';
  end if;
  update public.iid_battles set counted_taps=p_seq,last_tap_at=t
    where id=b.id returning * into b;
  return jsonb_build_object(
    'counted_taps',b.counted_taps,'server_now',clock_timestamp()
  );
end $$;

-- Retain the existing helper EXECUTE revocation, public wrappers and RLS.
revoke all on function iid_private.tap_battle(uuid,integer)
  from public,anon,authenticated;
grant execute on function iid_private.tap_battle(uuid,integer) to authenticated;
