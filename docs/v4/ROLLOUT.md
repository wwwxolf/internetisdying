# V4 staged rollout

V4 is installed separately from V1/V2. Installation creates no epoch and changes no legacy HP, player history, economy flags or cron job. The default public summary is null, so the existing arena remains V2. New V4 snapshots are cached for 60 seconds. The frontend fails closed if routing is unavailable.

## Frozen economy

Personal power = round((100 + floor(taps/10)) * critical / 100), taps 0..50; critical 100 (90%) or 105 (10%), drawn server-side once. The bounded tap claim can be automated; it is not proof of human input.

Battle HP = round(12000*(SAVE-KILL)/(SAVE+KILL+4000)). Chaos uses effective votes max(0,votes-9), then round(3000*(SAVE-KILL)/(SAVE+KILL+20)). Rounding is nearest integer with ties away from zero. Numeric arithmetic avoids bigint intermediate overflow.

Start HP 500000, max 1000000. Decay cumulative at t seconds = round(10000*t/86400 + 7000*t*t/(30*86400*86400)). Start at UTC midnight, end after 720 hours. 180 battles, 30 daily chaos, 120 WIB-grid decay events and one final tail. Total nominal decay 510000. Zero HP ends immediately for KILL; survival through the final tail wins for SAVE. Max HP is not an early victory.

## Activation is a separate operator decision

The observed legacy world is enabled, with HP 506000 and V2 enabled (2026-10-16 read). Do not reset it or silently terminate it. Owner must decide a transition time and how to close the existing world.

After that decision, in a separately reviewed maintenance operation:

1. Back up the legacy database and record the exact schema/flags/state. Halt legacy admission, drain existing pending rounds and settle due legacy events in the approved order. Preserve history.
2. Disable the old scheduler and all legacy HP mutation entry points before enabling V4. Merely setting v2_enabled=false is NOT sufficient: it selects V1 behavior.
3. Prepare a new epoch with iid_v4.prepare_epoch at the approved UTC midnight. It defaults to unpublished and admission=false. No epoch may be reused.
4. Publish/enable the new epoch only after legacy gates and scheduler isolation are verified. published=true selects V4 frontend routing; admission=false pauses new input without routing back to V2.
5. Register scheduler calls as owner at UTC 0,4,5,8,11,12,16,17,20,23 plus a 15-minute recovery heartbeat. iid_v4.settle_due() handles at most 16 events per transaction with a nonblocking advisory lock. A runner can invoke it at most four times in separate transactions. No scheduler is installed by staging SQL.
6. Verify public summary, version and cron jobs read-only. Do not create test battles/votes/accounts in production.

A complete cutover automation and V4 leaderboard/return-digest presentation are not implemented in this staging change. Those legacy modules are not initialized on the V4 route; player faction totals are recorded in iid_v4.player_totals for subsequent presentation. Do not activate until these product limitations and transition controls are resolved.

## Verification

- Node tests: formula invariants, exact decay schedule, terminal behavior, cache isolation, two-request client round.
- PostgreSQL 17 CI: actual SQL installation, grants/ownership, parallel duplicate completion/vote, sequential vs concurrent scheduler recovery, late-input rejection after waiting for an epoch lock.
- Existing application tests run in CI. Synthetic tests are not OAuth browser end-to-end verification or a production throughput benchmark.
- No repeat Monte Carlo run: uses the previously approved V4 contract.

## Rollback

Before activation: revert the frontend commit to the previous deploy. The additive empty schema may remain installed; do not delete it as an automatic rollback. Remove inactive V4 routing only after confirming no published epoch exists.

After activation: pause admission, preserve all V4 ledgers and investigate. Never reset/delete epochs or send V4 state through V2 formulas. A repair must respect already finalized results.

## Staging deployment evidence (2026-10-16)

Migration applied: 20261016065704_power_balance_v4_staged. SQL content matches the CLI-generated migration tested in CI (CLI original version 20261016065200; committed version matches Supabase history). After installation: epochs=0, public summary=null, legacy enabled=true and HP=506000. No cron added.

GitHub Actions run 38863582097 passed 7 focused Node tests, PostgreSQL transaction/cutoff tests and 126 existing regression tests with the additive migration loaded. Real browser OAuth and production load remain unverified.

A consistent read snapshot of all 16 public game tables was saved outside the repository before migration. It does not include Supabase Auth or a complete PostgreSQL backup. No existing schema/data was overwritten.

Security advisors report informational RLS-without-policy entries for private V4 tables: deliberate deny-by-default with checked RPC access. Existing public V1/V2 definer-function warnings remain outside this change. See [RLS advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## V4 maintenance hardening (2026-10-16, staged)

- New additive correction: `20261016145800_v4_paused_admission_settlement.sql` updates **only** `iid_v4.settle_due()`. An already published ACTIVE V4 epoch now settles scheduled work even when `admission=false`; admission still rejects new start/vote/finish requests. This prevents a maintenance pause from freezing previously scheduled decay and outcomes. This change does **not** enable an epoch or install a scheduler.
- Frontend now matches each V4 tap battle's HEAL/KILL origin to its PATCH/PECK button theme, hides the choice buttons during the tap session, and shows the V4 voting section. Personal leaderboard/return digest and live OAuth tests remain prerequisites for activation.
- PostgreSQL isolation checks both `admission=false` settlement and blocked new inputs. This patch must be applied in production by the normal migration mechanism before activation.
- Never publish or activate an epoch merely because the maintenance SQL has been installed. Owner-controlled old-world shutdown and new-world start time are still undecided.
