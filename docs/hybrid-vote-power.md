# NEXT CHAOS — Hybrid Vote Power V1

**Deployed migration:** `20261014063536_hybrid_vote_power_v1.sql` (Supabase). Frontend remains controlled rollout.

## Locked calculation

After voting closes for a UTC date, the server reads the sealed day's authenticated votes atomically under the existing day/world row locks.

- H: count of votes for DEFENSE / recovery / HEAL (green, LEFT)
- K: count of votes for CHAOS / damage / KILL (red, RIGHT)
- N = H + K.
- Minimum quorum: N >= 20; fewer votes or a tie returns 0 HP.
- Signed HP impact:

```
magnitude = round(12000 * N / (N + 160) * pow(abs(H - K) / N, 0.7))
impact = H > K ? +magnitude : -magnitude
```

A highly contested vote yields less impact even with millions of participants. Larger turnout increases the influence sublinearly. The maximum approaches 12,000 HP but never exceeds it. Actual applied HP is additionally bounded by World HP [0, 1,000,000], and both nominal and applied changes are recorded.

### Verified live read-only SQL examples

| H | K | Signed impact HP |
|---:|---:|---:|
| 100 | 20 | +3,872 |
| 10,000 | 9,920 | +250 |
| 200 | 1,000 | -7,972 |
| 10 | 10 | 0 |
| 0 | 20 | -1,333 |

## UI changes

- The DEFENSE/Global Firewall card is the first DOM and visual card (LEFT), with a green pixel sprite.
- The CHAOS/Bot Invasion card is second (RIGHT), with a red pixel sprite.
- The vote meter follows the same green-left / red-right order.
- No static per-option +-6,000 HP text. Instead both cards display **IMPACT SCALES WITH VOTES**.
- The app reads `projected_impact_hp` from server status. While PAUSED it clearly shows preview only. When open and below quorum, it shows minimum votes required.
- All visuals use crisp-edge pixel SVG icons, existing pixel fonts, and responsive two-column mobile layout.

## Safety and rollout

- No changes to World HP value, no votes created, no 30-day World cutoff.
- Both `iid_world.enabled` and `iid_chaos_control.enabled` remain false as of this migration.
- No cron jobs are created, started, or modified.
- Only the privileged scheduler can execute past-day settlement; votes still require Google auth and cannot be edited.
- Automated PGlite tests cover formula exactness, quorum, tie, cap, result persistence and idempotency.
- Production Google E2E and cron-in-staging tests are still pending; do not enable voting or World Decay without those gates.

## Follow-up

- Verify live static deployment via `/arena?v=hybrid-v1` after Cloudflare production deploy is Ready.
- Confirm first and second card order, pixel layout and verified status for a logged-in player.
- Review security, bot mitigation, resumed-scheduler catch-up and scalability before activation.
