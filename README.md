# THE INTERNET IS DYING

A minimal pixel-style landing page prototype for the **Internet Chaos** social game.

## Current state: design prototype only

- **Tech:** static HTML + custom CSS + [NES.css](https://nostalgic-css.github.io/NES.css/).
- **Works:** responsive landing page, retro heart/HP bar, HEAL and KILL preview buttons, local character selection (HUMAN/BOT/ALIEN/GLITCH), nickname stored locally, random demo power (including critical multipliers), illustrative Hall of Fame, UTC countdown.
- **Not implemented:** actual sign-up/authentication, email verification, shared HP, global votes, Founders multipliers, payment/boosters, server-side randomness, anti-bot, leaderboard or real-time storage.
- **IMPORTANT:** No emails, payments or global votes are accepted by this prototype. The page explicitly labels its preview-only information. A demo action affects only the current browser display; do not mistake it for a public vote.

## Preview

Open \`index.html\` in a modern browser. Some pixel styling requires an internet connection to load the NES.css and Google Fonts CDNs.

## Publish on Cloudflare Pages

1. Sign in at https://dash.cloudflare.com/ .
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Authorize/select GitHub repo \`wwwxolf/internetisdying\` on branch \`main\`.
4. For static HTML: choose a suitable static/no-framework preset; leave build command blank and use \`/\` as the output directory (or select the directory that contains \`index.html\`, per the current dashboard).
5. Deploy and open the \`.pages.dev\` URL shown by Cloudflare.

Cloudflare's dashboard labels and defaults may change; verify the deployment setup in the current UI.

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
