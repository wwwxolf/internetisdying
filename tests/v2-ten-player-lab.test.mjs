import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {computeBattle,totals,windowSettlement,auditSamples} from "../public/v2-lab.js";

const sample=JSON.parse(await readFile("public/v2-lab-data.json","utf8"));

test("10 independent synthetic TEST players, fixed countries and both SAVE/KILL",()=>{
 assert.equal(sample.players.length,10);
 assert.equal(new Set(sample.players.map(p=>p.id)).size,10);
 assert.equal(new Set(sample.players.map(p=>p.nickname)).size,10);
 assert.equal(sample.players.filter(p=>p.action==="HEAL").length,5);
 assert.equal(sample.players.filter(p=>p.action==="KILL").length,5);
 assert.ok(sample.players.every(p=>p.nickname.startsWith("TEST_")&&p.country_code.length===3));
 assert.equal(sample.simulation_only,true);
 assert.match(sample.source,/NOT actual Supabase Auth accounts/);
});

test("all 10 V2 formula snapshots reproduce exact production SQL results",()=>{
 const report=auditSamples(sample);
 assert.equal(report.save,936);
 assert.equal(report.kill,456);
 assert.equal(report.count,10);
 assert.equal(sample.players.find(p=>p.nickname==="TEST_ECHO").critical,200);
 assert.equal(sample.players.find(p=>p.nickname==="TEST_ECHO").personal_power,4497);
 assert.equal(sample.players.find(p=>p.nickname==="TEST_ECHO").war_influence,335);
 assert.equal(sample.players.find(p=>p.nickname==="TEST_CIPHER").bonus,0);
 assert.equal(sample.players.find(p=>p.nickname==="TEST_CIPHER").war_influence,53);
 assert.throws(()=>auditSamples({...sample,players:[...sample.players.slice(0,9),sample.players[0]]}),/DUPLICATE_TEST_IDENTITY/);
 assert.throws(()=>computeBattle({...sample.players[0],taps:25}),/INVALID_SYNTHETIC_INPUT/);
});

test("rank scores do NOT directly modify the global World HP; four-hour settlement does",()=>{
 const simulatedStartingHp=sample.baseline_hp;
 const liveInfluence=totals(sample.players);
 assert.deepEqual(liveInfluence,{save:936,kill:456,count:10});
 assert.equal(simulatedStartingHp,500000);
 const settled=windowSettlement(sample.players,simulatedStartingHp);
 assert.equal(settled.nominal,4968);
 assert.equal(settled.applied,4968);
 assert.equal(settled.hpAfter,504968);
 assert.ok(Math.abs(settled.q-480/1392)<1e-12);
 assert.equal(sample.expected.nominal_hp,settled.nominal);
});

test("settlement caps World HP and ignores 0-player windows",()=>{
 assert.equal(windowSettlement([],500000).applied,0);
 const allSave=sample.players.map(p=>({...p,action:"HEAL"}));
 const allKill=sample.players.map(p=>({...p,action:"KILL"}));
 assert.equal(windowSettlement(allSave,999999).hpAfter,1000000);
 assert.equal(windowSettlement(allKill,1).hpAfter,0);
 assert.equal(windowSettlement(allSave,1000000).applied,0);
});

test("simulation UI is explicit and isolated from Google Auth and production leaderboard",async()=>{
 const html=await readFile("public/v2-lab.html","utf8");
 const js=await readFile("public/v2-lab.js","utf8");
 const arena=await readFile("public/arena.html","utf8");
 for(const id of ["v2-lab","lab-count","lab-save-ranks","lab-kill-ranks","lab-meter","lab-next","lab-all","lab-settle","lab-restart","lab-audit"])
  assert.ok(html.includes('id="'+id+'"'),"Missing "+id);
 assert.match(html,/SIMULATED WORLD_001/);
 assert.match(html,/NO PRODUCTION CHANGES/);
 assert.match(html,/not ten real Google OAuth sessions/);
 assert.match(arena,/10-PLAYER V2 SIM LAB/);
 assert.doesNotMatch(js,/supabase\.createClient|sb\.rpc|fetch\(.*supabase/);
 assert.match(js,/if\(state\.count!==10\|\|state\.settled\)return/);
 assert.match(js,/WINDOW OPEN/);
});

test("ten-player simulated DOM runs sequentially and settles exactly once",async()=>{
 const previous={document:globalThis.document,fetch:globalThis.fetch};
 const html=await readFile("public/v2-lab.html","utf8");
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
 const dom=new Map();
 const make=tag=>({
   tag,children:[],events:{},attrs:{},style:{},hidden:false,disabled:false,textContent:"",
   append(...els){this.children.push(...els)},
   replaceChildren(){this.children=[]},
   setAttribute(k,v){this.attrs[k]=v},
   addEventListener(k,cb){this.events[k]=cb}
 });
 for(const id of ids)dom.set(id,make("div"));
 try{
   globalThis.document={hidden:false,getElementById:id=>dom.get(id)||null,createElement:make};
   globalThis.fetch=async()=>({ok:true,json:async()=>sample});
   await import("../public/v2-lab.js?dom-test-01");
   // Dynamic import callback fetch chain must finish.
   for(let i=0;i<10;i++)await new Promise(setImmediate);
   assert.equal(dom.get("lab-count").textContent,"0 / 10");
   assert.equal(dom.get("lab-hp").textContent,"500,000");
   assert.equal(dom.get("lab-settle").disabled,true);
   assert.equal(dom.get("lab-save-ranks").children.length,1); // empty state
   for(let i=0;i<10;i++)dom.get("lab-next").events.click();
   assert.equal(dom.get("lab-count").textContent,"10 / 10");
   assert.equal(dom.get("lab-save-ranks").children.length,5);
   assert.equal(dom.get("lab-kill-ranks").children.length,5);
   assert.equal(dom.get("lab-hp").textContent,"500,000","HP must not move before settlement");
   assert.equal(dom.get("lab-settle").disabled,false);
   dom.get("lab-settle").events.click();
   assert.equal(dom.get("lab-hp").textContent,"504,968");
   assert.equal(dom.get("lab-meter-fill").style.width,"50.4968%");
   assert.match(dom.get("lab-pending").textContent,/\+4,968 HP/);
   assert.equal(dom.get("lab-settle").disabled,true);
   dom.get("lab-settle").events.click();
   assert.equal(dom.get("lab-hp").textContent,"504,968","no double settlement");
   dom.get("lab-restart").events.click();
   assert.equal(dom.get("lab-count").textContent,"0 / 10");
   assert.equal(dom.get("lab-hp").textContent,"500,000");
 }finally{
   globalThis.document=previous.document;
   globalThis.fetch=previous.fetch;
 }
});
