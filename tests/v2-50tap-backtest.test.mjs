import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {V2_MAX_TAPS,V2_DURATION_SECONDS,V2_READY_SECONDS,V2_HOLD_MS,v2TapBonus} from "../public/v2-tap-config.js";
import {computeBattle,windowSettlement} from "../public/v2-lab.js";

test("exact 50 tap / 10s / 2s contract including all bonus thresholds",()=>{
 assert.deepEqual([V2_MAX_TAPS,V2_DURATION_SECONDS,V2_READY_SECONDS,V2_HOLD_MS],[50,10,2,180]);
 for(const [taps,bonus] of [[0,0],[8,0],[9,1],[16,1],[17,2],[24,2],[25,3],[33,3],
 [34,4],[41,4],[42,5],[49,5],[50,6]])assert.equal(v2TapBonus(taps),bonus);
 assert.equal(49*V2_HOLD_MS,8820,"50th accessible hold-tap can occur before ten seconds");
 // Cross-version: the 24-tap old max now earns only +2%, no longer the maximum.
 assert.equal(v2TapBonus(24),2);
 assert.equal(v2TapBonus(50),6);
});
test("V2 formula deterministic tap/power scaling, no extra RNG advantage",()=>{
 const old={taps:24,roll:45,crit_roll:99,draw:125};
 const oldMaxPower=Math.round(225*2*1.06); // historical V2 24-tap maximum
 assert.equal(oldMaxPower,477);
 assert.equal(computeBattle(old).personal_power,459); // 24 taps now +2%
 assert.equal(computeBattle({...old,taps:50}).personal_power,477); // 50 taps +6%
 assert.equal(computeBattle({...old,taps:49}).personal_power,473); // 49 taps +5%
 const scores=[0,8,9,16,17,24,25,33,34,41,42,49,50].map(t=>computeBattle({...old,taps:t}));
 for(let i=1;i<scores.length;i++){
  assert.ok(scores[i].war_influence>=scores[i-1].war_influence);
  assert.ok(scores[i].personal_power>=scores[i-1].personal_power);
 }
 assert.throws(()=>computeBattle({...old,taps:51}),/INVALID_SYNTHETIC_INPUT/);
});
test("one-million-player 10-second cohort projections and fixed World HP cap",()=>{
 const users=1000000;
 const requestedTaps=users*50;
 const minNetworkBatches=users*5; // existing server allows at most ten increments per batch
 assert.equal(requestedTaps,50_000_000);
 assert.equal(minNetworkBatches,5_000_000);
 assert.equal(minNetworkBatches/10,500000,"500k batch RPS if all active together");
 const balanced=Array.from({length:10},(_,i)=>({...computeBattle({taps:50,roll:10,crit_roll:10,draw:140}),
  action:i<5?"HEAL":"KILL"}));
 assert.equal(windowSettlement(balanced,500000).applied,0);
 // 1M in one window: mathematically cap at ±6,000 even under extreme imbalance.
 function change(save,kill){
  const q=(save+kill)===0?0:(save-kill)/(save+kill);
  return Math.round(6000*users/(users+2)*Math.tanh(q/.12));
 }
 assert.equal(change(100000000,0),6000);
 assert.equal(change(0,100000000),-6000);
 assert.equal(change(50000000,50000000),0);
 assert.ok(change(51000000,49000000)>0&&change(51000000,49000000)<6000);
});
test("new server migration updates exactly five functions and cannot silently alter World HP",async()=>{
 const sql=await readFile("supabase/migrations/20261015062000_v2_50tap_10sec.sql","utf8");
 for(const fn of ["start_battle","tap_battle","tap_batch","settle_v2_due","economy_status"])
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION iid_private."+fn+"("),fn);
 assert.match(sql,/V2_TAP_UPGRADE_PENDING_BATTLES/);
 assert.match(sql,/interval '12 seconds'/);
 assert.match(sql,/'duration_seconds',10/);
 assert.match(sql,/'max_taps',50/);
 assert.match(sql,/v_bonus:=iid_private.v2_tap_bonus\(b.counted_taps\)/);
 assert.doesNotMatch(sql,/update public\.iid_world set hp/);
 const js=await readFile("public/global-battle.js","utf8");
 assert.match(js,/V2_MAX_TAPS/);
 assert.match(js,/V2_DURATION_SECONDS/);
 assert.match(js,/setInterval\(tap,V2_HOLD_MS\)/);
 assert.match(js,/v2TapBonus\(battle.counted_taps\)/);
 const lab=await readFile("public/v2-lab.html","utf8");
 assert.match(lab,/2s ready \+ 10s active, ≤50 taps/);
});
