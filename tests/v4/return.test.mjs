import {test} from 'node:test';
import assert from 'node:assert/strict';
import {v4ReturnHeadline,initV4WorldReturn} from '../../public/v4-world-return.js';
import {readFile} from 'node:fs/promises';

const base={engine_version:4,source:'V4_SETTLED_LEDGER',first_visit:false,
 from:'2026-10-16T00:00:00Z',until:'2026-10-16T12:00:00Z',
 save_power:0,kill_power:0,world_hp:500000,battle_world_hp:0,
 decay_hp:0,chaos_hp:0,net_hp:0,battle_windows:0,decay_pulses:0,
 chaos_events:0,latest_event:null};
test('World Return narratives never blame chickens for natural decay',()=>{
 assert.equal(v4ReturnHeadline({...base,first_visit:true}),'WELCOME TO WORLD_001_');
 assert.equal(v4ReturnHeadline(base),'NOT A SINGLE PECK WAS HEARD_');
 assert.equal(v4ReturnHeadline({...base,battle_windows:1,net_hp:50,battle_world_hp:50}),'THE INTERNET BITES BACK_');
 assert.equal(v4ReturnHeadline({...base,battle_windows:1,net_hp:-40,battle_world_hp:-40}),'THE CHICKEN IS WINNING_');
 assert.equal(v4ReturnHeadline({...base,decay_pulses:1,net_hp:-27,decay_hp:27}),'SIGNAL ROT IS SPREADING_');
 assert.equal(v4ReturnHeadline({...base,chaos_events:1,net_hp:-100,chaos_hp:-100}),'THE COOP WENT WILD_');
 assert.equal(v4ReturnHeadline({...base,battle_windows:1,net_hp:0}),'A PERFECT STALEMATE_');
});
test('V4 World Return renders real faction power separately from HP and disables legacy share cards',async()=>{
 const original=globalThis.document,oldWindow=globalThis.window;
 const nodes=new Map(),labels=new Map();
 const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:true,disabled:false,
  title:'',dataset:{},listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}});return nodes.get(id);};
 get('world-return').querySelector=sel=>{
  if(!labels.has(sel))labels.set(sel,{textContent:''});return labels.get(sel);
 };
 globalThis.document={getElementById:get,addEventListener(){},removeEventListener(){}};
 globalThis.window={addEventListener(){}};
 try{
  let calls=0;
  await initV4WorldReturn({nickname:'PlayerOne',sb:{rpc:async(name)=>{
   calls++;assert.equal(name,'iid_v4_return_report');
   return {data:{...base,first_visit:true,save_power:205,kill_power:102,
    world_hp:499973,net_hp:-27,decay_hp:27,decay_pulses:1,
    latest_event:{kind:'DECAY',applied_hp:-27}}};
  }}});
  assert.equal(calls,1);
  assert.equal(get('world-return').hidden,false);
  assert.equal(get('world-return-share').disabled,false);
  assert.match(get('world-return-share').textContent,/CREATE V4 PIXEL SHARE CARD/);
  assert.equal(get('world-return-heal').textContent,'+205 POWER');
  assert.equal(get('world-return-kill').textContent,'−102 POWER');
  assert.equal(get('world-return-decay').textContent,'−27 HP');
  assert.equal(get('world-return-net').textContent,'−27 HP');
  assert.equal(get('world-return-world').textContent,'499,973 / 1,000,000 HP');
  assert.match(labels.get('.world-return-stat.heal span').textContent,/FACTION POWER/);
  assert.match(get('world-return-status').textContent,/SERVER VERIFIED/);
  get('world-return-dismiss').listeners.click();
  assert.equal(get('world-return').hidden,true);
 }finally{globalThis.document=original;globalThis.window=oldWindow;}
});
test('V4 report routing is isolated from legacy V2 and production remains inactive',async()=>{
 const flow=await readFile('public/flow.js','utf8');
 assert.match(flow,/rpcName:"iid_v4_hall_of_fame"/);
 assert.match(flow,/initV4WorldReturn\(\{sb,nickname:p.nickname\}\)/);
 assert.match(flow,/return;\s*}\s*const \{initGlobalBattle}/);
 const code=await readFile('public/v4-battle.js','utf8');
 assert.doesNotMatch(code,/localStorage|Math.random/);
 const migration=await readFile('supabase/migrations/20261016171500_v4_readonly_rankings_return.sql','utf8');
 assert.match(migration,/iid_v4\.player_totals/);
 assert.match(migration,/iid_v4\.events/);
 assert.doesNotMatch(migration,/update public\.iid_world|insert into iid_v4\.epochs/);
});
