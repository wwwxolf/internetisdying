# WORLD_001 — Three Crumbs

The new public homepage is a deterministic, account-free chicken routing puzzle.
The former landing page remains at `/multiverse.html`; the authenticated V4 arena
remains at `/arena.html`. Existing accounts, SQL, scheduler and HP are not changed.
Puzzle outcomes do not contribute to V4 global HP or competitive rankings.

## Rules
- Six-by-six board, three crumbs maximum; walls are impassable.
- Each step: find reachable crumbs within three walking steps; choose nearest,
  then earliest placed. Follow a shortest path with right/down/left/up tie order.
- With no crumb in range, head for the server.
- Reaching the coop or server ends the run. Repeated state ends a loop safely.
- SAVE wins by reaching the coop; KILL wins at the server after eating all three.
- Local records store only successful move counts; they are not verified rankings.
- Challenge links encode a stable board ID and faction. They never serialize code,
  arbitrary layouts, personal data, or a claimed competitive score.

## Delivery
Eight fixed boards are validated for both goals at their par move counts. Future
world cards describe planned games and are not presented as playable.
`node --test tests/peck-puzzle.test.mjs` validates paths, both win conditions,
immutability, illegal inputs, solvability, and exact challenge round trips.
Legacy landing assertions now target the preserved multiverse page. Production
verification checks the new homepage, engine, and eight-board catalog as well as
all existing V4 assets. No dependencies added.

## Verification limits
Local browser preview was unavailable in the managed runtime. Deployment uses the
existing regression gate; live browser checks follow publication where available.
Device progress is optional: storage denial must not block play. Native sharing
falls back to clipboard and then a selectable link. Motion preference shortens
replay and disables smooth scrolling. Real mobile hardware remains a follow-up.
