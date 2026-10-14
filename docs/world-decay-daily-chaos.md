# Daily Chaos + World Decay — rollout plan

Scope: 30 internet-themed daily event pairings (60 event choices), pixel Arena voting, one Google-authenticated vote per UTC date, result settlement once a day (+/-6000 HP), and 800..1000 random damage HP per elapsed 3-hour slot. No 30-day World timer or reset is part of this work.

## Game rules

- Damage event: -6000 HP, Recovery event: +6000 HP.
- Rotating day 1 is BOT INVASION vs GLOBAL FIREWALL. Rotate all thirty pairs and repeat, independently of the World lifecycle.
- One non-editable vote per authenticated player per UTC day. Minimum 20 unique voters for any effect. Tied votes or no quorum are recorded with a zero-HP outcome.
- Resolve yesterday's UTC event through a privileged server operation. Do not trust browser clocks or browser-reported votes.
- Decay = 800 + random_int(201) = inclusive 800–1000. Schedule intervals are anchored to the operator's activation timestamp, and every pulse is stored once in a unique ledger.
- Both effects use a transactionally locked shared World row and clamp HP to [0, 1,000,000].
- The 60 visuals are offline art prompts in the catalog; Arena currently renders consistent pixel-precise SVG icons without external image APIs.

## Safety and permissions

- The migration creates catalog, control, day rows, votes, results, and decay pulse ledgers. All tables use RLS.
- No anonymous or authenticated client can insert or update voting or decay records directly.
- Public authenticated RPCs: iid_chaos_status and iid_chaos_vote.
- Privileged functions only: iid_private.process_decay and iid_private.resolve_previous_chaos. They are not granted to authenticated/anon roles.
- Two independent gates: existing iid_world.enabled AND new iid_chaos_control.enabled must both be true.
- New chaos control defaults to FALSE, anchor_utc NULL and decay_anchor_at NULL. Migration does not schedule cron or activate voting.

## Operator rollout (NOT YET AUTHORIZED)

1. Apply migration only after SQL unit tests, code review, and staging security verification.
2. Verify both event cards show in PAUSED mode, vote buttons disabled, with Google sign-in and no change to HP.
3. Verify pg_cron extension installed/available, cron timezone UTC, and that the following privileged jobs execute in staging:

    SELECT cron.schedule('iid-world-decay', '*/5 * * * *',
       'select iid_private.process_decay()');
    SELECT cron.schedule('iid-daily-chaos', '*/5 * * * *',
       'select iid_private.resolve_previous_chaos()');

   Jobs run every five minutes for safe retries. Decay applies only after elapsed three-hour slots, and the event result only once per prior UTC day. Do not install production jobs until explicit activation approval.

4. When the user approves activation and World Battle rollout is separately ready, set iid_chaos_control.enabled=true, anchor_utc=current UTC date and decay_anchor_at=clock_timestamp() in one authorized transaction. Do not touch iid_world.enabled without independent Global Battle approval.
5. Validate with two authenticated accounts; inspect ledger, shared World HP, missing/duplicate requests, post-midnight voting boundary and concurrent sessions.

## Known gaps before enabling

- Pausing and resuming after an extended interruption may catch up up to eight missed decay pulses per function call. Decide and verify a skip-vs-catch-up policy before production activation, or HP may drop unexpectedly after a long outage.
- The daily processor resolves yesterday only. Downtime longer than a day requires an explicit operator recovery decision and must never replay completed events.
- Neither one-vote/account nor per-tap caps prevent someone creating multiple fake Google accounts; additional abuse monitoring and rate limiting are required.
- Review production traffic, event moderation/copy and pixel icons on 360px, 390px and 430px displays.
- No production scheduler, no daily votes and no HP changes are to be executed at this draft stage.

## Testing

- Automated migration/RLS/engine tests run on GitHub Actions.
- All client-facing changes are isolated to Daily Chaos files, Arena markup, and the authorized module loader.
- Existing Google login, Tap Battle, and monthly rarity logic are unchanged.
