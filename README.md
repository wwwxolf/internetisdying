# THE INTERNET IS DYING

**Internet Chaos** — a minimal retro pixel web game. Hosted via Cloudflare Workers Static Assets.

## Status: dedicated Supabase database connected; login providers NOT YET ENABLED

### Live code paths
- `public/index.html` — public landing page, global-life preview, two **non-interactive** HEAL/KILL visual buttons, and sole active CTA **JOIN THE CHAOS**.
- `public/auth.html` — real **Supabase Auth** Google OAuth and email sign-in wiring; until providers and redirect URLs are configured, buttons remain disabled with a clear notice.
- `public/onboarding.html` — one-time nickname and character (HUMAN/BOT/ALIEN/GLITCH) flow.
- `public/arena.html` — guarded player Arena; its HP changes are **LOCAL DEMO ONLY**, not global votes or purchases.
- `public/flow.js` — routing and account/auth logic, plus unchanged weighted random and crit mechanics in the local Arena.
- `public/styles.css` — NES.css + original full-pixel responsive custom styling.
- `public/config.js` — dedicated game Supabase URL + **publishable** key, with separate provider readiness flags (both intentionally false until setup finishes).
- `supabase/migrations/20261013_iid_profiles.sql` — private RLS profile table, case-insensitive unique nickname, immutable origin.

### V3 user flow

Landing → JOIN THE CHAOS → Google or email login → **first-time** nickname & character → Arena.

Returning authenticated users with a profile go straight to Arena.

There is **no advertising SDK** yet. The Arena includes a labelled, passive placeholder below the gameplay area; monetization must not obstruct registration or play.

### Dedicated backend (created)

- Supabase project: `internet-is-dying` in Olf Hub, region Singapore.
- Project dashboard: https://supabase.com/dashboard/project/wywrahaqpocueddxmjjq
- Browser URL/key: already connected in `public/config.js`. This is a **publishable** key only. NO secret/service-role key is committed.
- Migration `supabase/migrations/20261013_iid_profiles.sql` applied successfully.
- RLS audit: enabled, two policies, case-insensitive unique nickname index, no anonymous SELECT, no authenticated UPDATE; security/performance advisors returned no warnings.

### Owner setup still required before real sign-in

1. In [Supabase Authentication URL Configuration](https://supabase.com/dashboard/project/wywrahaqpocueddxmjjq/auth/url-configuration), set:
   - **Site URL:** `https://internetisdying.wwwxolf.workers.dev`
   - **Redirect URL allow-list:** `https://internetisdying.wwwxolf.workers.dev/onboarding.html`
2. In Authentication → Providers → Email, review email sign-in availability and configure a production SMTP sender (the built-in sender is restricted for public launch). The current flow supports **magic links** and optional **6-digit OTP** if the email template produces codes.
3. In Google Cloud, configure a Web OAuth application. Add the authorized redirect URI `https://wywrahaqpocueddxmjjq.supabase.co/auth/v1/callback`. Configure the OAuth consent screen and allowed test users/publishing status as required.
4. In Supabase Authentication → Providers → Google, enable Google and enter the OAuth client ID/secret **in Supabase Dashboard**, never GitHub/chat.
5. When email delivery & redirect URLs have been tested, set `emailAuthReady: true` in `public/config.js`. Once Google OAuth is tested, set `googleAuthReady: true` there independently.
6. Confirm latest Cloudflare Workers deployment is Ready; test both login methods, unique nickname rejection, returning-player routing and security policies end to end.

**Security:** Do not commit or share Supabase secret/service-role keys, DB passwords, Google OAuth client secrets or mail SMTP credentials in the public repository.

### IMPORTANT: features not yet live

- No production sign-in until redirect URLs, provider settings, mail delivery and provider readiness flags are configured.
- No live HP, shared global votes, founder power, premium, payment, ad network, server-side RNG, or Hall of Fame ranking.
- Clicking HEAL/KILL on the landing page **does nothing**. When account setup is complete, the Arena shows a clearly labelled browser-local simulation.
- Local browser random, localStorage and local daily limits must never be trusted for competitive game security.

## Chaos Arena V5.1 — Tap Battle (local demo)

The Arena now features **HEAL / KILL → 3, 2, 1 countdown → 20-second tap battle → power reveal**.

- **50 counted taps maximum.** Reaching 50 ends the battle early; otherwise it ends after 20 actual elapsed seconds.
- **Tap bonus:** 0–9 → 0%; 10–19 → 2%; 20–29 → 4%; 30–39 → 6%; 40–49 → 8%; 50 → **10% max**.
- **Final simulated power:** `Math.round(basePower * criticalMultiplier * (1 + tapBonus / 100))`.
- **Weighted random distribution and crit odds unchanged:** base power 60% (0–500), 30% (501–2,000), 9% (2,001–10,000), 1% (10,001–25,000); crit 95% ×1, 4% ×2, 1% ×3.
- Preserves per-account browser-local HP/UTC cooldown using existing key `iid-arena-demo-v3:<user id>`. The expandable **LOCAL DEMO CONTROLS** panel allows reset for testing.
- **This is NOT anti-bot protection.** The browser can be manipulated to fake clicks, time, localStorage or requests. **No production world votes or global HP updates are performed.**
- **For real launch:** server-authoritative timed sessions, one accepted vote per verified account/day, transaction-safe global HP settlement, and explicit bot/rate-limit controls are required.
- Files: `public/tap-battle.js` (pure bonus/roll helpers + interactive flow), `public/tap-battle.css` (responsive battle UI), `public/arena.html` (screen markup). Authentication remains in `public/flow.js`.
- The ad slot remains a visual placeholder. No advertisements run during gameplay.

### Deployment

This is **Cloudflare Workers Static Assets**. `wrangler.jsonc` points to `public/`.
The Cloudflare Worker is connected to the GitHub `main` branch.

Existing deploy command: `npx wrangler deploy`; build command: `exit 0`. After committing, check that the latest Cloudflare build is Ready.

### Fonts and visuals

Press Start 2P for prominent headings/buttons; Pixelify Sans for readable pixel body text; NES.css for retro components; original pixel-heart SVG and heartbeat.

### License

No license chosen for this repository; third-party dependencies keep their respective licenses.
