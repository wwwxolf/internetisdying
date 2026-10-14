import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {wibDay,activeSlot,evaluateWindows,WINDOWS_WIB} from "../public/wib-battle-windows.js";
const iso=x=>Date.parse(x);
const state=(day,used=Array(6).fill(false))=>({
  window_day:day,window_used:used,window_timezone:"Asia/Jakarta"
});
test("WIB midnight starts first slot and resets at 00:00 UTC+7",()=>{
 assert.equal(wibDay(iso("2026-10-14T16:59:59Z")),"2026-10-14");
 assert.equal(wibDay(iso("2026-10-14T17:00:00Z")),"2026-10-15");
 assert.equal(activeSlot(iso("2026-10-14T16:59:59Z")),5);
 assert.equal(activeSlot(iso("2026-10-14T17:00:00Z")),0);
 assert.equal(activeSlot(iso("2026-10-14T20:59:59Z")),0);
 assert.equal(activeSlot(iso("2026-10-14T21:00:00Z")),1);
});
test("Each 4-hour WIB window has correct state and minute countdown",()=>{
 assert.deepEqual(WINDOWS_WIB,[["00.00","03.59"],["04.00","07.59"],["08.00","11.59"],["12.00","15.59"],["16.00","19.59"],["20.00","23.59"]]);
 const t=iso("2026-10-14T05:10:00Z"); // 12:10 WIB
 const a=evaluateWindows(state("2026-10-14",[true,false,true,false,false,false]),t);
 assert.equal(a.slot,3);
 assert.deepEqual(a.windows.map(w=>w.state),["USED","MISSED","USED","ACTIVE","LOCKED","LOCKED"]);
 assert.equal(a.minutesLeft,230);
 assert.equal(a.currentUsed,false);
 const used=evaluateWindows(state("2026-10-14",[true,false,true,true,false,false]),t);
 assert.equal(used.currentUsed,true);
 assert.equal(used.windows[3].state,"USED");
});
test("Stale server day blocks all local action until a verified refresh",()=>{
 const t=iso("2026-10-14T17:00:01Z");
 assert.equal(evaluateWindows(state("2026-10-14"),t).ready,false);
 assert.equal(evaluateWindows(state("2026-10-15"),t).ready,true);
 assert.equal(evaluateWindows({...state("2026-10-15"),window_used:["false",0,0,0,0,0]},t).ready,false);
});
test("Arena has exactly 6 visual boxes and never shows 1/6 progress copy",async()=>{
 const html=await readFile("public/arena.html","utf8");
 const ui=await readFile("public/global-battle.js","utf8");
 const css=await readFile("public/arena.css","utf8");
 assert.equal((html.match(/id="battle-window-\d"/g)||[]).length,6);
 assert.match(html,/BATTLE WINDOWS_/);
 assert.match(html,/role="list"/);
 assert.match(html,/arena\.css\?v=7/);
 assert.match(html,/flow\.js\?v=19/);
 assert.match(ui,/evaluateWindows\(state,now\(\)\)/);
 assert.match(ui,/SLOT USED.*NEXT WINDOW IN/);
 assert.doesNotMatch(ui,/\d\/6 IN LAST 24H|rolling_count.*\/6/);
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
});
