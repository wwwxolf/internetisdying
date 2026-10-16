# V4 Automatic Settlement & V2 → V4 Cutover — OWNER RUNBOOK

Status: **STAGED, DISABLED**. This document is a plan and dry-run specification, **not authorization** to change production economics.

## Architectural invariants

- **One public writer at a time.** The current authoritative world is the V2 `public.iid_world`; V4 has separate `iid_v4.epochs.hp`. V4 cannot be made public while V2 writers remain enabled.
- V4 settlement uses the single event ledger, sorted by `scheduled_at, priority`, and the internal advisory transaction lock. Duplicate or overlapping cron runs must not apply an event twice.
- Published and ACTIVE V4 epochs settle due work even when `admission=false`. This lets operators safely pause NEW input while old events drain.
- The V4 runner `iid_v4.scheduler_tick()` calls up to four batches of at most 16 events (**max 64 per invocation**). A minute heartbeat is the recovery schedule; when idle (no published ACTIVE epoch) it returns `IDLE` without touching any table.
- The pg_cron job `iid-v4-settlement` is installed with `active=false`, **within the same transaction as creation**; it stays disabled until a separate reviewed owner-approved activation.
- `public.iid_v4_summary()` is the routing switch. It must stay null until the real cutover. **Publishing V4 even with admission=false changes the Arena route**, so never publish as a "harmless trial".
- V4 is calculated from **settled server ledger**; faction power must never be displayed as applied World HP.

## Before any production cutover

Owner approval must specify UTC cutoff/start, support/rollback operator, acceptable maintenance window, and post-activation verification. Obtain complete restorable backup covering Auth and application state, plus snapshots of cron jobs and grants. Verify cron health from `cron.job_run_details` (a recent successful V2 run) and `pg_stat_activity`.

Read-only production preflight (DO NOT mutate):

```sql
select jobname,schedule,active from cron.job
where jobname in ('iid-v2-world-tick','iid-v4-settlement') order by jobname;
select enabled,hp,version from public.iid_world where id=1;
select v2_enabled,activated_at from public.iid_economy_control where id=1;
select count(*) as v4_epochs,
       count(*) filter (where published) as published_v4
  from iid_v4.epochs;
select count(*) as unfinished_v2_battles from public.iid_battles
 where settled_at is null;
select count(*) as due_v4 from iid_v4.events
 where settled_at is null and scheduled_at<=clock_timestamp();
select count(*) as v4_cards from iid_v4.share_cards;
```

## Transition phases (manual, approval required)

1. **READY / V2 authoritative:** V2 cron active, V4 cron disabled, zero published V4 epochs. Verify V4 code deployed and production SQL migration installed. Complete mobile OAuth, battle, vote, return, HOF, share/WhatsApp, and throughput tests using a separate disposable environment.
2. **V2 drain / prevent new writes:** Stop new V2 starts across **all V1/V2 entry points** and all settlement producers with a reviewed DB gate. Keep old settlement available long enough to finish every accepted battle/event. Audit all V2 direct player settlement RPCs before choosing exact SQL; disabling `v2_enabled` alone is explicitly insufficient and may accidentally route to V1.
3. **Freeze and backup:** Confirm no unfinished V2 battle, no due V2 timer, and no other old writer can mutate `public.iid_world`. Record final V2 HP/version/history. Disable `iid-v2-world-tick` by `cron.alter_job` only when V2 has been fully drained and old mutation entry points are closed.
4. **Private V4 preparation:** Call `iid_v4.prepare_epoch(approved_utc_midnight)` on owner connection only. Confirm exactly 331 scheduled events (180 BATTLE, 30 CHAOS, 120 DECAY, 1 FINAL), immutable parameters, future or current UTC start, 30-day deadline, `published=false`, `admission=false`.
5. **Publish paused:** Only after V2 is proven stopped, set V4 `published=true` but retain `admission=false`. This changes routing; no player interactions can start while settlement catches up. Verify `/api/v4-summary`, local server-now math and frontend routing.
6. **Enable scheduler and drain:** As owner, use `cron.alter_job(job_id=>(select jobid ...), active=>true)` on the named **existing** V4 job. Verify success from `cron.job` and `cron.job_run_details`. Call `iid_v4.scheduler_tick()` as owner if needed, in bounded transactions, until `remaining_due=0`. **Never enable admission while backlog remains.** On an already FINAL epoch, do not admit players.
7. **Open V4 admission:** Owner-approved, only when cutoff/cron/ledger checks pass; set `admission=true`. Verify V4 HEAL/KILL tap rounds, NEXT CHAOS votes, player stats, Legendary Top 3, World Return, immutable share PNG, and WhatsApp OG in real authenticated sessions. Confirm `public.iid_world` HP/version stay frozen.
8. **Monitor / emergency pause:** Alert on any failing V4 cron job, missing heartbeat, nonzero overdue events, a stale V4 version, contradictory HP, or any old writer. Pause V4 admission while allowing `iid_v4.settle_due()` to complete already due work. Preserve all ledgers. Do **not** rollback by resetting HP, deleting epochs, publishing a new epoch, or re-enabling V2 without an explicit data-reconciliation plan.

## Cutover rehearsal evidence and its limits

Disposable PostgreSQL integration tests cover:
- no public V4 epoch → `scheduler_tick()` returns IDLE and mutates nothing;
- delayed settlement drains in chronological sequence, max 64 events per tick, idempotently;
- `admission=false` blocks V4 inputs but does **not** block previously due event settlement;
- simulate legacy `public.iid_world.enabled` going false, then V4 private preparation, publication while paused, backlog drain, and explicit admission; verify V2 HP stays unchanged.

These simulate the **gates**, not the complete V2 production mutation surface, cron background worker, real mobile OAuth, network failures, or production load. Do not describe them as a successful production cutover.

## Confirm the scheduler stays disabled after staging

```sql
select jobname,schedule,active,command from cron.job
where jobname='iid-v4-settlement';
select count(*) as v4_epochs from iid_v4.epochs;
select iid_v4.summary() is null as no_published_v4;
```

Expected: `iid-v4-settlement` schedule `* * * * *`, `active=false`; zero V4 epochs, null published summary, V2 cron still active.

Do not enable a scheduler or publish an epoch without separate owner authorization.
