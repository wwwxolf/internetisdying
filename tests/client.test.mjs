import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {evaluateWindows,utcDay,activeSlot} from '../public/utc-battle-windows.js';
import {battlePollDelay,economyRefreshDue,jitterDelay} from '../public/arena-polling.js';
import {currentMomentum,slotStartMs} from '../public/live-war-momentum.js';
import {V2_MAX_TAPS,V2_DURATION_SECONDS,V2_HOLD_MS,v2TapBonus} from '../public/v2-tap-config.js';
import {readFile} from 'node:fs/promises';
const source=await readFile('public/global-battle.js','utf8');
const html=await readFile('public/arena.html','utf8');
function fixture(handler) {
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{hidden:false,style:{},dataset:{},events:{},textContent:'',attrs:{},setAttribute(n,v){this.attrs[n]=v;},addEventListener(n,f){this.events[n]=f;}}]));
  const choices=['HEAL','KILL'].map(action=>({dataset:{arenaAction:action},events:{},addEventListener(n,f){this.events[n]=f;}}));
  const intervals=[];
  const context={evaluateWindows,battlePollDelay,economyRefreshDue,jitterDelay,currentMomentum,slotStartMs,
    V2_MAX_TAPS,V2_DURATION_SECONDS,V2_HOLD_MS,v2TapBonus,
    startLiveWarMomentum:()=>({stop(){},refresh(){}}),document:{getElementById:id=>{assert.ok(nodes.has(id),id+' exists in markup');return nodes.get(id);},querySelectorAll:()=>choices,addEventListener(){},removeEventListener(){}},
    window:{addEventListener(){}},Date,Number,Math,crypto,setInterval:f=>intervals.push(f),clearInterval(){},setTimeout:()=>1,clearTimeout(){}};
  const init=vm.runInNewContext(source.replace(/^import[^\n]*\n/gm,'').replace('export async function','async function')+';initGlobalBattle',context);
  return {nodes,choices,intervals,init:()=>init({sb:{rpc:handler}})};
}
function state(extra={}) {return {server_now:new Date().toISOString(),world:{hp:500000,enabled:true},monthly:{month:'2026-10',nickname:'Tester',battle_count:0,heal_count:0,kill_count:0,heal_hp:0,kill_hp:0,tier:null},active:null,latest:null,rolling_count:0,next_battle_at:null,window_day:utcDay(Date.now()),window_slot:activeSlot(Date.now()),window_timezone:'UTC',window_used:[false,false,false,false,false,false],...extra};}
const flush=()=>new Promise(r=>setImmediate(r));
test('paused server disables production choices and displays no invented tier',async()=>{
  const f=fixture(async()=>({data:state({world:{hp:500000,enabled:false}})}));await f.init();
  assert.ok(f.choices.every(x=>x.disabled));assert.match(f.nodes.get('monthly-summary').textContent,/No card yet/);
});
test('failed status fails closed without loading local demo',async()=>{
  const f=fixture(async()=>({error:{message:'network failure'}}));await f.init();f.intervals[0]();
  assert.ok(f.choices.every(x=>x.disabled));assert.match(f.nodes.get('flow-status').textContent,/RETRY SYNC/);
  assert.doesNotMatch(source,/localStorage|Math.random|tap-battle.js/);
});
test('lost start response keeps choices locked until a successful sync',async()=>{
  const f=fixture(async name=>name.endsWith('status')?{data:state()}:{error:{message:'response lost'}});
  await f.init();await f.choices[0].events.click();f.intervals[0]();assert.ok(f.choices.every(x=>x.disabled));
});
test('lost batch acknowledgement never fabricates a server-confirmed tap',async()=>{
  const calls=[];
  const active={id:'battle',action:'HEAL',counted_taps:0,starts_at:new Date(Date.now()-1000).toISOString(),ends_at:new Date(Date.now()+19000).toISOString()};
  const f=fixture(async(name,args)=>{
    if(name.endsWith('status'))return {data:state({active})};
    calls.push(JSON.parse(JSON.stringify(args)));
    return {error:{message:'response lost'}};
  });
  await f.init();
  f.nodes.get('tap-target').events.click();
  await flush(); // request failed; backoff now prevents a tight retry loop
  f.nodes.get('tap-target').events.click();
  assert.deepEqual(calls,[{p_battle_id:'battle',p_total:1}]);
  assert.equal(f.nodes.get('tap-count').textContent,'2 / 50'); // instant local feedback
  assert.match(f.nodes.get('tap-combo').textContent,/SERVER CONFIRMED 0\/50/);
});

test('rapid taps remain responsive while the first mobile network acknowledgement is pending',async()=>{
  const requests=[];
  let finishFirst;
  const pending=new Promise(resolve=>{finishFirst=resolve;});
  const active={id:'slow-net',action:'HEAL',counted_taps:0,starts_at:new Date(Date.now()-1000).toISOString(),ends_at:new Date(Date.now()+19000).toISOString()};
  const f=fixture(async(name,args)=>{
    if(name.endsWith('status'))return {data:state({active})};
    requests.push({...args});
    return requests.length===1?pending:{data:{counted_taps:args.p_total}};
  });
  await f.init();
  const target=f.nodes.get('tap-target');
  target.events.click();
  for(let n=0;n<4;n++)target.events.click();
  assert.equal(f.nodes.get('tap-count').textContent,'5 / 50'); // local feedback isn't blocked by latency
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0],{p_battle_id:'slow-net',p_total:1});
  assert.match(f.nodes.get('tap-combo').textContent,/SERVER CONFIRMED 0\/50/);
  finishFirst({data:{counted_taps:1}});
  await flush();
  f.intervals[0]();
  await flush();
  assert.ok(requests.some(x=>x.p_total===5)); // flush rest in a bounded batch
});

test('expired session resumes settlement with same ID and displays server result',async()=>{
  let finished=false;const calls=[];
  const active={id:'same-battle',action:'HEAL',counted_taps:5,starts_at:new Date(Date.now()-25000).toISOString(),ends_at:new Date(Date.now()-5000).toISOString()};
  const result={action:'HEAL',applied_hp:42,base:42,critical:1,bonus:0,power:42,hp_after:500042};
  const f=fixture(async(name,args)=>{
    if(name.endsWith('status'))return {data:state({active:finished?null:active,latest:finished?result:null})};
    calls.push({name,args:JSON.parse(JSON.stringify(args))});finished=true;return {data:result};
  });await f.init();f.intervals[0]();await flush();
  assert.deepEqual(calls,[{name:'iid_battle_settle',args:{p_battle_id:'same-battle'}}]);
  assert.match(f.nodes.get('arena-result-title').textContent,/42 HP APPLIED/);
});

test('V2 pending influence never fabricates HP; life bar follows exact verified server changes',async()=>{
  let hp=500000;
  const economy={enabled:true,save_influence:124,kill_influence:0,battle_count:1,
    window_start:new Date(slotStartMs(Date.now())).toISOString(),latest_window:null};
  const f=fixture(async name=>name==='iid_economy_status'
    ?{data:economy}:{data:state({world:{hp,enabled:true}})});
  f.nodes.get('arena-hp-change').hidden=true; // mock DOM defaults hidden:false, unlike markup
  await f.init();
  assert.equal(f.nodes.get('arena-hp').textContent,'500,000');
  assert.equal(f.nodes.get('arena-fill').style.width,'50%');
  assert.equal(f.nodes.get('arena-hp-change').hidden,true);
  assert.equal(f.nodes.get('arena-hp-pending').hidden,false);
  assert.ok(f.nodes.get('arena-hp-pending-score').textContent.includes('SAVE +124'));
  // V2 battle influence does not change World HP until the window settles.
  f.intervals[0]();
  assert.equal(f.nodes.get('arena-fill').style.width,'50%');
  assert.equal(f.nodes.get('arena-hp-change').hidden,true);
  // A genuine server settlement moves the bar even for a sub-5% delta.
  hp=506000;
  await f.nodes.get('battle-refresh').events.click();
  assert.equal(f.nodes.get('arena-hp').textContent,'506,000');
  assert.equal(f.nodes.get('arena-fill').style.width,'50.6%');
  assert.equal(f.nodes.get('arena-progress').attrs?.['aria-valuenow']||f.nodes.get('arena-progress').attrNow,'50.6');
  assert.equal(f.nodes.get('arena-hp-change').hidden,false);
  assert.ok(f.nodes.get('arena-hp-change').textContent.includes('+6,000 HP'));
  hp=503500;
  await f.nodes.get('battle-refresh').events.click();
  assert.equal(f.nodes.get('arena-fill').style.width,'50.35%');
  assert.match(f.nodes.get('arena-hp-change').textContent,/−2,500 HP/);
});

test('Arena health visuals never convert provisional influence into World HP',async()=>{
 const html=await readFile('public/arena.html','utf8');
 const css=await readFile('public/arena.css','utf8');
 assert.match(html,/id="arena-hp-change"/);
 assert.match(html,/id="arena-hp-pending"/);
 assert.match(html,/PENDING SETTLEMENT/);
 assert.ok(css.includes('transition:width 1.05s ease-out'));
 assert.ok(!css.includes('transition:width .55s steps(20,end)'));
 assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
});
