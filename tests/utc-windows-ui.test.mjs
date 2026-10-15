import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {utcDay,activeSlot,evaluateWindows,WINDOWS_UTC} from "../public/utc-battle-windows.js";
const iso=t=>Date.parse(t);
const state=(day,used=Array(6).fill(false))=>({
 window_day:day,window_used:used,window_timezone:"UTC"
});
test("UTC boundary is midnight UTC, not midnight Asia/Jakarta",()=>{
 assert.equal(utcDay(iso("2026-10-14T23:59:59Z")),"2026-10-14");
 assert.equal(utcDay(iso("2026-10-15T00:00:00Z")),"2026-10-15");
 assert.equal(activeSlot(iso("2026-10-14T23:59:59Z")),5);
 assert.equal(activeSlot(iso("2026-10-15T00:00:00Z")),0);
 assert.equal(activeSlot(iso("2026-10-15T03:59:59Z")),0);
 assert.equal(activeSlot(iso("2026-10-15T04:00:00Z")),1);
 // At 18:05 Jakarta time, UTC is 11:05 and window #3 is active.
 assert.equal(activeSlot(iso("2026-10-14T11:05:00Z")),2);
});
test("Six fixed UTC windows correctly show USED / MISSED / ACTIVE / LOCKED",()=>{
 assert.deepEqual(WINDOWS_UTC,[["00.00","03.59"],["04.00","07.59"],
  ["08.00","11.59"],["12.00","15.59"],["16.00","19.59"],["20.00","23.59"]]);
 const t=iso("2026-10-14T11:10:00Z");
 const a=evaluateWindows(state("2026-10-14",[true,false,false,false,false,false]),t);
 assert.equal(a.slot,2);
 assert.deepEqual(a.windows.map(w=>w.state),["USED","MISSED","ACTIVE","LOCKED","LOCKED","LOCKED"]);
 assert.equal(a.minutesLeft,50);
 assert.equal(a.currentUsed,false);
 const used=evaluateWindows(state("2026-10-14",[true,false,true,false,false,false]),t);
 assert.equal(used.currentUsed,true);
 assert.equal(used.windows[2].state,"USED");
 assert.equal(used.minutesLeft,50);
});
test("Stale or mismatched timezone data always fails closed",()=>{
 const t=iso("2026-10-15T00:00:01Z");
 assert.equal(evaluateWindows(state("2026-10-14"),t).ready,false);
 assert.equal(evaluateWindows(state("2026-10-15"),t).ready,true);
 assert.equal(evaluateWindows({...state("2026-10-15"),window_timezone:"Asia/Jakarta"},t).ready,false);
 assert.equal(evaluateWindows({...state("2026-10-15"),window_used:["false",0,0,0,0,0]},t).ready,false);
});
test("Arena shows UTC exactly once in battle windows heading, never in tiles",async()=>{
 const html=await readFile("public/arena.html","utf8");
 const ui=await readFile("public/global-battle.js","utf8");
 const css=await readFile("public/arena.css","utf8");
 assert.equal((html.match(/id="battle-window-\d"/g)||[]).length,6);
 const section=html.slice(html.indexOf('<section class="battle-windows"'),html.indexOf("</section>",html.indexOf('<section class="battle-windows"')));
 assert.equal((section.match(/\bUTC\b/g)||[]).length,2); // 1 visible heading + one accessible section label
 assert.match(section,/BATTLE WINDOWS_ <span class="battle-timezone">UTC<\/span>/);
 assert.ok(!section.includes("WIB"));
 assert.match(html,/arena\.css\?v=11/);
 assert.match(html,/flow\.js\?v=33/);
 assert.match(ui,/evaluateWindows\(state,now\(\)\)/);
 assert.match(ui,/SLOT USED.*NEXT WINDOW IN/);
 assert.doesNotMatch(ui,/\/6 IN LAST 24H|rolling_count.*\/6|WIB/);
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
});
