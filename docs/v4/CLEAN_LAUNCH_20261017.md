# WORLD_001 CLEAN LAUNCH — scheduled 17 Oct 2026, 07:00 WIB

## Owner instruction / authorized reset
The owner explicitly approved deletion of V2 competitive data and history, re-onboarding of all existing players, and launch of V4 at **2026-10-17 00:00 UTC** (07:00 Asia/Jakarta). This supersedes the earlier historical-archive requirement for V2. Do **not** treat this as an instruction to delete Supabase Auth identities, API secrets, or the platform's core schema.

## Prepared and deployed (16 Oct)
- `20261016202000_v4_legacy_admission_staged.sql` installed with `legacy_admission_open=true`, `legacy_frozen=false`. No early pause.
- `20261016210500_v4_scheduled_clean_launch.sql` installed with launch control `state=SCHEDULED`, exact UTC boundary and an atomic, owner-only function `iid_v4.execute_clean_launch()`.
- The Cloudflare Worker deploy pipeline and Global Battle/V4 CI passed, including a disposable PGlite reproduction of failed preflight (no deletion) and a complete successful launch, plus real PostgreSQL V4 settlement/concurrency tests.
- pg_cron job `iid-v4-clean-launch` id 3, active, scheduled `0-2 0 17 10 *` (GMT); it calls `select iid_v4.execute_clean_launch()`. Three attempts: 00:00, 00:01 and 00:02 UTC. The function rejects calls before the deadline and if delayed 3+ minutes. A successful launch disables its own job.
- Existing `iid-v2-world-tick` remains active, `iid-v4-settlement` remains disabled until successful launch. At each pass the procedure requires the exact expected cron states, zero V4 epochs/players/cards, and an open legacy admission gate; otherwise aborts atomically.
- A read-only verification reminder is scheduled for 07:05 WIB. It **does not** perform a retry or mutation.

## Exact database transaction at launch
1. Check the UTC deadline, singleton state, scheduler configuration, V4 cleanliness and old admission controls.
2. Acquire exclusive locks across legacy world, battle, chaos, ranking, pixel-card, and profile tables. If a writer holds a lock longer than 3.5 seconds, **fail and retry on next cron minute**; do not partially reset.
3. Preserve current Google Auth users, identities and sessions. Remember count of existing game profiles and V2 cards for audit. Disable V2 cron and set legacy World row `enabled=false` (old HP value remains stored but is no longer authoritative).
4. Delete **V2 gameplay data and history**: old battle rows, chaos votes/results/days, decay pulses, rolling window ledgers, Hall of Fame and season totals, old Pixel Cards, player presence and all game profiles. This is intentional and irreversible without an external backup. V2 schema/static configuration remains dormant for compatibility and auditing.
5. Set `legacy_admission_open=false`, `legacy_frozen=true`, enforcing DB triggers against stale V1/V2 writers.
6. Create a new independent V4 epoch with HP 500,000 and exactly 331 events spanning 30 days. Publish it with admission paused. Verify zero due events.
7. Enable V4 scheduler, then set V4 admission true. Mark the launch control `COMPLETED`, record old state/counts, and disable clean-launch cron.
8. Check V4 HP and zero player totals, zero old profiles/battles/cards, preserved Google Auth account count. All performed in one transaction, so a failure rolls back the entire switch.

## After launch
- Existing Google accounts are **not deleted**. Google OAuth for the same identity remains valid, but old `public.iid_profiles` rows are gone. On refresh or sign-in, `flow.js` routes users to `/onboarding.html` to choose a new avatar, nickname, country and profile. New V4 competitive scores begin at 0.
- The V4 backend/public Arena bundle is already deployed and reacts to the first `iid_v4_summary` published epoch. Prelaunch null summaries are no longer cached; active summaries use 10-second cache control.
- Check `iid_v4.clean_launch` (`COMPLETED`), `iid_v4.epochs` (`published=true`, `admission=true`, HP 500000 at start), V4 331 events, old job off, V4 cron on, old profile count 0, old gameplay tables empty, Auth identity count unchanged.
- The accepted V2 sessions immediately before cutoff can be discarded under the owner's explicitly approved wipe. Do not assume they were individually settled/archived.

## Failure handling
- If `state=SCHEDULED` after 00:03 UTC, or the cron logs show an error, **do not manually run destructive SQL blindly**. Inspect `cron.job_run_details`, the failing invariant and count of old/new world entries. V2 should remain active due to transactional rollback if the cutover did not commit.
- The user will receive a read-only check at 07:05 WIB. If any inconsistency is found, manually stop V4 admission first and protect the ledger; do not reset again.
- The legacy history deletion is not recoverable through the code itself. No full production Auth+database backup/restore rehearsal has been attested. The owner approved deletion regardless; this runbook makes that consequence explicit.

## Read-only verification queries
```sql
select state,launch_at,launched_at,epoch_id,old_hp,old_profiles,old_battles,old_cards,account_count
from iid_v4.clean_launch where id=1;
select id,starts_at,deadline_at,hp,published,admission,status,version from iid_v4.epochs;
select kind,count(*) from iid_v4.events group by kind order by kind;
select jobname,active,schedule from cron.job
where jobname in ('iid-v2-world-tick','iid-v4-settlement','iid-v4-clean-launch');
select (select count(*) from public.iid_profiles) profiles,
 (select count(*) from public.iid_battles) old_battles,
 (select count(*) from public.iid_share_cards) old_cards,
 (select count(*) from auth.users where deleted_at is null) google_auth_accounts;
```
