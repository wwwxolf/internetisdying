import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateV4Share,v4ToArtFields,v4ShareStory,V4_SHARE_LABELS} from '../../public/v4-share-data.js';
import {v4ShareCaption,v4Filename} from '../../public/v4-share-card.js';
import worker,{makePNG} from '../../src/share-worker.js';
const ID='11111111-1111-4111-8111-111111111111',EPOCH='22222222-2222-4222-8222-222222222222';
const snapshot={source:'V4_SETTLED_LEDGER_SHARE',engine_version:4,period:'LAST_24H',epoch_id:EPOCH,
 snapshot_at:'2026-10-16T15:00:00Z',from:'2026-10-15T15:00:00Z',
 world_hp:499730,world_status:'ACTIVE',winner:null,world_version:8,
 heal_hp:0,kill_hp:0,decay_hp:270,chaos_hp:0,net_hp:-270,
 heal_battles:0,kill_battles:0,battle_windows:2,decay_pulses:1,chaos_events:0};
const withChanges=(change)=>{
 const d={...snapshot,...change};
 d.net_hp=d.heal_hp-d.kill_hp-d.decay_hp+d.chaos_hp;
 return d;
};
test('V4 verified share: exact frozen ledger invariants and distinct source',()=>{
 assert.equal(validateV4Share(snapshot),snapshot);
 assert.equal(v4ToArtFields(snapshot).source,'SERVER_LEDGER');
 assert.equal(v4ToArtFields(snapshot).net_hp,-270);
 assert.equal(v4ShareStory(snapshot).key,'decay');
 assert.equal(v4ShareStory(withChanges({kill_hp:900,decay_hp:100,world_hp:499000})).key,'chicken');
 assert.equal(v4ShareStory(withChanges({chaos_hp:-350,decay_hp:10})).key,'chaos-damage');
 assert.equal(v4ShareStory(withChanges({heal_hp:300,kill_hp:0,decay_hp:20})).key,'recovery');
 assert.equal(v4ShareStory(withChanges({heal_hp:0,kill_hp:0,decay_hp:0,
  battle_windows:2,decay_pulses:0})).key,'war-stalemate');
 assert.equal(v4ShareStory(withChanges({world_status:'FINAL',winner:'SAVE',world_hp:1200})).key,'world-won');
 assert.equal(v4ShareStory(withChanges({world_status:'FINAL',winner:'KILL',world_hp:0})).key,'world-lost');
 assert.throws(()=>validateV4Share({...snapshot,source:'SERVER_LEDGER'}),/Unverified/);
 assert.throws(()=>validateV4Share({...snapshot,engine_version:2}),/Unverified/);
 assert.throws(()=>validateV4Share({...snapshot,net_hp:99}),/does not balance/);
 assert.throws(()=>validateV4Share({...snapshot,from:'2026-10-13T00:00:00Z'}),/Unverified/);
 assert.throws(()=>validateV4Share({...snapshot,battle_windows:-1}),/does not balance/);
 assert.throws(()=>validateV4Share({...snapshot,world_status:'FINAL',winner:'SAVE',world_hp:0}),/does not balance/);
 assert.equal(V4_SHARE_LABELS.heal,'NET BATTLE REPAIRS');
 assert.equal(V4_SHARE_LABELS.kill,'NET BATTLE DAMAGE');
});
test('V4 captions link only to new immutable URLs, no V2 fallback',()=>{
 const url='https://internetisdying.wwwxolf.workers.dev/v4/share/'+ID;
 const cap=v4ShareCaption(snapshot,url);
 assert.ok(cap.includes(url));assert.ok(cap.includes('THE NET IS ROTTING_'));
 assert.ok(!cap.includes('499,730'));assert.ok(v4Filename(snapshot).endsWith('.png'));
 assert.throws(()=>v4ShareCaption(snapshot,'https://example.com/share/'+ID),/Invalid V4 share link/);
});
test('Cloudflare V4 OG routes read only V4 API and render frozen PNGs',async()=>{
 const json=JSON.parse(await readFile('wrangler.jsonc','utf8'));
 assert.ok(json.assets.run_worker_first.includes('/v4/share/*'));
 const saved=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,params)=>{
  calls.push({url:String(url),body:JSON.parse(params.body)});
  return Response.json(snapshot);
 };
 try{
  const base='https://internetisdying.wwwxolf.workers.dev/v4/share/'+ID;
  const doc=await worker.fetch(new Request(base),{});
  assert.equal(doc.status,200);
  const html=await doc.text();
  assert.ok(html.includes('og:image'));assert.ok(html.includes(base+'/image.png'));
  assert.ok(html.includes('THE NET IS ROTTING_'));
  assert.ok(html.includes('NET BATTLE DAMAGE'));
  assert.ok(!html.includes(EPOCH));assert.ok(!html.includes('user_id'));
  const img=await worker.fetch(new Request(base+'/image.png'),{});
  assert.equal(img.status,200);assert.equal(img.headers.get('Content-Type'),'image/png');
  const bytes=new Uint8Array(await img.arrayBuffer());
  assert.equal(Buffer.from(bytes.subarray(0,8)).toString('hex'),'89504e470d0a1a0a');
  assert.equal(calls.length,2);
  for(const call of calls){
   assert.match(call.url,/iid_v4_public_share_card$/);
   assert.deepEqual(call.body,{p_id:ID});
  }
 }finally{globalThis.fetch=saved;}
});
test('V4 share route fails closed for unverified snapshot; V2 route unaffected',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({...snapshot,source:'SERVER_LEDGER'});
 try{
  const res=await worker.fetch(new Request('https://site.test/v4/share/'+ID),{});
  assert.equal(res.status,503);assert.equal(res.headers.get('Cache-Control'),'no-store');
 }finally{globalThis.fetch=saved;}
 const art=await makePNG({source:'SERVER_LEDGER',
  snapshot_at:'2026-10-16T15:00:00Z',from:'2026-10-15T15:00:00Z',
  world_hp:500000,heal_hp:0,kill_hp:0,decay_hp:0,chaos_hp:0,net_hp:0,
  heal_battles:0,kill_battles:0,decay_pulses:0,chaos_events:0});
 assert.equal(Buffer.from(art.subarray(0,8)).toString('hex'),'89504e470d0a1a0a');
});
