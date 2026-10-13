# THE INTERNET IS DYING

A minimal pixel-style landing page prototype for the **Internet Chaos** social game.

## Current state: design prototype only

- **Tech:** static HTML + custom CSS + [NES.css](https://nostalgic-css.github.io/NES.css/).
- **Works:** responsive landing page, retro heart/HP bar, HEAL and KILL preview buttons, local character selection (HUMAN/BOT/ALIEN/GLITCH), nickname stored locally, random demo power (including critical multipliers), illustrative Hall of Fame, UTC countdown.
- **Not implemented:** actual sign-up/authentication, email verification, shared HP, global votes, Founders multipliers, payment/boosters, server-side randomness, anti-bot, leaderboard or real-time storage.
- **IMPORTANT:** No emails, payments or global votes are accepted by this prototype. The page explicitly labels its preview-only information. A demo action affects only the current browser display; do not mistake it for a public vote.

## Preview

Open `public/index.html` in a modern browser. Some styling requires loading the NES.css and Google Fonts CDNs.

## Deploy on Cloudflare Workers

This repository is configured for **Cloudflare Workers Static Assets** (not Pages) through `wrangler.jsonc`. The public landing page is `public/index.html`.

1. In Cloudflare **Workers & Pages**, use the existing Worker `internetisdying` connected to the GitHub repo `wwwxolf/internetisdying` branch `main`.
2. Use build command `exit 0` and deploy command `npx wrangler deploy`. Root directory `/`.
3. The Workers Builds pipeline uses `wrangler.jsonc` and uploads files from `public/` as static assets; no Worker JavaScript entry point is necessary.
4. When the build completes, open the Worker URL shown in the Cloudflare dashboard (usually on a `workers.dev` subdomain, not necessarily `pages.dev`).
5. If a previously started build failed, wait for a new commit-triggered build or use **Retry deployment**.

To update the public design, edit `public/index.html`. The original root `index.html` is retained only as a historical copy of the initial prototype; Workers deploys the `public/` version.

## Planned backend (not in this repository yet)

- Supabase email OTP and unique nickname
- One verified action per round
- Secure, server-side weighted random power and criticals
- One global HP ledger with atomic updates and audited settlements
- Balanced HEAL/KILL power and optional Founder bonuses
- Hall of Fame and World History
- Authentication abuse prevention, rate limits, and server-side bot checks
- Payment and weekly premium-power design **only after** fairness, pricing and security review

## Working design constants

- Title: **THE INTERNET IS DYING**
- Mode: **INTERNET CHAOS**
- Initial HP: **500,000 of 1,000,000** (fictional preview)
- Sides: **HEAL** and **KILL**
- Origins: **HUMAN, BOT, ALIEN, GLITCH**
- Theme: **NES.css as a component foundation**, original dark custom pixel layout.

Rule values and pay-to-win economics remain provisional pending balancing and security review.

## License

No explicit license has been selected for the original project files. Third-party dependencies retain their respective licenses.
