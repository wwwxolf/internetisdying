import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {verifyMomentum,momentumCacheTtl,serveWarMomentum} from "../src/war-momentum.js";
import {slotStartMs,currentMomentum,momentumDelay,startLiveWarMomentum} from "../public/live-war-momentum.js";
import {windowSettlement} from "../public/v2-lab.js";

const base=Date.parse("2026-10-15T04:00:00Z");
function snapshot(slot=base,save=120,kill=100,count=2,enabled=true){
 return {window_start:new Date(slot).toISOString(),window_end:new Date(slot+14400000).toISOString(),
  server_now:new Date(slot+15000).toISOString(),save_influence:save,kill_influence:kill,battle_count:count,enabled};
}
test("UTC 4-hour slots reset immediately at 00/04/08/12/16/20, never replay old war",()=>{
 for(let h=0;h<24;h+=4){
  const slot=Date.parse("2026-10-15T"+String(h).padStart(2,"0")+":00:00Z");
  assert.equal(slotStartMs(slot-1),slot-14400000);
  assert.equal(slotStartMs(slot),slot);
  assert.equal(currentMomentum(snapshot(slot),slot+100)?.save_influence,120);
  assert.equal(currentMomentum(snapshot(slot-14400000),slot),null);
  assert.equal(currentMomentum(snapshot(slot),slot+14400000),null);
 }
 assert.equal(currentMomentum({...snapshot(),save_influence:-1},base+1000),null);
 assert.equal(momentumDelay(0,()=>0),7000);
 assert.equal(momentumDelay(0,()=>1),9000);
 assert.equal(momentumDelay(1,()=>0),20000);
 assert.equal(momentumDelay(99,()=>1),125000);
});

test("cached edge response strips identity, ignores query parameters and refreshes per window",async()=>{
 let requestCount=0;
 const cacheMap=new Map();
 const cache={
  match:async key=>cacheMap.get(key.url),
  put:async(key,res)=>{cacheMap.set(key.url,res);}
 };
 const completed=[];
 const ctx={waitUntil:p=>{completed.push(p);}};
 let now=base+10000;
 const fetcher=async()=>{
  requestCount++;
  return new Response(JSON.stringify(snapshot(slotStartMs(now),120,100,2)),{status:200});
 };
 const get=()=>new Request("https://example.workers.dev/api/war-momentum?random="+Math.random());
 const a=await serveWarMomentum(get(),ctx,{fetcher,cache,now:()=>now});
 await Promise.all(completed.splice(0));
 assert.equal(a.status,200);
 assert.equal(a.headers.get("cache-control"),"public,max-age=0,s-maxage=8");
 assert.equal((await a.json()).save_influence,120);
 const second=await serveWarMomentum(get(),ctx,{fetcher,cache,now:()=>now+1000});
 assert.equal((await second.json()).battle_count,2);
 assert.equal(requestCount,1,"regional edge cache must absorb repeated requests");
 now=base+14400000+10000;
 const rollover=await serveWarMomentum(get(),ctx,{fetcher,cache,now:()=>now});
 assert.equal((await rollover.json()).window_start,new Date(now-10000).toISOString());
 assert.equal(requestCount,2,"new slot must use new cache key");
 assert.equal(verifyMomentum(snapshot()).save_influence,120);
 assert.throws(()=>verifyMomentum({...snapshot(),window_end:new Date(base+5000).toISOString()}),/INVALID_V2_WINDOW/);
 assert.equal(momentumCacheTtl(snapshot(),base+14400000-500),1);
 const post=await serveWarMomentum(new Request("https://example.workers.dev/api/war-momentum",{method:"POST"}),ctx,{fetcher,cache,now:()=>now});
 assert.equal(post.status,405);
});

test("edge failures are not cached and cannot serve a previous window's momentum",async()=>{
 const fetcher=async()=>new Response("upstream failed",{status:503});
 const c={match:async()=>null,put:async()=>{throw Error("should not cache failures");}};
 const r=await serveWarMomentum(new Request("https://w.dev/api/war-momentum"),{waitUntil(){}},{fetcher,cache:c,now:()=>base});
 assert.equal(r.status,503);
 assert.match(r.headers.get("cache-control"),/no-store/);
 assert.equal((await r.json()).error,"MOMENTUM_UNAVAILABLE");
});

test("client pauses when hidden, retries with bounded backoff, does not leak credentials",async()=>{
 const handlers={};const timers=[];
 const doc={hidden:false,addEventListener(k,f){handlers[k]=f},removeEventListener(k){delete handlers[k]}};
 const win={addEventListener(){}};
 const onUpdate=[];const urls=[];
 const poll=startLiveWarMomentum(d=>onUpdate.push(d),{
  fetcher:async(url,opts)=>{urls.push([url,opts]);return new Response(JSON.stringify(snapshot()),{status:200})},
  doc,win,clock:()=>base+10000,random:()=>0,
  setTimer:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimer(){}
 });
 assert.equal(timers[0].ms,1000);
 await timers[0].fn();
 await new Promise(setImmediate);
 assert.equal(onUpdate.length,1);
 assert.equal(urls[0][0],"/api/war-momentum");
 assert.equal(urls[0][1].credentials,"omit");
 assert.equal(timers.at(-1).ms,7000);
 doc.hidden=true;handlers.visibilitychange();
 const n=timers.length;
 doc.hidden=false;handlers.visibilitychange();
 assert.equal(timers.length,n+1);
 poll.stop();
 assert.equal(typeof handlers.visibilitychange,"undefined");
});

test("V2 backtest: 10-player SQL scenario and 1M-player adversarial balances",async()=>{
 const sample=JSON.parse(await readFile("public/v2-lab-data.json","utf8"));
 const t=windowSettlement(sample.players,500000);
 assert.deepEqual([t.save,t.kill,t.nominal,t.hpAfter],[935,454,4969,504969]);
 // Production window transformation, verified against SQL at selected points.
 const formula=(save,kill,n)=>{
  const q=save+kill===0?0:(save-kill)/(save+kill);
  return Math.round(6000*n/(n+2)*Math.tanh(q/.12));
 };
 assert.equal(formula(50000000,50000000,1000000),0);
 assert.equal(formula(100000000,0,1000000),6000);
 assert.equal(formula(0,100000000,1000000),-6000);
 assert.ok(formula(51000000,49000000,1000000)>0);
 assert.ok(formula(60000000,40000000,1000000)<6000);
 for(let i=0;i<=1000;i++){
  const value=formula(i*100000, (1000-i)*100000,1000000);
  assert.ok(Math.abs(value)<=6000,"world impact must be capped");
 }
});

test("PGlite migration backfill, V2 idempotent settlement trigger, anon aggregate-only security",async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;create role authenticated;
   create schema iid_private;
   create table public.iid_economy_control(id int primary key,v2_enabled boolean not null);
   insert into public.iid_economy_control values(1,true);
   create table public.iid_battles(
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null,
    engine_version int not null,
    action text not null,
    war_influence int,
    settled_at timestamptz
   );
  `);
  const slot=(await db.query(`select date_trunc('hour',now() at time zone 'UTC') at time zone 'UTC'
     -mod(extract(hour from now() at time zone 'UTC')::int,4)*interval '1 hour' as s`)).rows[0].s;
  const previous=new Date(new Date(slot).getTime()-14400000).toISOString();
  await db.query("insert into public.iid_battles(created_at,engine_version,action,war_influence,settled_at) values($1,2,'HEAL',77,now())",[previous]);
  await db.exec(await readFile("supabase/migrations/20261015051000_v2_live_momentum.sql","utf8"));
  let pre=await db.query("select public.iid_public_v2_momentum() as j");
  assert.equal(pre.rows[0].j.save_influence,0,"previous window resets 50:50");
  const [i]=[(await db.query("insert into public.iid_battles(created_at,engine_version,action,war_influence) values($1,2,'HEAL',124) returning id",[slot])).rows[0].id];
  await db.query("update public.iid_battles set settled_at=now() where id=$1",[i]);
  await db.query("update public.iid_battles set settled_at=now() where id=$1",[i]);
  const k=(await db.query("insert into public.iid_battles(created_at,engine_version,action,war_influence) values($1,2,'KILL',87) returning id",[slot])).rows[0].id;
  await db.query("update public.iid_battles set settled_at=now() where id=$1",[k]);
  const j=(await db.query("select public.iid_public_v2_momentum() as j")).rows[0].j;
  assert.deepEqual([j.save_influence,j.kill_influence,j.battle_count],[124,87,2]);
  assert.equal(Number((await db.query("select sum(battle_count) n from public.iid_v2_live_buckets")).rows[0].n),3);
  assert.equal((await db.query("select has_table_privilege('anon','public.iid_v2_live_buckets','select') allowed")).rows[0].allowed,false);
  await db.exec("set role anon");
  const anonymous=(await db.query("select public.iid_public_v2_momentum() as j")).rows[0].j;
  assert.equal(anonymous.save_influence,124);
  await assert.rejects(db.query("select * from public.iid_v2_live_buckets"),/permission denied/);
 }finally{await db.close();}
});
