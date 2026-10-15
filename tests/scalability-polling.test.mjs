import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {battlePollDelay,chaosPollDelay,economyRefreshDue,jitterDelay} from "../public/arena-polling.js";

test("safely de-synchronizes idle status refreshes and caps retry backoff",()=>{
 assert.equal(battlePollDelay(0,()=>0),45000);
 assert.equal(battlePollDelay(0,()=>1),75000);
 assert.equal(battlePollDelay(1,()=>0),10000);
 assert.equal(battlePollDelay(2,()=>0),20000);
 assert.equal(battlePollDelay(3,()=>0),40000);
 assert.equal(battlePollDelay(99,()=>1),300000);
 assert.equal(jitterDelay(100,300,()=>.5),250);
});

test("disabled Chaos polls less often while active voting stays responsive",()=>{
 assert.equal(chaosPollDelay(false,0,()=>0),120000);
 assert.equal(chaosPollDelay(false,0,()=>1),180000);
 assert.equal(chaosPollDelay(true,0,()=>0),60000);
 assert.equal(chaosPollDelay(true,0,()=>1),90000);
 assert.equal(chaosPollDelay(false,1,()=>0),10000);
 assert.equal(economyRefreshDue(0,123),true);
 assert.equal(economyRefreshDue(1000,120999),false);
 assert.equal(economyRefreshDue(1000,121000),true);
});

test("one million co-arrivals distribute their FIRST recurring status refresh over 30 seconds",()=>{
 const buckets=new Uint32Array(30);
 const N=1_000_000;
 for(let i=0;i<N;i++){
  const delay=battlePollDelay(0,()=>(i+.5)/N);
  const slot=Math.min(29,Math.floor((delay-45000)/1000));
  buckets[slot]++;
 }
 const sum=Array.from(buckets).reduce((a,b)=>a+b,0);
 assert.equal(sum,N);
 assert.ok(Math.max(...buckets)<34000);
 // Initial login/status and battle mutations are NOT removed or load-tested by jitter.
});

test("Arena still uses authoritative start/tap_batch/settle RPCs and skips hidden idle polling",async()=>{
 const battle=await readFile("public/global-battle.js","utf8");
 const chaos=await readFile("public/daily-chaos.js","utf8");
 const flow=await readFile("public/flow.js","utf8");
 const arena=await readFile("public/arena.html","utf8");
 assert.match(battle,/rpc\('start'/);
 assert.match(battle,/rpc\('tap_batch'/);
 assert.match(battle,/rpc\('settle'/);
 assert.match(battle,/if\(disposed\|\|document.hidden\)return/);
 assert.match(chaos,/if\(disposed\|\|document.hidden\)return/);
 assert.doesNotMatch(battle,/setInterval\(\(\)=>\{if\(!battle\)void refresh\(\);\},15000\)/);
 assert.match(flow,/global-battle\.js\?v=13/);
 assert.match(flow,/daily-chaos\.js\?v=4/);
 assert.match(arena,/SERVER SYNC AUTO/);
});
