# THE INTERNET IS DYING — V2 Game Economy Proposal
Status: PROPOSED, NOT DEPLOYED (2026-10-14). All production parameters remain unchanged.

## Current audit
20-second battle, 50 taps, 3-second ready phase, 6 four-hour UTC windows. Base power odds: 60% 0–500; 30% 501–2000; 9% 2001–10000; 1% 10001–25000. Critical odds: 95% x1, 4% x2, 1% x3; tap bonus +2% per ten, max +10%. Theoretical maximum 82,500 power, mean about 1,314.6 before tap bonuses. Daily Chaos maximum 12,000 HP and quorum 20. Decay 800–1000 HP every six hours (mean 3,600/day) when enabled. Major current UX risk: battles need reliable server auto-settlement when the browser closes.

## Recommended V2 per-player battle
Keep 6 optional 4-hour UTC windows; 2-second ready timer; **12-second sprint**; **24 maximum verified taps**. Server bonus: floor(taps/4)%, capped at 6%, i.e. 4/8/12/16/20/24 taps grant 1/2/3/4/5/6%. Offer accessible HOLD input that can earn the same capped bonus.

Independent random base-power tiers:
| Tier | Chance | Inclusive value |
|---|---:|---:|
| NORMAL | 55% | 100–249 |
| BOOST | 30% | 250–599 |
| SURGE | 12% | 600–1299 |
| LEGENDARY | 3% | 1300–2500 |

CRIT: 90% x1.00, 9% x1.50, 1% x2.00. Use integer basis points for multipliers. Personal Power = round(base × crit × (1 + bonusPct/100)) once on server. Mean base = 394.265; mean crit multiplier 1.055; with illustrative +4% tap bonus, expected Personal Power ~432.59; absolute max 5300. Store versioned formulas; never re-rate historical battles.

## Faction influence / world HP
Keep a visible distinction between instant personal battle POWER and faction influence. Player War Influence = round(100 × sqrt(PersonalPower/400)), so average 400 power gives 100 influence and a 5300 jackpot gives 364 influence.

Group verified battles by original UTC four-hour slot. Let S and K be summed influence and N the count of battles in the slot. Let Q=(S-K)/(S+K), Q=0 when no battle. Exactly once at window close (plus a 90-second grace for late settlements), WorldBattleHP = round(6000 × N/(N+2) × tanh(Q/0.12)). Maximum shift per slot is 6000 HP, per day 36000 HP. Server auto-settles pending battles and records immutable results. Live faction bar may show a forecast; label it projected until closing time. Use deterministic event ledger, row locks, UTC timestamp, no double application.

## World Decay
Four pulses/day at 00,06,12,18 UTC. A = unique users with a settled battle in the trailing 24 hours as of each pulse timestamp.
BaseDecay = round(600 + 1900 × min(1, sqrt(A/200))) HP per pulse, then randomized once server-side from 90% to 110%, stored in decay ledger.
At A=0: 600/pulse; A=10: 1025; A=100: 1944; A>=200: 2500. Clearly label this as NETWORK LOAD; no invisible side- or paid-user-specific multiplier. Keep decay disabled until explicit rollout.

## Daily Chaos
One authenticated locked vote per UTC day. Reduce beta quorum to 10. For N votes and fraction margin M=abs(SAVE-KILL)/N, if N<10 or tie: 0. Otherwise ChaosHP=sign(SAVE-KILL) × round((3000+9000×(1-exp(-N/150))) × M^0.6), bounded by +/-12000. Examples: N=20 unanimous ~4123; N=100 split 60/40 ~2810; N=1000 split 60/40 ~4564. Daily Chaos remains separate from battles. Maintain verification, audit and rate-limiting.

## Forecast, NOT actual gameplay data
Under simulated independent actions, about 2 battles/user/day, average +4% tapping, no Chaos effects:
- 10 active users: 55% SAVE roughly -1000 World HP/day
- 100 users: 55% SAVE roughly +4400/day
- 1000 users: 55% SAVE roughly +11900/day
- 100k users: idealized large-population approximation roughly +14600/day
At 50% faction balance, World HP declines by average load-based decay. These figures vary greatly with sampling, criticals and participation. Validate by playtesting rather than claiming optimal enjoyment.

## Rollout requirements
Preserve current live database and history. Build versioned migration; include server auto-settle, 24 tap ceiling, 12-second timing, decimal critical schema, influential 4-hour battle war ledger, adaptive decay and revised chaos. Test slot boundaries, CRIT odds, rounding, score caps, reconnect recovery, late settlements, no-tap cases, cross-window idempotency, and concurrent requests. Weekly faction recap based on won windows creates a 7-day short-term accomplishment. Cosmetics only; never sell extra battles or improved critical odds. Compare 12s/24 taps with 10s/20 taps in real player testing.

Decision status: this is a complete implementable starting specification, pending QA and product approval; not a production migration.
