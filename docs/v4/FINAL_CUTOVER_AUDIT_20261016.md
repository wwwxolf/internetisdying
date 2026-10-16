# WORLD_001 — V4 FINAL CUTOVER / CLEAN WORLD RESET
## Production audit, stage-only delivery, and OWNER APPROVAL GATE

**Decision: NO-GO FOR LIVE CUTOVER.** Prepared code is committed and CI tested. This report is NOT authorization to pause V2, reset production, or publish V4.

Audit timestamp: 2026-10-16 UTC. Repo: `wwwxolf/internetisdying`. Current live world remains V2.

### Severity-classified findings

| Severity | Finding | Evidence | Disposition |
|---|---|---|---|
| **CRITICAL** | No full backup **and tested restore** including Supabase Auth, profile associations, old cards, grants, cron. | No connected tool verified backup/restore state; Supabase clone flow requires eligible existing physical backup and paid plan, and copies DB only. | **Hard NO-GO.** Owner/operator must complete actual restore rehearsal before any production cutover mutation. |
| **CRITICAL** | Owner has not approved exact UTC boundary, maintenance window, rollback, and cutover steps. | V4 epoch count zero; cron V4 disabled; `iid_v4.cutover_readiness()` returns `production_ready=false`. | **Hard NO-GO.** Explicit separate GO required. |
| **HIGH** | Old browser tabs could issue V1/V2 inputs even after routing changes; flipping `v2_enabled` to false can fall back to V1. | Live `iid_private.start_battle()` selects V1 when V2 flag is false; legacy `chaos_vote()` accepts input while world enabled. | New staged migration `20261016202000_v4_legacy_admission_staged.sql`: default-open, DB trigger rejects new old battle and chaos vote inserts once owner pauses admission or V4 is published. **NOT installed in prod pending backup gate.** |
| **HIGH** | Developer reset can delete history even though creator identity survives; late V1 settlement can write old World HP. | Live owner-reset procedure deletes numerous history tables; `settle_battle` V1 writes `iid_world`. | Existing dormant HP freeze installed; staged archive-history DELETE/TRUNCATE guards tested; keep developer reset disabled operationally after V2 freeze. |
| **HIGH** | Cutover must drain all accepted legacy events and close all writers before publishing V4. | Five World HP writer functions identified; runtime is still running V2 cron. | Owner runbook requires old admission pause, accepted battles settlement, closed 4h windows/chaos/decay, HP/version archival, old cron disable, world frozen, then V4 publication. **Not yet rehearsed against every old entry point on a production-like clone.** |
| **HIGH** | V4 mobile browser, Google OAuth, WhatsApp card and live scheduled cron have not run against a real published staging epoch. | V4 has zero production epochs. | Must complete end-to-end on isolated Supabase/Cloudflare staging before GO. |
| **MEDIUM** | Automatic error alerts for scheduler downtime, backlog growth and mismatch remain absent. | Current `iid_v4.cutover_readiness()` is read-only diagnostic, not alerting. | Wire condition-triggered alert delivery in staging and verify before cutover. |
| **MEDIUM** | Supabase security advisor flags three anonymous and five authenticated PUBLIC `SECURITY DEFINER` RPCs. | Public share/momentum/pulses and authenticated developer-reset functions. | Public share/momentum intentionally readable by design; validate data minimization, re-review definer privileges, and test attempted privilege escalation before GO. No vulnerability has been demonstrated merely by this warning. |
| **LOW** | RLS is enabled with zero policies on several private game tables. | Supabase advisor INFO. | Deliberate deny-by-default on private tables accessed by checked RPCs; verify grants and explain intent to reviewers. |

### Live state read-only verification

- Existing active accounts / profiles: **1 / 1**.
- Historical V2 battles: **3**, V2 window result rows: **7**, historical V2 share-card rows: **3**.
- Unfinished V2 battles: **0 at observation**. This is not an enduring cutover guarantee; re-evaluate atomically immediately before GO.
- Legacy world HP/version: **506000 / 3**. **Not a final archival checkpoint** because V2 is still live.
- V4 epochs / player totals / shares: **0 / 0 / 0**.
- `iid-v2-world-tick`: active, every two minutes; `iid-v4-settlement`: registered, disabled, every minute.
- Existing `legacy_frozen=false`. The new admission gate migration is **committed but not installed**; current V2 admission is unchanged.
- Supabase `iid_v4.cutover_readiness()` read-only status: **NO-GO**.

### Code changed and tested

- NEW `supabase/migrations/20261016202000_v4_legacy_admission_staged.sql`: adds default-open admission flag with timestamp consistency constraint; `BEFORE INSERT` for `public.iid_battles` and `public.iid_chaos_votes`; serializes admission close with in-flight inserts. Adds protection against DELETE/TRUNCATE of historic V2 battle, vote, chaos, decay, ranking, share and window ledgers after the pause. Leaves accepted battle updates/settlement available while draining. **Do not execute this DDL in production before approved backup/restore.**
- UPDATED `tests/developer-reset.test.mjs`: real-migration PGlite checks late-old-tab battle/vote rejection, accepted battle settlement/idempotency, Auth/profile/history preservation, and developer reset/deletion denial when paused.
- UPDATED `tests/v4/postgres.py`: real PostgreSQL end-to-end synthetic workload completes **100 SAVE + 100 KILL** V4 fights across **200 synthetic verified Google players** (created only in disposable test database); tests per-epoch personal score, top ranks, Legendary Top 3, settled World HP not conflated with power, and unchanged legacy World HP. Existing concurrency, outage catch-up, settlement and cutover gate tests remain in force.
- Existing `docs/v4/SCHEDULER_AND_CUTOVER.md` and `docs/v4/PRODUCTION_READINESS.md` remain the operational controls and prior findings.

### Definition of clean competitive restart

**NO DELETE/RESET OF V2 HISTORY.** V4 creates an independent epoch using `iid_v4.prepare_epoch(approved_utc_midnight)`: its own HP starts at **500000**, duration **720 hours/30 days**, and exactly **331 scheduled events**. It has no attempts, votes, player_totals, return_cursors or share_cards initially. This is how all players start competitively unranked/at zero while keeping the original Google user_id, nickname, origin/avatar, country, and historical V2 records. New leaderboards and unique records are epoch-scoped.

The previous V2 HP 506000 is a live *observation*, not a snapshot of final cutover; preserve the actual final HP at the owner-approved cutoff. V2 permalink cards must never be deleted. Do not launch V4 with a retroactive start timestamp without calculating the impact of catch-up and documenting it.

### Synthetic integration and verification summary

- CI `Global Battle Engine`: PASS.
- CI application regression: PASS.
- CI `V4 isolated verification` including PostgreSQL concurrency and 200-battle population: PASS.
- The 200 synthetic players were never inserted into production and do not justify calling a browser/OAuth/WhatsApp flow production-tested.
- GitHub's existing Cloudflare deploy workflow publishes commit changes to static/runtime assets; no V4 public epoch, production admission pause, legacy HP reset or scheduler activation occurred.

### Backup / restore task for a human authorized operator

1. Open production Supabase project **Database → Backups** and inspect latest complete backup and (if enabled) PITR retention. Do not merely rely on the project's plan.
2. If enabled for that project, use **Restore to a New Project** to restore a chosen exact restore point. This copies the database including `auth`, but **not** storage files, Auth/API configuration, Edge Functions, or every project setting. See https://supabase.com/docs/guides/platform/clone-project and https://supabase.com/docs/guides/platform/backups .
3. Immediately disable copied cron/externally linked functions in the restore clone, keep it private, and verify record counts, auth-to-profile join integrity, historical battle/window/HOF/share rows, procedures, grants, world HP/version and sample immutable old links in the isolated environment.
4. Record backup timestamp, restore ID, immutable integrity checks, owner signoff, and a tested rollback/reconciliation plan. **No restore rehearsal has been performed in this session.**

### Separate owner approvals REQUIRED, IN ORDER

- Owner approves exact UTC V2 admission cutoff and maintenance message.
- Owner approves verified backup and restore rehearsal evidence.
- Owner approves installation of staged admission/history guard to production, keeping `legacy_admission_open=true` initially.
- Owner approves closing legacy admission, draining old activities and their faction windows, archiving the final V2 world/leaderboard snapshots, stopping V2 cron, then arming the old-HP freeze.
- Owner approves starting the independent V4 epoch at an agreed UTC boundary, enabling V4 cron, verifying zero due-event backlog, and then opening V4 admission.
- Owner signs off on mobile OAuth, live event replay, scores, return digest, PNG/OG/WhatsApp and post-release monitoring.

**Current instruction does NOT provide final production GO. Stop here.**
