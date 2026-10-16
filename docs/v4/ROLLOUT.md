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

A complete cutover automation and V4-specific share-card publisher are not implemented. V4 leaderboard, personal statistics, and return-digest presentation are now staged separately and never call legacy V2 APIs; do not activate until end-to-end account testing, V4 share cards, scheduled settlement, and transition controls are complete.

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

## V4 rankings + World Return (2026-10-16, staged)

- Additive migration `20261016171500_v4_readonly_rankings_return.sql` is installed. No V4 epoch has been created. No legacy table, HP or cron was modified.
- `iid_v4_hall_of_fame()`: verified authenticated player only; current published epoch only. Top 10 per faction by **FACTION POWER**, personal faction totals and number of verified battles, and global Legendary Top 3 (one highest settled personal power per player). Ties deterministic. Player UUID and auth details are not returned.
- `iid_v4_return_report()`: verified authenticated player only; first visit covers epoch history, subsequent visits cover the range since the player's previous authenticated report open, tracked through a private per-epoch cursor. The report distinguishes **SAVE/KILL FACTION POWER** from **WORLD HP** actually applied when battle, chaos and decay events settled. Reported net HP sums only actual settled ledger impacts, not raw power or provisional influence. Cursor tables are private: direct anon/authenticated table SELECT is revoked and RLS remains enabled.
- The existing Hall of Fame presentation renders V4 rankings only on the V4 route; the existing V2 implementation remains unchanged. V4 World Return has a standalone presenter; legacy World Return and `iid_publish_share_card` are not used on the V4 route.
- **V4 Pixel Card is deliberately disabled.** The legacy immutable pixel share service reads V2 world history; connecting it to a V4 report would fabricate or misattribute effects. V4-specific immutable sharing and WhatsApp Open Graph generation are still a blocking pre-activation product task.
- PostgreSQL 17 CI covers authenticated/anonymous permissions, leaderboard ranking, single-best-battle Legendary records, two-player isolation, no UUID leaks, first-visit cursor, subsequent delta reports, actual applied HP, and replay prevention. Browser OAuth end-to-end and production throughput have not been validated.

### Read-only preactivation audit, after staging

- `iid_v4.epochs=0`, `iid_v4.events=0`, `iid_v4.return_cursors=0`, `iid_v4.summary() IS NULL`.
- Legacy world still enabled, legacy V2 economy still enabled, and verified world HP at the check was 506,000.
- The only active cron job observed was `iid-v2-world-tick` (every two minutes); no V4 cron exists.
- Both new public RPCs grant EXECUTE to `authenticated`, not `anon`. Cursor SELECT is inaccessible to both browser roles.
- Deployment and regression tests passed on staged code, but **absence of a published V4 epoch means its real player UI has not yet been tested against live V4 data**.

### Pre-activation cutover checklist — not authorization to cut over

1. Decide and announce a final V2 world cutoff and new V4 UTC-midnight start. The transition is globally consequential, so owner approval is mandatory.
2. Complete V4 share cards, verify V4 personal/legendary display from a realistic synthetic dataset, and validate actual mobile OAuth login, return digest and V4 battle/vote end-to-end in a non-production environment.
3. Verify no pending legacy battles or due V2 settlements remain before shutting the legacy mutation paths. Take a complete restorable database backup including relevant Auth records; the earlier table snapshots are not a sufficient restoration point.
4. In a single reviewed runbook, gate **all** legacy entry points, disable `iid-v2-world-tick`, and verify there are no live legacy writers. Merely changing `v2_enabled` switches back toward V1 and is not an effective safety gate.
5. Prepare an isolated new V4 epoch at an approved UTC midnight; inspect its 331 events and all grants before publishing. Keep `admission=false` while preparing. Publishing is the routing switch; a published but admission-paused epoch must **not** route players back to V2.
6. Activate and test a dedicated V4 settlement schedule with a recovery heartbeat; verify cutoff locking and chronological catch-up. Verify only one engine can modify the globally displayed HP.
7. Perform explicit go/no-go checks and record rollback conditions before opening new V4 input. Preserve both era ledgers and all player histories.

Until all gates pass, V2 remains authoritative and V4 remains inactive.
