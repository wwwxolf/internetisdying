import {PGlite} from "@electric-sql/pglite";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {initDeveloperMode} from "../public/developer-mode.js";
const U="10000000-0000-4000-8000-000000000001",V="10000000-0000-4000-8000-000000000002";
const S="20000000-0000-4000-8000-000000000001";
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
 create table auth.identities(user_id uuid,provider text);
 create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
 create function auth.uid() returns uuid language sql as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 grant usage on schema auth to anon,authenticated;
 grant execute on all functions in schema auth to anon,authenticated;
 insert into auth.users(id) values('${U}');
 insert into auth.identities values('${U}','google');
 insert into auth.sessions values('${S}','${U}',null);
`);
for(const f of (await readdir("supabase/migrations")).filter(x=>x.endsWith(".sql")&&!x.includes("_game_economy_v2_scheduler_staged.sql")).sort()){
 await db.exec(await readFile("supabase/migrations/"+f,"utf8"));
}
await db.query("insert into public.iid_profiles(user_id,nickname,origin,country_code,custom_flag) values($1,'OLF','BOT','IDN',null)",[U]);
async function role(as="authenticated",uid=U,sid=S){
 await db.exec("reset role");
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,session_id:sid,app_metadata:{provider:"google"}})]);
 await db.exec("set role "+as);
}
async function admin(sql){await db.exec("reset role");await db.exec(sql);await role();}
async function readAdmin(sql){await db.exec("reset role");try{return (await db.query(sql)).rows[0]}finally{await role();}}
async function status(){return (await db.query("select public.iid_developer_status() j")).rows[0].j;}
async function reset(txt="RESET WORLD_001"){return (await db.query("select public.iid_developer_reset($1::text) j",[txt])).rows[0].j;}
await role();
test("reset RPC is owner-only and absent for anon clients",async()=>{
 assert.equal((await status()).allowed,false);
 await assert.rejects(reset(),/DEVELOPER_ONLY/);
 await role("anon");
 await assert.rejects(status(),/permission denied/);
 await assert.rejects(reset(),/permission denied/);
 await role();
 await admin(`insert into iid_private.iid_developer_operators(user_id) values('${U}')`);
 assert.equal((await status()).allowed,true);
 await assert.rejects(reset("RESET"),/RESET_CONFIRMATION_REQUIRED/);
});
test("refuse deletion if a second auth user or profile exists",async()=>{
 await admin(`insert into auth.users(id) values('${V}')`);
 assert.equal((await status()).allowed,false);
 await assert.rejects(reset(),/RESET_DISABLED_MULTIPLAYER/);
 await admin(`insert into public.iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${V}','SECOND','GLITCH','USA',null)`);
 assert.equal((await status()).allowed,false);
 await assert.rejects(reset(),/RESET_DISABLED_MULTIPLAYER/);
 await admin(`delete from public.iid_profiles where user_id='${V}';delete from auth.users where id='${V}'`);
 assert.equal((await status()).allowed,true);
});
test("repeated reset clears battle/world/ranking/momentum but preserves developer and Google identity",async()=>{
 await admin("update public.iid_world set hp=502000,version=1,enabled=true;update public.iid_economy_control set v2_enabled=true");
 const started=(await db.query("select public.iid_battle_start(gen_random_uuid(),'HEAL') j")).rows[0].j;
 assert.equal(started.engine_version,2);
 await admin(`update public.iid_battles set created_at=statement_timestamp()-interval '13 seconds',
 starts_at=statement_timestamp()-interval '11 seconds',ends_at=statement_timestamp()-interval '1 second',
 counted_taps=50 where id='${started.id}'`);
 const result=(await db.query("select public.iid_battle_settle($1::uuid) j",[started.id])).rows[0].j;
 assert.equal(result.bonus,6);
 assert.equal((await db.query("select count(*)::int n from public.iid_battles")).rows[0].n,1);
 assert.equal((await readAdmin("select count(*)::int n from public.iid_hof_totals")).n,1);
 assert.equal((await readAdmin("select count(*)::int n from public.iid_v2_live_buckets")).n,1);
 const one=await reset();
 assert.deepEqual([one.ok,one.world_hp,one.previous_hp,one.deleted_battles,one.player_identity_kept],[true,500000,502000,1,true]);
 for(const table of ["iid_battles","iid_hof_totals","iid_v2_live_buckets","iid_v2_window_results","iid_player_presence","iid_share_cards","iid_chaos_votes","iid_decay_pulses"]){
  const count=(await readAdmin("select count(*)::int n from public."+table)).n;
  assert.equal(count,0,table);
 }
 assert.deepEqual((await db.query("select hp,version from public.iid_world where id=1")).rows[0],{hp:500000,version:0});
 assert.equal((await db.query("select count(*)::int n from public.iid_profiles")).rows[0].n,1);
 assert.equal((await readAdmin("select count(*)::int n from auth.users")).n,1);
 assert.equal((await status()).allowed,true);
 const twice=await reset();
 assert.equal(twice.deleted_battles,0);
 assert.equal(twice.world_hp,500000);
 const fresh=(await db.query("select public.iid_battle_start(gen_random_uuid(),'KILL') j")).rows[0].j;
 assert.equal(fresh.engine_version,2,"same UTC window is playable again");
});
test("developer controls require server permission and explicit typed confirmation",async()=>{
 function fixture(){
  const els=new Map(["arena-dev-mode","dev-reset-confirm","dev-reset-button","dev-reset-message"].map(id=>[id,{
   hidden:id==="arena-dev-mode",disabled:true,value:"",textContent:"",events:{},
   addEventListener(k,fn){this.events[k]=fn;}
  }]));
  let reload=0;
  return {els,doc:{getElementById:id=>els.get(id)},win:{location:{reload(){reload++}}},
   reloaded:()=>reload};
 }
 const notAllowed=fixture();
 await initDeveloperMode({sb:{rpc:async()=>({data:{allowed:false},error:null})},doc:notAllowed.doc,win:notAllowed.win});
 assert.equal(notAllowed.els.get("arena-dev-mode").hidden,true);
 let calls=[];
 const permitted=fixture();
 await initDeveloperMode({sb:{rpc:async(n,args)=>{calls.push([n,args]);return n==="iid_developer_status"
 ?{data:{allowed:true}}:{data:{ok:true,world_hp:500000}};}},doc:permitted.doc,win:permitted.win});
 const confirm=permitted.els.get("dev-reset-confirm"),button=permitted.els.get("dev-reset-button");
 assert.equal(permitted.els.get("arena-dev-mode").hidden,false);
 confirm.value="RESET";confirm.events.input();assert.equal(button.disabled,true);
 confirm.value="RESET WORLD_001";confirm.events.input();assert.equal(button.disabled,false);
 await button.events.click();
 assert.deepEqual(calls.at(-1),["iid_developer_reset",{p_confirm:"RESET WORLD_001"}]);
 assert.equal(permitted.reloaded(),1);
 assert.match(permitted.els.get("dev-reset-message").textContent,/RESET COMPLETE/);
});
test("Arena contains hidden developer controls and does not reveal authorization IDs",async()=>{
 const html=await readFile("public/arena.html","utf8");
 const flow=await readFile("public/flow.js","utf8");
 const module=await readFile("public/developer-mode.js","utf8");
 assert.match(html,/id="arena-dev-mode"[^>]*hidden/);
 assert.match(flow,/developer-mode\.js\?v=1/);
 assert.match(module,/iid_developer_status/);
 assert.match(module,/iid_developer_reset/);
 assert.doesNotMatch(html,/dd9a984e/);
});
after(()=>db.close());
