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
for(const f of (await readdir("supabase/migrations")).filter(x=>x.endsWith(".sql")&&!x.includes("_game_economy_v2_scheduler_staged.sql")&&!x.includes("_v4_cron_registered_disabled.sql")).sort()){
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
 for(const table of ["iid_battles","iid_hof_totals","iid_hof_season_totals","iid_v2_live_buckets","iid_v2_window_results","iid_player_presence","iid_share_cards","iid_chaos_votes","iid_decay_pulses"]){
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
test("V4 cutover freeze blocks stale V1/V2 inputs but lets accepted battles drain without erasing identities",async()=>{
 // Disposable PGlite fixture with REAL production migrations; never touch Supabase.
 await role();
 await reset();
 await admin("update public.iid_world set hp=504100,version=5,enabled=true;update public.iid_economy_control set v2_enabled=true");
 const first=(await db.query("select public.iid_battle_start(gen_random_uuid(),'HEAL') j")).rows[0].j;
 assert.equal(first.engine_version,2);
 const control=await readAdmin("select legacy_admission_open,legacy_admission_paused_at from iid_v4.cutover_control where id=1");
 assert.deepEqual(control,{legacy_admission_open:true,legacy_admission_paused_at:null});
 await admin("update iid_v4.cutover_control set legacy_admission_open=false,legacy_admission_paused_at=clock_timestamp() where id=1");
 assert.equal((await readAdmin("select legacy_admission_open from iid_v4.cutover_control")).legacy_admission_open,false);
 // Same accepted session may complete, including a reconnect from a stale tab.
 await admin(`update public.iid_battles set created_at=clock_timestamp()-interval '13 seconds',
   starts_at=clock_timestamp()-interval '11 seconds',
   ends_at=clock_timestamp()-interval '1 second',counted_taps=50 where id='${first.id}'`);
 const settled=(await db.query("select public.iid_battle_settle($1::uuid) j",[first.id])).rows[0].j;
 assert.equal(settled.engine_version,2);
 assert.equal(settled.counted_taps,50);
 assert.ok(settled.settled_at);
 const repeated=(await db.query("select public.iid_battle_start($1::uuid,'HEAL') j",[first.request_id])).rows[0].j;
 assert.equal(repeated.id,first.id,'old accepted idempotency remains read-safe');
 // A direct row insert models a late browser/API attempting a new legacy start,
 // bypassing any UI/JS/old RPC selection logic: the DB must still reject it.
 await assert.rejects(admin(`insert into public.iid_battles(user_id,request_id,nickname,action,engine_version,created_at,starts_at,ends_at)
   values('${U}',gen_random_uuid(),'OLF','KILL',2,clock_timestamp(),clock_timestamp()+interval '2 seconds',clock_timestamp()+interval '12 seconds')`),/LEGACY_ADMISSION_CLOSED/);
 await assert.rejects(admin(`insert into public.iid_chaos_votes(day_utc,user_id,choice)
  values((clock_timestamp() at time zone 'UTC')::date,'${U}','damage')`),/LEGACY_ADMISSION_CLOSED/);
 // All archived ledgers are protected from developer reset and direct deletion.
 await assert.rejects(reset(),/LEGACY_HISTORY_PROTECTED/);
 await assert.rejects(admin("delete from public.iid_battles"),/LEGACY_HISTORY_PROTECTED/);
 await assert.rejects(admin("truncate public.iid_share_cards"),/LEGACY_HISTORY_PROTECTED/);
 assert.equal((await readAdmin("select count(*)::int n from auth.users")).n,1);
 assert.equal((await readAdmin("select count(*)::int n from public.iid_profiles")).n,1);
 assert.equal((await readAdmin("select count(*)::int n from public.iid_battles")).n,1);
 assert.equal((await readAdmin("select hp from public.iid_world where id=1")).hp,504100);
 // Only simulation reopens; production code never changes admission state.
 await admin("update iid_v4.cutover_control set legacy_admission_open=true,legacy_admission_paused_at=null where id=1");
});
test("scheduled V4 clean launch is atomic, fails closed, resets game profiles but not Google Auth",async()=>{
 // Only in disposable PGlite: replace every wall-clock read with the exact
 // scheduled instant. All destructive SQL remains identical to production.
 await admin("create schema cron;create table cron.job(jobid bigint primary key,jobname text,active boolean);");
 await admin(`create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $fn$
  update cron.job set active=alter_job.active where jobid=alter_job.job_id
 $fn$;`);
 await admin("insert into cron.job values(1,'iid-v2-world-tick',true),(2,'iid-v4-settlement',false);");
 const migration=await readFile("supabase/migrations/20261016210500_v4_scheduled_clean_launch.sql","utf8");
 const fn=migration.match(/create function iid_v4\.execute_clean_launch\(\) returns jsonb[\s\S]*?end \$\$;/)?.[0];
 assert.ok(fn,'schedule function extracted from production SQL');
 const injected=fn.replaceAll("clock_timestamp()","(ctl.launch_at+interval '1 second')")
  .replace("create function iid_v4.execute_clean_launch","create or replace function iid_v4.execute_clean_launch");
 assert.notEqual(injected,fn,"test fixture changes ONLY clock source");
 assert.ok(!injected.includes("clock_timestamp()"),"all cutover reads share the frozen test clock, including backlog validation");
 await admin(injected);
 await admin("update public.iid_world set enabled=true,hp=506000,version=3;update public.iid_economy_control set v2_enabled=true;");
 await admin("delete from public.iid_battles;");
 const authCount=(await readAdmin("select count(*)::int n from auth.users")).n;
 const first=(await db.query("select public.iid_battle_start(gen_random_uuid(),'KILL') as b")).rows[0].b;
 assert.equal(first.engine_version,2);
 // Missing the launch cron job must reject BEFORE deleting anything.
 await assert.rejects(admin("select iid_v4.execute_clean_launch()"),/CUTOVER_CRON_INVARIANT/);
 assert.equal((await readAdmin("select count(*)::int n from public.iid_battles")).n,1);
 assert.equal((await readAdmin("select count(*)::int n from public.iid_profiles")).n,1);
 await admin("insert into cron.job values(3,'iid-v4-clean-launch',true)");
 const success=(await readAdmin("select iid_v4.execute_clean_launch() j")).j;
 assert.equal(success.status,'COMPLETED');
 assert.equal(success.initial_hp,500000);
 assert.equal(success.google_accounts_preserved,authCount);
 const world=(await readAdmin("select hp,admission,published from iid_v4.epochs")).hp;
 assert.equal(world,500000);
 assert.equal((await readAdmin("select count(*)::int n from iid_v4.events")).n,331);
 for(const tb of ['iid_profiles','iid_battles','iid_chaos_votes',
  'iid_share_cards','iid_hof_totals','iid_hof_season_totals','iid_v2_window_results']){
  assert.equal((await readAdmin("select count(*)::int n from public."+tb)).n,0,tb);
 }
 assert.equal((await readAdmin("select count(*)::int n from auth.users")).n,authCount);
 assert.equal((await readAdmin("select enabled from public.iid_world where id=1")).enabled,false);
 const jobs=(await readAdmin("select jsonb_object_agg(jobname,active) j from cron.job")).j;
 assert.equal(jobs['iid-v2-world-tick'],false);
 assert.equal(jobs['iid-v4-settlement'],true);
 assert.equal(jobs['iid-v4-clean-launch'],false);
 assert.equal((await readAdmin("select legacy_frozen from iid_v4.cutover_control")).legacy_frozen,true);
 assert.equal((await readAdmin("select legacy_admission_open from iid_v4.cutover_control")).legacy_admission_open,false);
 const twice=(await readAdmin("select iid_v4.execute_clean_launch() j")).j;
 assert.equal(twice.status,'COMPLETED');
 assert.equal((await readAdmin("select count(*)::int n from iid_v4.epochs")).n,1);
 await assert.rejects(admin("insert into public.iid_battles (id) values(gen_random_uuid())"),/LEGACY_ADMISSION_CLOSED/);
 await assert.rejects(admin("update public.iid_world set hp=499999"),/LEGACY_WORLD_FROZEN/);
});
after(()=>db.close());

