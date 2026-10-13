# THE INTERNET IS DYING

**Internet Chaos** — a minimal retro pixel web game. Hosted via Cloudflare Workers Static Assets.

## Status: V3 onboarding UI committed; live authentication NOT configured

### Live code paths
- `public/index.html` — public landing page, global-life preview, two **non-interactive** HEAL/KILL visual buttons, and sole active CTA **JOIN THE CHAOS**.
- `public/auth.html` — real **Supabase Auth** Google OAuth and email sign-in wiring; until a dedicated project is configured, buttons are disabled with a clear notice.
- `public/onboarding.html` — one-time nickname and character (HUMAN/BOT/ALIEN/GLITCH) flow.
- `public/arena.html` — guarded player Arena; its HP changes are **LOCAL DEMO ONLY**, not global votes or purchases.
- `public/flow.js` — routing and account/auth logic, plus unchanged weighted random and crit mechanics in the local Arena.
- `public/styles.css` — NES.css + original full-pixel responsive custom styling.
- `public/config.js` — placeholder for publicly shareable Supabase project URL + **publishable** key.
- `supabase/migrations/20261013_iid_profiles.sql` — private RLS profile table, case-insensitive unique nickname, immutable origin.

### V3 user flow

Landing → JOIN THE CHAOS → Google or email login → **first-time** nickname & character → Arena.

Returning authenticated users with a profile go straight to Arena.

There is **no advertising SDK** yet. The Arena includes a labelled, passive placeholder below the gameplay area; monetization must not obstruct registration or play.

### How to enable real login

**Do not reuse the existing Supabase database for another application. Create a DEDICATED Supabase project for THE INTERNET IS DYING first, with explicit owner approval.**

1. Create the dedicated Supabase project in the preferred organization and choose its plan.
2. Apply `supabase/migrations/20261013_iid_profiles.sql` via the Supabase SQL editor or migrations.
3. In Supabase Dashboard → Authentication, configure the **Google** OAuth provider with its Google client ID/secret. Add the required Google redirect URI (Supabase's `/auth/v1/callback`) to the Google OAuth client.
4. Configure email auth (magic link by default; use an OTP email template if 6-digit codes are desired). Configure appropriate production SMTP and auth rate limits before launch.
5. In Authentication → URL Configuration, set the **Site URL** to `https://internetisdying.wwwxolf.workers.dev` and allow redirect URL(s):
   - `https://internetisdying.wwwxolf.workers.dev/onboarding.html`
   - for local testing, explicitly approved local redirect URL(s) if needed
6. Add project values to `public/config.js`:
   - `supabaseUrl`: the dedicated project's `https://<project-ref>.supabase.co` URL
   - `supabasePublishableKey`: a **publishable key** (`sb_publishable_...`), not a secret key
7. Never commit database passwords, Google OAuth secrets, Supabase secret/service-role keys, JWT secrets or payment provider secrets to this public GitHub repository.
8. Wait for Cloudflare deployment to become Ready, then test Google and email flows and row-level security end to end.

### IMPORTANT: features not yet live

- No production accounts until Supabase is configured.
- No live HP, shared global votes, founder power, premium, payment, ad network, server-side RNG, or Hall of Fame ranking.
- Clicking HEAL/KILL on the landing page **does nothing**. When account setup is complete, the Arena shows a clearly labelled browser-local simulation.
- Local browser random, localStorage and local daily limits must never be trusted for competitive game security.

### Deployment

This is **Cloudflare Workers Static Assets**. `wrangler.jsonc` points to `public/`.
The Cloudflare Worker is connected to the GitHub `main` branch.

Existing deploy command: `npx wrangler deploy`; build command: `exit 0`. After committing, check that the latest Cloudflare build is Ready.

### Fonts and visuals

Press Start 2P for prominent headings/buttons; Pixelify Sans for readable pixel body text; NES.css for retro components; original pixel-heart SVG and heartbeat.

### License

No license chosen for this repository; third-party dependencies keep their respective licenses.
