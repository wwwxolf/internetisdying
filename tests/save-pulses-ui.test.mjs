import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Landing uses SAVE vs KILL and shows read-only Global Pulses below world entry",async()=>{
  const html=await readFile("public/index.html","utf8");
  const btn=html.indexOf('id="join-btn"'),counter=html.indexOf('id="global-pulses-total"');
  assert.ok(btn>0&&counter>btn,"Global Pulses must be below primary CTA");
  assert.match(html,/GLOBAL PULSES_/);

  assert.match(html,/id="global-pulses-total"[^>]*>—/);
  assert.match(html,/>SAVE</);
  assert.match(html,/>KILL</);
  assert.doesNotMatch(html,/> HEAL</);
  assert.match(html,/src="\.\/global-pulses\.js\?v=1"/);
  assert.match(html,/ENTER WORLD/);
});
test("Arena player-facing actions use SAVE without changing internal HEAL protocol",async()=>{
  const arena=await readFile("public/arena.html","utf8");
  const global=await readFile("public/global-battle.js","utf8");
  const demo=await readFile("public/tap-battle.js","utf8");
  const report=await readFile("public/world-return.js","utf8");
  assert.match(arena,/data-arena-action="HEAL" aria-label="Save the internet"/);
  assert.match(arena,/<strong class="choice-title">SAVE<\/strong>/);
  assert.match(arena,/id="tap-side">SAVE<\/span>/);
  assert.match(arena,/WORLD SAVE/);
  assert.doesNotMatch(arena,/>HEAL<\/strong>|id="tap-side">HEAL/);
  assert.match(global,/r\.action==='HEAL'\?'SAVE':r\.action/);
  assert.match(global,/battle\.action==='HEAL'\?'SAVE':battle\.action/);
  assert.match(global,/p_action:action/);
  assert.match(demo,/action !== "HEAL" && action !== "KILL"/);
  assert.match(report,/world-return-heal/);
  assert.match(await readFile("public/breaking-share-card.js","utf8"),/WORLD SAVE/);
  assert.match(report,/" SAVE \/ "/);
});
test("Landing global pulses are fetched from public read-only RPC, not browser clicks or local storage",async()=>{
  const js=await readFile("public/global-pulses.js","utf8");
  const css=await readFile("public/styles.css","utf8");
  assert.match(js,/rest\/v1\/rpc\/iid_global_pulses/);
  assert.match(js,/response\.json\(\)/);
  assert.match(js,/Number\(data\.total_pulses\)/);
  assert.match(js,/SERVER VERIFIED/);
  assert.match(js,/SYNC UNAVAILABLE/);
  assert.doesNotMatch(js,/Math\.random|localStorage|data\.counted_taps\s*\+\+/);
  assert.match(css,/\.hero \.global-pulses-total/);
});
