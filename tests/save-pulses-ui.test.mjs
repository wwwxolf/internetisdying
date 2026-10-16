import {test} from "node:test";
import assert from "node:assert/strict";
import {inflateSync} from "node:zlib";
import worker,{makePNG,healthStage,worldHeadline} from "../src/share-worker.js";
import {readFile} from "node:fs/promises";
import {shareStory,SHARE_LABELS} from "../public/share-story.js";
const ID="11111111-1111-4111-8111-111111111111";
const snapshot={source:"SERVER_LEDGER",snapshot_at:"2026-10-14T09:50:00Z",from:"2026-10-14T06:00:00Z",
 world_hp:500180,heal_hp:180,kill_hp:0,decay_hp:0,chaos_hp:0,net_hp:180,
 heal_battles:1,kill_battles:0,decay_pulses:0,chaos_events:0};
test("Cloudflare routes OG shares and public momentum through worker; all other assets stay static",async()=>{
 const json=JSON.parse(await readFile("wrangler.jsonc","utf8"));
 assert.equal(json.main,"./src/share-worker.js");
 assert.deepEqual(json.assets.run_worker_first,["/share/*","/v4/share/*","/api/war-momentum","/api/v4-summary"]);
 assert.equal(json.assets.binding,"ASSETS");
 assert.equal(json.assets.directory,"./public");
 const assets={ASSETS:{fetch:async()=>new Response("Static asset preserved",{status:200})}};
 const r=await worker.fetch(new Request("https://site.test/index.html"),assets);
 assert.equal(await r.text(),"Static asset preserved");
});
test("OG image is a real valid PNG raster with changing server data",async()=>{
 assert.equal(healthStage(500180),"STABLE");
 assert.equal(worldHeadline(snapshot),"PATCHED FOR NOW_");
 const png=await makePNG(snapshot);
 assert.equal(Buffer.from(png.subarray(0,8)).toString("hex"),"89504e470d0a1a0a");
 assert.equal(new DataView(png.buffer,png.byteOffset,png.byteLength).getUint32(16),600);
 assert.equal(new DataView(png.buffer,png.byteOffset,png.byteLength).getUint32(20),750);
 const zlibStart=png.indexOf(73); // IDAT chunk marker occurs after IHDR
 assert.ok(zlibStart>0);
 const rawLen=1+600*4;
 // Validate actual RGBA scanlines rather than just checking filename.
 const inflated=inflateSync(Buffer.from(png.slice(41,-16)));
 assert.equal(inflated.length,rawLen*750);
 assert.equal(inflated[0],0);
 assert.notDeepEqual(
  Buffer.from(await makePNG({...snapshot,world_hp:249000,net_hp:-820,heal_hp:0,kill_hp:820})),
  Buffer.from(png));
});
test("Public OG link shows verified preview, points to game, never leaks player data",async()=>{
 const before=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.match(String(url),/iid_public_share_card/);
  assert.deepEqual(JSON.parse(options.body),{p_id:ID});
  return new Response(JSON.stringify(snapshot),{status:200,headers:{"Content-Type":"application/json"}});
 };
 try{
  const origin="https://internetisdying.wwwxolf.workers.dev";
  const h=await worker.fetch(new Request(origin+"/share/"+ID),{});
  assert.equal(h.status,200);
  const body=await h.text();
  assert.ok(body.includes('property="og:image" content="'+origin+"/share/"+ID+"/image.png"));
  assert.ok(body.includes("CHICKEN EATS THE INTERNET"));
  assert.ok(body.includes("PATCHED FOR NOW_"));
  assert.ok(body.includes("INTERNET REPAIRED"));
  assert.ok(body.includes("JOIN THE CHAOS"));
  assert.ok(!body.includes("email"));
  assert.ok(!body.includes("500,180 / 1,000,000"));
  const img=await worker.fetch(new Request(origin+"/share/"+ID+"/image.png"),{});
  assert.equal(img.status,200);
  assert.equal(img.headers.get("Content-Type"),"image/png");
  const sig=new Uint8Array(await img.arrayBuffer()).slice(0,8);
  assert.equal(Buffer.from(sig).toString("hex"),"89504e470d0a1a0a");
 }finally{globalThis.fetch=before;}
});

test("WhatsApp OG and downloadable PNG share exactly the same World 001 narrative rules",async()=>{
 const variants=[
  {kill_hp:350,heal_hp:0,net_hp:-350,kill_battles:2,heal_battles:0},
  {heal_hp:0,kill_hp:0,decay_hp:250,net_hp:-250,decay_pulses:1,heal_battles:0},
  {heal_hp:0,kill_hp:0,chaos_hp:-70,net_hp:-70,chaos_events:1,heal_battles:0},
  {heal_hp:0,kill_hp:0,net_hp:0,heal_battles:0,world_hp:450000},
 ];
 for(const diff of variants){
  const data={...snapshot,...diff};
  assert.equal(worldHeadline(data),shareStory(data).headline.join(" "));
  const png=await makePNG(data);
  assert.equal(Buffer.from(png.slice(0,8)).toString("hex"),"89504e470d0a1a0a");
 }
 const src=await readFile("src/share-worker.js","utf8");
 assert.ok(src.includes("options.labels||SHARE_LABELS"));
 assert.ok(src.includes("CHICKEN EATS THE INTERNET"));
});
test("OG image rejects incomplete or imbalanced snapshots without exposing invented stats",async()=>{
 await assert.rejects(makePNG({...snapshot,from:undefined}),/Unverified report/);
 await assert.rejects(makePNG({...snapshot,chaos_hp:9}),/Invalid impact/);
});

