import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {worldStage,headlineFor,validateSnapshot,GAME_URL,IMAGE_WIDTH,IMAGE_HEIGHT,shareCaption} from "../public/breaking-share-card.js";

const sample={source:"SERVER_LEDGER",snapshot_at:"2026-10-14T09:50:00Z",from:"2026-10-14T06:00:00Z",
 world_hp:500180,heal_hp:180,kill_hp:0,decay_hp:0,chaos_hp:0,net_hp:180,
 heal_battles:1,kill_battles:0,decay_pulses:0,chaos_events:0};
test("Locked pixel news card validates real snapshot math and omits world total HP",async()=>{
 assert.equal(IMAGE_WIDTH,1080);assert.equal(IMAGE_HEIGHT,1350);
 assert.equal(worldStage(0),"DEAD");
 assert.equal(worldStage(250000),"NEAR DEATH");
 assert.equal(worldStage(500000),"CRITICAL");
 assert.equal(worldStage(500180),"STABLE");
 assert.equal(worldStage(750001),"RECOVERING");
 assert.deepEqual(headlineFor(sample),["THE INTERNET","FOUGHT BACK_"]);
 assert.deepEqual(headlineFor({...sample,net_hp:-1}),["THE INTERNET","TOOK A HIT_"]);
 assert.equal(validateSnapshot(sample),sample);
 assert.throws(()=>validateSnapshot({...sample,net_hp:200}),/does not balance/);
 assert.throws(()=>validateSnapshot({...sample,source:"LOCAL_DEMO"}),/Unverified/);
 assert.throws(()=>validateSnapshot({...sample,world_hp:-1}),/Invalid world health/);
 const text=shareCaption(sample);
 assert.match(text,/SAVE IT OR KILL IT/);
 assert.ok(text.includes(GAME_URL));
 assert.doesNotMatch(text,/500,180|1,000,000 HP/);
 const js=await readFile("public/breaking-share-card.js","utf8");
 assert.ok(js.includes('imageOrNull("./assets/dying-internet-core.svg")'));
 assert.ok(js.includes("healthBar(ctx,Number(data.world_hp)"));
 assert.ok(js.includes("canvas.toBlob("));
 assert.ok(!js.includes("pixelText(ctx,data.world_hp"));

});
test("Share button generates new server snapshot and supports binary PNG sharing",async()=>{
 const html=await readFile("public/arena.html","utf8");
 const flow=await readFile("public/flow.js","utf8");
 const js=await readFile("public/world-return.js","utf8");
 for(const id of ["share-card-modal","share-card-preview","share-card-native",
   "share-card-download","share-card-whatsapp","share-card-close","share-card-feedback"]){
   assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.ok(html.includes("CREATE PIXEL SHARE CARD"));
 assert.ok(html.includes("world-return.css?v=2"));
 assert.ok(html.includes('src="./flow.js?v=16"'));
 assert.ok(flow.includes('import("./world-return.js?v=3")'));
 assert.ok(js.includes('sb.rpc("iid_share_snapshot")'));
 assert.ok(js.includes("renderBreakingCard(data)"));
 assert.ok(js.includes("new File([png]"));
 assert.ok(js.includes("navigator.canShare({files:[shareFile]})"));
 assert.ok(js.includes("navigator.share(details)"));
 assert.ok(js.includes("URL.revokeObjectURL"));
 assert.ok(js.includes("https://wa.me/?text="));
 assert.ok(js.includes("LINK ONLY"));
 assert.ok(!js.includes("Math.random")&&!js.includes("localStorage"));
});
