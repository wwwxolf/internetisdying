# Global Battle Engine verification — 2026-10-14

## Change

The old arena computed power/HP in the browser and allowed one local action per UTC day. The new production path uses authenticated RPCs, permanent owner-scoped records, four-hour cooldowns, a rolling cap and shared transactional HP. Demo code is imported only by the explicitly marked demo page.

## Evidence

- 21 automated tests passed: 16 actual-SQL tests in local PGlite, 5 client contract/recovery tests.
- Live migration read-back: HP 500000, version 0, enabled false, battle count 0; RLS active on both new public tables.
- Security advisor: no new engine finding. Existing warning: Auth leaked-password protection disabled. Password sign-in is not used by the engine.
- Performance advisor: unused history index (informational, new empty table); retained for cooldown/monthly queries.
- PostgreSQL logs for 03:20–03:36 UTC contained migration statements and normal checkpoints; no error entry in that returned window. This is a bounded observation, not ongoing monitoring.
- Server concurrency exercise used separate `iid_verify`, `iid_verify_private`, `iid_verify_auth` schemas, synthetic identities, and the identical migration with schema substitutions. Two parallel starts left one pending battle. Two parallel settlements left one ledger row and version 1: 500000 → 500316.
- Two different synthetic players then settled HEAL/KILL in parallel. Version 2: 500316 → 500377 (+61); version 3: 500377 → 499587 (−790). No lost update observed. Transactions deliberately stayed open for two seconds. This is a targeted concurrency check, not a load test.
- All scratch schemas were removed. Read-back: zero scratch schemas, production HP 500000, zero production battles, paused.
- Live Cloudflare browser: an existing signed-in Google/profile session displayed the old labelled local demo. No real battle was submitted.
- Local browser fixture: paused buttons disabled; start/countdown/20-second settlement rendered; result, Common tier and 240-minute cooldown displayed. No console errors in the checked fixture.
- Mobile effective viewport 390×844: document width 383, no horizontal overflow. Desktop effective viewport 1440×900: document width 1433. Host-scaled viewport requests were adjusted to achieve the measured CSS dimensions. Fixture screenshots were inspected.

## Remaining activation checks

1. Review and deploy this frontend branch to Cloudflare with `iid_world.enabled=false`.
2. Verify deployed asset versions (`flow.js?v=9`, `arena.css?v=5`) and paused arena with a real Google session. Check fresh OAuth and nickname onboarding.
3. Exercise start/tap/settle over HTTP with controlled accounts in a staging project: two browsers, disconnect/reload, token expiry, deadline/latency. UI fixtures and direct SQL tests do not prove this boundary.
4. Review external request throttling / abuse controls and tap-acknowledgement latency. Paced automation is not blocked by tap caps.
5. Enable deliberately, verify a real stored result against displayed HP/history, and inspect current logs.

No production frontend deployment, main-branch merge, real battle settlement, ads, payments or share-card rendering was performed by this task.

## Follow-up audit — mobile latency and CI (2026-10-14)

- Added an **additive migration already applied in Supabase, still production-paused**: `20261014042237_batch_tap_acknowledgements.sql`, defining authenticated `iid_battle_tap_batch(p_battle_id,p_total)` with owner/Google checks, row lock, idempotent absolute sequence, maximum 10 newly accepted taps per request, 50 overall and 40ms/server-confirmed-tap pacing. The legacy per-tap endpoint is retained. Neither version proves human involvement.
- Browser now records fast local tap feedback without waiting for each network RPC; flushes bounded absolute-tap batches sequentially and displays only the **server-confirmed** charge bonus. At 20s expiry, any unconfirmed taps cannot increase power. The server still requires the full 20s even if the player reaches 50 early; this differs intentionally from the former demo and should receive UX approval.
- Added `.github/workflows/battle-tests.yml`, running locked dependencies and automated tests on PR changes.
- **GitHub Actions for PR head `8b9c35efd2d72b529eb54e27d4759d8666fa85a4` completed SUCCESS**, 23 tests passed (17 SQL/RLS/rule tests + 6 client contract tests). A preceding run failed on a now-corrected stale one-tap client-test expectation, not a server bug.
- **Live status remains unchanged** as last queried: production world HP 500000, version 0, enabled=false; zero pending/settled production battles. No production DDL, merge or deployment was performed in this follow-up.
- **Still blocked:** migration must be applied before any new UI uses the batch endpoint; staged authenticated HTTP end-to-end browser tests with real Google sessions on slow and normal connections; Cloudflare paused-client validation; rate-limit and abuse monitoring. A static/CI PASS is not a real-user E2E PASS.

