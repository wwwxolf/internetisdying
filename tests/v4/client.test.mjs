import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initV4Battle} from '../../public/v4-battle.js';

test('SAVE and KILL each show the correct faction, resume with two RPC writes, and expose V4 voting',async()=>{
 const saved={document:globalThis.document,window:globalThis.window,setInterval:globalThis.setInterval,
  clearInterval:globalThis.clearInterval,now:Date.now};
 try{
  for(const action of ['HEAL','KILL']){
   const nodes=new Map(),timers=[];let clock=Date.parse('2026-10-17T01:00:00Z');
   function node(id){
    if(!nodes.has(id))nodes.set(id,{hidden:false,disabled:false,style:{},dataset:{},listeners:{},attrs:{},
     setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.listeners[k]=f;}});
    return nodes.get(id);
   }
   const choice=node('choice');choice.dataset.arenaAction=action;
   globalThis.document={hidden:false,getElementById:node,querySelector:()=>node('meter'),
    querySelectorAll:s=>s==='[data-arena-action]'?[choice]:[],addEventListener(){}};
   globalThis.window={addEventListener(){}};
   globalThis.setInterval=(f,n)=>{timers.push({f,n});return timers.length;};
   globalThis.clearInterval=()=>{};
   Date.now=()=>clock;
   const calls=[];
   const world={id:'epoch',hp:500000,status:'ACTIVE',admission:true,
    starts_at:'2026-10-17T00:00:00Z',deadline_at:'2026-11-16T00:00:00Z'};
   const sb={rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='iid_v4_bootstrap')return {data:{world,battle:null,vote:null,server_now:new Date(clock).toISOString(),sync_pending:false}};
    if(name==='iid_v4_start')return {data:{id:'battle',seq:1,action:args.p_action,
     started_at:new Date(clock).toISOString(),taps:null,server_now:new Date(clock).toISOString()}};
    if(name==='iid_v4_finish')return {data:{id:'battle',seq:1,action,
     taps:args.p_tap_total,power:105,critical:100,completed_at:new Date(clock).toISOString()}};
    throw Error('unexpected RPC '+name);
   }};
   await initV4Battle({sb});
   assert.equal(node('next-chaos').hidden,false,'V4 voting section must be reachable');
   await choice.listeners.click();
   assert.equal(node('tap-battle').dataset.side,action.toLowerCase());
   assert.equal(node('tap-target-mark').textContent,action==='HEAL'?'+':'×');
   assert.match(node('tap-target').attrs['aria-label'],action==='HEAL'?/patch/:/feed/);
   assert.equal(node('arena-decision').hidden,true,'fight choices hidden while the tap game is running');
   clock+=2000;
   for(let i=0;i<50;i++)node('tap-target').listeners.click();
   assert.equal(calls.length,2,'taps do not generate network writes');
   clock+=10000;timers.find(t=>t.n===100).f();
   await new Promise(resolve=>setImmediate(resolve));
   assert.deepEqual(calls.map(x=>x.name),['iid_v4_bootstrap','iid_v4_start','iid_v4_finish']);
   assert.equal(calls[1].args.p_action,action);
   assert.equal(calls.at(-1).args.p_tap_total,50);
   assert.equal(node('tap-battle').hidden,true);
   assert.equal(node('arena-decision').hidden,false);
  }
 }finally{
  globalThis.document=saved.document;globalThis.window=saved.window;
  globalThis.setInterval=saved.setInterval;globalThis.clearInterval=saved.clearInterval;Date.now=saved.now;
 }
});
