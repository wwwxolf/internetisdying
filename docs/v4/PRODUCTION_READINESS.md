# World_001 — Production Cutover Readiness

**Status: NO-GO. V2 remains live; V4 cron disabled.** This is a checklist and operator evidence record, not permission to change world economics.

## Audited legacy HP writers

Live PostgreSQL function definition scan (2026-10-16) found exactly five functions containing direct `UPDATE public.iid_world` or equivalent:

| Function | Role | Cutover implication |
|---|---|---|
| `iid_private.process_v2_windows()` | faction-window result | disable V2 cron only *after* drained |
| `iid_private.process_decay()` | passive decay | schedule must stop before freezing HP |
| `iid_private.resolve_previous_chaos()` | chaos outcome | settle/record unresolved chaos first |
| `iid_private.settle_battle(uuid)` | legacy V1 player settlement | disabling the V2 flag is insufficient |
| `public.iid_developer_reset(text)` | owner-only deletion/reset | never invoke during or after cutover |

Other write paths include `iid_private.start_battle`, `tap_battle`, `tap_batch`, `settle_v2_due`, and chaos voting; these may modify battle/event ledgers without directly changing World HP. Inventory of world HP writers alone is **not** proof that all legacy event inputs are frozen.

The **dormant guard** in `20261016192500_v4_legacy_world_freeze_guard.sql` is the last line of defense: every UPDATE/DELETE/TRUNCATE of `public.iid_world` is prohibited if either (a) an owner explicitly arms `iid_v4.cutover_control.legacy_frozen` or (b) any V4 epoch is published. At install, `legacy_frozen=false` and no epoch is published, so V2 gameplay is unchanged. This does **not** block legacy battle starts by itself.

The `iid_v4.cutover_readiness()` diagnostic in `20261016192600_v4_owner_readiness_status.sql` is owner-only, read-only, and intentionally returns `production_ready=false` until manually audited prerequisites are fulfilled. **It cannot authorize activation.**

## Backup and restore — not yet performed/verified

A simple SQL export of public tables is **not** a restorable disaster-recovery backup. The approved cutover must first have:

1. A current **full database backup** covering `public`, `iid_private`, `iid_v4`, `auth`, RLS, functions, roles, cron configuration and extensions, obtained using supported Supabase project backup/restore workflows. Confirm whether PITR is enabled and its retention, and record the exact restore point/time.
2. Verified backup ownership, encrypted access controls, and offline retention separate from the production database. Do not put raw Auth exports, service-role secrets, passwords, or player PII in GitHub, logs, chat or public storage.
3. A **restore rehearsal into an isolated staging project** proving Auth/profile association, world HP/version, battle counts, Hall of Fame, share-card snapshots, roles and cron jobs. Disable all copied scheduled jobs before connecting restored data to any public environment.
4. Written evidence: backup artifact/restore point identifiers (not secrets), started/completed timestamps, restore run ID, schema checks, record-count checks, operator signoff, and rollback RTO/RPO. No automatic fallback to V2 after V4 activity begins without ledger reconciliation.

**This session has not created or validated a full backup.** No available connected workflow provided a verifiable backup/restore operation. Owner/operator must complete this gate separately.

## Isolated end-to-end acceptance (not yet completed)

Run in a disposable, production-like Supabase/Auth/Cloudflare setup only, with synthetic accounts and V4 epoch; **never create an artificial V4 epoch or fake share cards in production**.

- Google OAuth on Android and desktop, new player onboarding/profile, reconnect/expired session handling.
- One HEAL and one KILL tap battle: readiness timer, exactly 50-tap limit, start/finish idempotence, critical power and ledger totals, concurrent players and late taps.
- Chaos vote with duplicate request/expiry and replay; six UTC battle windows; decay and chaos ordering at identical timestamps.
- Cron outage 90+ minutes, overlapping runner calls, catch-up in bounded batches, maintenance admission pause while due settlements still drain; stale state indicator and post-recovery HP consistency.
- Hall of Fame Top 10, Legendary Top 3, country/nickname, personal stats tied to same epoch.
- World Return since last visit vs first visit, correct distinction **FACTION POWER** vs **SETTLED WORLD HP**, immutable V4 Pixel Card PNG, Open Graph thumbnail and WhatsApp share. Ensure previous V2 links remain valid.
- One cutover dry run with *all* old paths frozen, no pending V2 ledger item, full backup/restore recorded, then V4 publication and admission. The production world must never have simultaneous V2 and V4 HP mutation.
- Load benchmark under realistic concurrent traffic: DB contention, cron runtime, event bucket contention, RLS and share-card rate limiting. Define acceptable thresholds before GO.

Current automated unit/PostgreSQL simulations are valuable but **do not replace this mobile/OAuth/live cron end-to-end run**.

## Monitoring / incident response

Use owner-only diagnostic:
```sql
SELECT iid_v4.cutover_readiness();
```

In Supabase SQL dashboard (authenticated owner), also inspect:
```sql
SELECT j.jobname,j.active,j.schedule,r.status,r.start_time,r.end_time,r.return_message
FROM cron.job j
LEFT JOIN LATERAL (
 SELECT d.* FROM cron.job_run_details d WHERE d.jobid=j.jobid
 ORDER BY d.start_time DESC LIMIT 1
) r ON true
WHERE j.jobname IN ('iid-v2-world-tick','iid-v4-settlement')
ORDER BY j.jobname;

SELECT epoch_id, count(*) AS overdue
FROM iid_v4.events
WHERE settled_at IS NULL AND scheduled_at <= clock_timestamp()
GROUP BY epoch_id;
```

After activation, configure external alert delivery for (a) cron failure, (b) no recent successful run, (c) due-event backlog exceeding its agreed threshold or growing across consecutive checks, (d) stale V4 world version, (e) any post-cutover attempt to mutate V2 World HP, and (f) divergent public summary and ledger HP. **Alert delivery is not installed yet**; a diagnostic function is not an alerting service.

## GO / NO-GO authority

Until backup and restore rehearsal, isolated OAuth/E2E/load checks, complete old-event write freeze, UTC cutoff decision, cron alerting, and operator signoff pass, **NO-GO**. The scheduler stays registered but disabled; published V4 epochs remain zero. Do not arm the freeze control, enable V4 cron, publish an epoch, disable V2, or reset legacy HP based solely on automated test success.
