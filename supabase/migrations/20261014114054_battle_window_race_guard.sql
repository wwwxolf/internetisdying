-- Defense in depth for six fixed, four-hour UTC battle windows.
-- iid_private.require_player() already serializes each authenticated player's
-- mutations with SELECT ... FOR UPDATE on iid_profiles.
-- This UNIQUE expression index also prevents a second battle if a future
-- code path accidentally skips the slot check or profile-row lock.
-- Preserve all existing battle rows; no WORLD, DECAY or CHAOS toggles here.
create unique index iid_one_battle_per_utc_window
on public.iid_battles (
  user_id,
  ((created_at at time zone 'UTC')::date),
  ((extract(hour from created_at at time zone 'UTC')::integer / 4))
);
