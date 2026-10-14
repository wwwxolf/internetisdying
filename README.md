# THE INTERNET IS DYING

Pixel browser game hosted with Cloudflare Workers Static Assets (`public/`).

## Status — 2026-10-14

- Supabase: `internet-is-dying` / `wywrahaqpocueddxmjjq`.
- Migration **applied**: `20261014033444_global_battle_engine`. The additive `20261014060500_batch_tap_acknowledgements` migration is **only in this draft branch**; not yet applied to live Supabase. Production stays paused.
- Production world: **500,000 HP**, version **0**, **0 battles**, **paused** (`enabled=false`).
- This branch adds the production client to `/arena.html` and preserves the old browser-only game at `/demo.html`. These frontend changes have **not been deployed** by this task.
- Existing Cloudflare site still shows the old local demo. An existing Google-authenticated profile was observed; fresh OAuth and a real battle through the new client remain pending.
- No ads, purchases or payments. Share-card rendering is deferred.

See [verification and rollout notes](docs/global-battle-verification.md).

## Production flow and rules

Google sign-in → nickname/origin in `iid_profiles` → start RPC → 3-second countdown → **20-second** tapping window → settlement RPC → permanent history and UTC monthly summary.

The browser sends only action/request UUID, battle UUID, and the next tap sequence. It never supplies HP, random rolls, bonus, timestamps, or a tap total.

- One pending session per user. New requests/reloads resume it, even after its timer expires. No cancel/reroll endpoint.
- Maximum 50 server-confirmed taps. The latency-tolerant client registers touches immediately and sends monotonically increasing absolute totals in batches of at most 10; the server validates session window, 40ms per newly claimed tap, identity, sequence cap and idempotent retries. A second (legacy) one-tap RPC remains available, but the new client uses only `iid_battle_tap_batch`. Reaching 50 does **not** shorten the 20-second server battle. Mobile UI distinguishes local touches from server-confirmed bonus. This does **not** prove human tapping.
- Bonus 0/2/4/6/8/10% at 0/10/20/30/40/50 taps.
- Base distribution: 60% inclusive 0–500; 30% 501–2,000; 9% 2,001–10,000; 1% 10,001–25,000.
- Critical: 95% ×1, 4% ×2, 1% ×3. Power = `round(base * critical * (100 + bonus) / 100)`.
- Server RNG uses random UUID v4 bits with rejection sampling; generated only inside settlement.
- Shared HP clamps to 0…1,000,000. Both rolled power and actually applied HP are stored.
- **4-hour cooldown from successful settlement**, at most 6 settlements in the preceding rolling 24 hours. A disconnected session settles on return; cooldown/monthly accounting begin then. No background settlement job is installed.
- Calendar month is UTC, by settlement timestamp. No card at 0; Common 1–14, Rare 15–44, Legendary 45–89, Ancestral 90+.
- Summary includes nickname, battle count, HEAL/KILL counts, and actually applied HEAL/KILL HP.

## Database API and security

| Object | Purpose |
|---|---|
| `iid_profiles` | Existing owner-only profile table |
| `iid_world` | Client-readable singleton HP, pause flag and version |
| `iid_battles` | Owner-only SELECT; session and permanent result |
| `iid_battle_start(p_request_id,p_action)` | Idempotent start/resume |
| `iid_battle_tap(p_battle_id,p_seq)` | Legacy idempotent one-tap acknowledgement |
| `iid_battle_tap_batch(p_battle_id,p_total)` | New bounded server-verified batch acknowledgement |
| `iid_battle_settle(p_battle_id)` | Atomic RNG, HP and history; retry returns original |
| `iid_battle_status()` | World, active/latest battle, cooldown and monthly summary |

Public RPCs are security-invoker wrappers. Checked implementations live in unexposed `iid_private`, with empty search paths and explicit EXECUTE grants. Every entry checks Google app metadata, a Google identity, an active auth session, a non-deleted/non-banned user and a profile. Internal identity/RNG helpers are not client-callable.

Lock order is profile → battle → world. A unique partial index enforces one pending session. Clients have no INSERT/UPDATE/DELETE rights on game tables. Battle user IDs have no cascading auth foreign key, so account deletion cannot erase history.

Tap caps/timing are **not proof of a human**: scripts can submit valid paced requests. External throttling, abuse monitoring and realistic latency tests remain rollout considerations. The client does not wait before registering additional touches. It does wait for a batch acknowledgement before flushing the next bounded batch. Lost packets or extreme latency can still reduce acknowledged taps at the 20-second deadline; test on real phones before rollout. Network failure never produces fabricated success or a fallback to demo mode.

## Development

```sh
pnpm install --frozen-lockfile
pnpm test
node tests/qa-server.mjs
```

Local visual fixtures: `http://127.0.0.1:4387/__qa` (paused) and `/__qa?mode=ready` (simulated server). They do not call Supabase and are outside the deployed assets. SQL tests execute actual migrations in PGlite with synthetic auth fixtures and real PostgreSQL roles/RLS.

## Deployment and rollback

`wrangler.jsonc` serves `public/`. Existing project documentation identifies GitHub `main` as Cloudflare's production branch. Keep this implementation on a review branch until readiness checks are complete. Local migration filenames are aligned to the recorded live migration versions.

Operator-only pause/resume:

```sql
-- Pause NEW sessions; existing sessions remain settleable:
update public.iid_world set enabled=false where id=1;
-- Only after deployment and authenticated end-to-end checks:
-- update public.iid_world set enabled=true where id=1;
```

Never reset HP or delete real history for rollback: pause or roll back the client. Public configuration is in `public/config.js`; never commit service-role keys, OAuth secrets or database passwords.

## License

No repository license chosen. Third-party packages retain their licenses.
