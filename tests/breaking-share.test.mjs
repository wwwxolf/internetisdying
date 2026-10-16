import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {worldStage,headlineFor,validateSnapshot,GAME_URL,IMAGE_WIDTH,IMAGE_HEIGHT,shareCaption} from "../public/breaking-share-card.js";
import {shareStory,SHARE_LABELS} from "../public/share-story.js";
const sample={source:"SERVER_LEDGER",snapshot_at:"2026-10-14T09:50:00Z",from:"2026-10-14T06:00:00Z",
 world_hp:500180,heal_hp:180,kill_hp:0,decay_hp:0,chaos_hp:0,net_hp:180,
 heal_battles:1,kill_battles:0,decay_pulses:0,chaos_events:0};
test("Locked card retains live verified stats, health status, no numerical HP total",async()=>{
 assert.equal(IMAGE_WIDTH,1080);assert.equal(IMAGE_HEIGHT,1350);
 assert.equal(worldStage(0),"DEAD");
 assert.equal(worldStage(500000),"CRITICAL");
 assert.equal(worldStage(500180),"STABLE");
 assert.equal(worldStage(750001),"RECOVERING");
 assert.deepEqual(headlineFor(sample),["PATCHED FOR","NOW_"]);
 assert.equal(validateSnapshot(sample),sample);
 assert.throws(()=>validateSnapshot({...sample,net_hp:999}),/does not balance/);
 assert.throws(()=>validateSnapshot({...sample,source:"LOCAL_DEMO"}),/Unverified/);
 const base=shareCaption(sample);
 assert.ok(base.includes("🚨 THE INTERNET IS DYING."));
 assert.ok(base.includes("Will you SAVE it or KILL it? 💀"));
 assert.ok(base.includes(GAME_URL));
 assert.doesNotMatch(base,/500,180|1,000,000 HP/);
 const source=await readFile("public/breaking-share-card.js","utf8");
 assert.ok(source.includes("canvas.toBlob("));
 assert.ok(source.includes('imageOrNull("./assets/world-chicken.svg")'));
 for(const label of Object.values(SHARE_LABELS))assert.ok(source.includes("SHARE_LABELS."),label);
});
test("Share UI has exactly two actions and a per-snapshot OG preview URL",async()=>{
 const html=await readFile("public/arena.html","utf8");
 const flow=await readFile("public/flow.js","utf8");
 const js=await readFile("public/world-return.js","utf8");
 const sampleLink="https://internetisdying.wwwxolf.workers.dev/share/11111111-1111-4111-8111-111111111111";
 const msg=shareCaption(sample,sampleLink);
 assert.ok(msg.includes(sampleLink));
 assert.ok(msg.includes("JOIN THE CHAOS"));
 assert.ok(!msg.includes(GAME_URL+"\n"+GAME_URL));
 for(const id of ["share-card-modal","share-card-preview","share-card-whatsapp","share-card-download","share-card-close"]){
  assert.ok(html.includes('id="'+id+'"'));
 }
 assert.doesNotMatch(html,/id="share-card-native"|id="share-card-copy"/);
 assert.ok(html.includes("world-return.css?v=4"));
 assert.ok(html.includes('src="./flow.js?v=37"'));
 assert.ok(flow.includes('import("./world-return.js?v=8")'));
 assert.ok(js.includes('sb.rpc("iid_publish_share_card")'));
 assert.ok(js.includes("renderBreakingCard(snapshot)"));
 assert.ok(js.includes("shareCaption(shareData,shareLink)"));
 assert.ok(js.includes("URL.revokeObjectURL"));
 assert.ok(js.includes("https://wa.me/?text="));
 assert.doesNotMatch(js,/navigator.share|navigator.clipboard|Math.random/);
});

const report=(changes={})=>{
 const d={...sample,heal_hp:0,kill_hp:0,decay_hp:0,chaos_hp:0,
  net_hp:0,heal_battles:0,kill_battles:0,decay_pulses:0,chaos_events:0,...changes};
 d.net_hp=d.heal_hp-d.kill_hp-d.decay_hp+d.chaos_hp;
 validateSnapshot(d);
 return shareStory(d);
};
test("World_001 headline priority is deterministic and never blames chicken for decay",()=>{
 assert.equal(report().key,"quiet");
 assert.deepEqual(report().headline,["NO PECKS","REPORTED_"]);
 assert.equal(report({heal_hp:80,kill_hp:80,heal_battles:1,kill_battles:1}).key,"stalemate");
 assert.equal(report({heal_hp:120,heal_battles:1}).key,"recovery");
 assert.equal(report({kill_hp:120,kill_battles:1}).key,"chicken");
 assert.equal(report({kill_hp:10,decay_hp:100,decay_pulses:1}).key,"decay");
 assert.equal(report({kill_hp:10,chaos_hp:-101,chaos_events:1}).key,"chaos-damage");
 assert.equal(report({heal_hp:10,chaos_hp:50,chaos_events:1}).key,"chaos-recovery");
 assert.equal(report({world_hp:0,kill_hp:20,kill_battles:1}).key,"offline");
 assert.equal(report({decay_pulses:1}).key,"stalemate");
 assert.deepEqual(shareStory(sample),shareStory({...sample}));
});
test("card rejects missing and misleading inputs rather than fabricating values",()=>{
 assert.throws(()=>validateSnapshot({...sample,kill_hp:null}),/Invalid server data/);
 assert.throws(()=>validateSnapshot({...sample,world_hp:1000001}),/Invalid world health/);
 assert.throws(()=>validateSnapshot({...sample,heal_hp:-1,net_hp:-1}),/Invalid applied impact/);
});

