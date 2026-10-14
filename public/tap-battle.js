/* CHAOS TAP BATTLE V5.1 — browser-only ALPHA demonstration.
 * Not secure voting. Tap cap is NOT bot detection. Backend must own timing,
 * rolls, cooldown and world HP before any competitive release.
 *
 * Kept from V3:
 *  60% [0,500], 30% [501,2000], 9% [2001,10000], 1% [10001,25000]
 *  critical: 1% x3, 4% x2, 95% x1.
 */
export const MAX_TAPS = 50;
export const BATTLE_MS = 20000;
export const COUNTDOWN_MS = 3000;
export const MAX_HP = 1000000;
export const START_HP = 500000;

export function tapBonus(validTaps) {
  const taps = Math.min(MAX_TAPS, Math.max(0, Math.floor(Number(validTaps) || 0)));
  return Math.min(10, Math.floor(taps / 10) * 2);
}
export function rollPower(random = Math.random) {
  const rarity = random();
  const crit = random();
  const integer = (low, high) => low + Math.floor(random() * (high - low + 1));
  const base = rarity < .60 ? integer(0, 500)
    : rarity < .90 ? integer(501, 2000)
    : rarity < .99 ? integer(2001, 10000)
    : integer(10001, 25000);
  const multiplier = crit < .01 ? 3 : crit < .05 ? 2 : 1;
  return {base, multiplier, raw: base * multiplier};
}
export function finalPower(base, multiplier, validTaps) {
  return Math.round(base * multiplier * (1 + tapBonus(validTaps) / 100));
}
const byId = id => document.getElementById(id);
const fmt = value => Math.round(Math.max(0, value)).toLocaleString("en-US");
const todayUTC = () => new Date().toISOString().slice(0, 10);
const safeStorage = {
  get(key) {try {return localStorage.getItem(key);} catch (_) {return null;}},
  set(key, value) {try {localStorage.setItem(key, value);} catch (_) {}}
};

export function initTapBattle({userId, profile}) {
  const $ = byId;
  const key = "iid-arena-demo-v3:" + userId; // preserve existing local demo HP and cooldown
  let hp = START_HP, last = null;
  try {
    const stored = JSON.parse(safeStorage.get(key) || "null");
    if (stored && Number.isInteger(stored.hp) && stored.hp >= 0 && stored.hp <= MAX_HP) hp = stored.hp;
    if (stored && typeof stored.last === "string" && /^\d{4}-\d{2}-\d{2}$/.test(stored.last)) last = stored.last;
  } catch (_) {}
  let phase = "choose";
  let side = null, taps = 0, deadline = 0, battleEnd = 0;
  let ticking = null, fxTimer = null;

  const choosePanel = $("arena-decision");
  const battlePanel = $("tap-battle");
  const tapTarget = $("tap-target");
  const actionButtons = [...document.querySelectorAll("[data-arena-action]")];

  function persist() {
    safeStorage.set(key, JSON.stringify({hp, last}));
  }
  function renderHP() {
    const pct = hp / MAX_HP * 100;
    const color = hp <= 0 ? "#8a8f9d"
      : hp <= 250000 ? "#bf3654"
      : hp <= 500000 ? "#ff657d"
      : hp <= 750000 ? "#d8c66b" : "#72dfa6";
    const state = hp <= 0 ? "DEAD"
      : hp <= 250000 ? "NEAR DEATH"
      : hp <= 500000 ? "CRITICAL"
      : hp <= 750000 ? "STABLE" : "RECOVERING";
    $("arena-hp").textContent = fmt(hp);
    $("arena-fill").style.width = pct + "%";
    $("arena-fill").style.background =
      "repeating-linear-gradient(90deg," + color + " 0 16px,transparent 16px 19px)";
    $("arena-status").textContent = "● " + state;
    $("arena-status").style.color = color;
    $("arena-percent").textContent = pct.toFixed(1) + "% LIFE REMAINING";
    $("arena-progress").setAttribute("aria-valuenow", String(Math.round(pct)));
    $("heart-zone").dataset.stage = hp <= 0 ? "dead" : hp <= 250000 ? "danger" : "critical";
  }
  function showResult(title, message) {
    $("arena-result-title").textContent = title;
    $("arena-result-text").textContent = message;
    $("arena-result").hidden = false;
    $("arena-result").scrollIntoView({behavior: "smooth", block: "nearest"});
  }
  function clearTick() {
    if (ticking !== null) {clearInterval(ticking); ticking = null;}
    if (fxTimer !== null) {clearTimeout(fxTimer); fxTimer = null;}
  }
  function lockChoices() {
    const used = last === todayUTC();
    actionButtons.forEach(button => {
      button.disabled = used || phase !== "choose";
      button.setAttribute("aria-disabled", String(button.disabled));
    });
    $("arena-move-rule").textContent = used
      ? "ACTION USED TODAY (UTC) • TRY AGAIN TOMORROW"
      : "ONE LOCAL ACTION / UTC DAY ◆ RANDOM POWER + TAP BONUS";
  }
  function choose(action) {
    // A second click during countdown/battle is ignored.
    if (phase !== "choose") return;
    if (last === todayUTC()) {
      showResult("NEXT TURN TOMORROW_", "Your local demo action was already used today (UTC). Use LOCAL DEMO CONTROLS to reset the preview.");
      lockChoices(); return;
    }
    if (action !== "HEAL" && action !== "KILL") return;
    side = action; taps = 0; phase = "countdown";
    deadline = Date.now() + COUNTDOWN_MS;
    $("arena-result").hidden = true;
    choosePanel.hidden = true;
    battlePanel.hidden = false;
    $("tap-battle").dataset.side = side.toLowerCase();
    $("tap-side").textContent = side;
    $("tap-count").textContent = "0 / 50";
    $("tap-bonus").textContent = "+0%";
    $("tap-charge").style.width = "0%";
    $("tap-combo").textContent = "READY!";
    tapTarget.disabled = true;
    tapTarget.hidden = true;
    $("tap-countdown").hidden = false;
    $("tap-countdown").textContent = "3";
    $("tap-time").textContent = "20.0";
    lockChoices();
    clearTick();
    ticking = setInterval(tick, 60);
    tick();
  }
  function startTapping(startAt) {
    if (phase !== "countdown") return;
    phase = "tapping";
    battleEnd = startAt + BATTLE_MS;
    $("tap-countdown").hidden = true;
    tapTarget.hidden = false;
    tapTarget.disabled = false;
    $("tap-combo").textContent = "TAP FAST!";
    $("tap-time").textContent = "20.0";
    if (Date.now() >= battleEnd) finish(); // background tab must not extend allotted time
  }
  function tick() {
    if (phase === "countdown") {
      const ms = deadline - Date.now();
      if (ms <= 0) {
        startTapping(deadline);
      } else {
        $("tap-countdown").textContent = String(Math.ceil(ms / 1000));
      }
    }
    if (phase === "tapping") {
      const remain = Math.max(0, battleEnd - Date.now());
      $("tap-time").textContent = (remain / 1000).toFixed(1);
      if (remain <= 0) finish();
    }
  }
  function tap() {
    if (phase !== "tapping") return;
    // No tap is counted after elapsed deadline.
    if (Date.now() >= battleEnd) {finish(); return;}
    if (taps >= MAX_TAPS) return;
    taps += 1;
    const bonus = tapBonus(taps);
    $("tap-count").textContent = taps + " / " + MAX_TAPS;
    $("tap-bonus").textContent = "+" + bonus + "%";
    $("tap-charge").style.width = (taps / MAX_TAPS * 100) + "%";
    $("tap-combo").textContent = taps >= MAX_TAPS ? "MAX CHARGE!"
      : taps % 10 === 0 ? "COMBO! +" + bonus + "%"
      : taps >= 40 ? "ALMOST THERE!" : taps >= 20 ? "KEEP GOING!" : "TAP! TAP!";
    tapTarget.classList.remove("tap-punch");
    void tapTarget.offsetWidth; // restart a short CSS pixel-punch animation
    tapTarget.classList.add("tap-punch");
    if (fxTimer !== null) clearTimeout(fxTimer);
    fxTimer = setTimeout(() => tapTarget.classList.remove("tap-punch"), 120);
    if (taps >= MAX_TAPS) finish(); // full charge ends early, no need to wait
  }
  function finish() {
    if (phase !== "tapping") return;
    phase = "finished";
    clearTick();
    tapTarget.disabled = true;
    tapTarget.hidden = true;
    battlePanel.hidden = true;
    choosePanel.hidden = false;
    const roll = rollPower();
    const bonus = tapBonus(taps);
    const final = finalPower(roll.base, roll.multiplier, taps);
    const before = hp;
    hp = Math.max(0, Math.min(MAX_HP, hp + (side === "HEAL" ? final : -final)));
    last = todayUTC();
    persist(); renderHP(); lockChoices();
    const title = taps === MAX_TAPS ? "MAX CHARGE! +10%"
      : roll.multiplier === 3 ? "SUPER CRITICAL ×3!"
      : roll.multiplier === 2 ? "CRITICAL ×2!"
      : side + " POWER REVEALED!";
    const line = side + " • " + taps + "/50 TAPS • BONUS +" + bonus
      + "% • BASE " + fmt(roll.base) + " × CRIT " + roll.multiplier
      + " × TAP " + (1 + bonus / 100).toFixed(2)
      + " = " + fmt(final) + " HP";
    showResult(title, line + ". Applied " + (side === "HEAL" ? "+" : "−")
      + fmt(Math.abs(hp - before)) + " HP. LOCAL DEMO ONLY — not a world vote.");
  }
  function reset() {
    clearTick();
    phase = "choose"; side = null; taps = 0; last = null; hp = START_HP;
    battlePanel.hidden = true; tapTarget.hidden = true;
    choosePanel.hidden = false;
    $("arena-result").hidden = true;
    persist(); renderHP(); lockChoices();
    showResult("LOCAL DEMO RESET_", "Preview restored to 500,000 HP and today's demo action unlocked. Your real profile is unchanged.");
  }

  actionButtons.forEach(button => button.addEventListener("click", () => choose(button.dataset.arenaAction)));
  tapTarget.addEventListener("click", tap);
  $("arena-reset").addEventListener("click", reset);
  document.addEventListener("visibilitychange", tick);
  renderHP();
  lockChoices();
  if (last === todayUTC()) {
    showResult("NEXT TURN TOMORROW_", "Today's local demo action is already completed. Come back after UTC midnight or use LOCAL DEMO CONTROLS for testing.");
  }
}
