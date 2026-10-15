import {PGlite} from "@electric-sql/pglite";
import {test,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const db=new PGlite();
const user=i=>"10000000-0000-4000-8000-"+String(i).padStart(12,"0");
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema iid_private;
create function auth.uid() returns uuid language sql as
$$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
grant usage on schema auth,iid_private to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table public.iid_profiles(
 user_id uuid primary key,nickname text not null,origin text not null,
 country_code text not null,custom_flag text);
create table public.iid_economy_control(id int primary key,v2_enabled boolean not null default false);
insert into public.iid_economy_control values(1,false);
create table public.iid_battles(
 id uuid primary key default gen_random_uuid(),user_id uuid not null,
 action text not null,engine_version smallint not null default 1,
 power int,war_influence int,applied_hp int,created_at timestamptz not null default now(),settled_at timestamptz);
create function iid_private.require_player() returns uuid language plpgsql
 security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from public.iid_profiles where user_id=u)
 then raise exception 'PROFILE_REQUIRED';end if;
 return u;
end $$;
`);
for(let i=1;i<=13;i++){
 const u=user(i);
 await db.query("insert into public.iid_profiles(user_id,nickname,origin,country_code,custom_flag) values($1,$2,'HUMAN',$3,null)",[u,"Player_"+i,i%2?"IDN":"JPN"]);
}
const u1=user(1);
await db.query("insert into public.iid_battles(user_id,action,engine_version,power,applied_hp,settled_at) values($1,'HEAL',1,200,150,now())",[u1]);
await db.exec(await readFile("supabase/migrations/20261015025000_phase2_hall_of_fame.sql","utf8"));
await db.exec(await readFile("supabase/migrations/20261015032000_hof_verified_hp.sql","utf8"));
await db.exec(await readFile("supabase/migrations/20261015041000_v2_hof_totals.sql","utf8"));
await db.exec(await readFile("supabase/migrations/20261015100000_hof_faction_points_legendary_top3.sql","utf8").then(s=>s.slice(0,s.indexOf("-- Developer reset must clear"))));
async function login(i=13,role="authenticated"){
 await db.exec("reset role");
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user(i)})]);
 await db.exec("set role "+role);
}
async function asAdmin(query,params=[]){
 await db.exec("reset role");
 try{return await db.query(query,params)}
 finally{await login()}
}
async function hall(){return (await db.query("select public.iid_hall_of_fame() as j")).rows[0].j;}
await login();
after(()=>db.close());

test("one-time backfill counts only settled battle and sealed aggregate is not client-readable",async()=>{
 const back=await asAdmin("select v1_save_power,v1_save_hp from public.iid_hof_totals where user_id=$1",[u1]);
 assert.equal(Number(back.rows[0].v1_save_power),200);
 assert.equal(Number(back.rows[0].v1_save_hp),150,"backfill counts actual world HP, not personal power");
 await assert.rejects(db.query("select * from public.iid_hof_totals"),/permission denied/);
 await login(13,"anon");
 await assert.rejects(hall(),/permission denied/);
 await login(13);
});

test("settled V1 power yields top ten, stable actual self rank below top ten, no personal IDs",async()=>{
 for(let i=2;i<=13;i++){
  const p=201-i,u=user(i);
  const out=await asAdmin("insert into public.iid_battles(user_id,action,engine_version,power,applied_hp) values($1,'HEAL',1,$2,$3) returning id",[u,p,p-30]);
  await asAdmin("update public.iid_battles set settled_at=now() where id=$1",[out.rows[0].id]);
 }
 const info=await hall();
 assert.equal(info.engine_version,1);
 assert.equal(info.score_unit,"PERSONAL POWER");
 assert.equal(info.save.top.length,10);
 assert.equal(Number(info.save.total_score),2522);
 assert.equal(Number(info.save.top[0].score),200);
 assert.equal(Number(info.save.top[0].hp),150);
 assert.equal(Number(info.save.top[9].hp),161);
 assert.ok(Number(info.save.total_hp)>150);
 assert.equal(info.save.top[0].nickname,"Player_1");
 assert.equal(info.save.top[9].rank,10);
 assert.equal(info.save.self.rank,13);
 assert.equal(info.save.self.in_top10,false);
 assert.equal(info.save.self.country_code,"IDN");
 assert.equal(Number(info.save.self.hp),158);
 assert.equal(Number(info.save.self.score),188);
 assert.equal(info.kill.self.qualified,false);
 assert.doesNotMatch(JSON.stringify(info),/10000000-0000-4000|email/);
 const row=await asAdmin("select id from public.iid_battles where user_id=$1 limit 1",[user(13)]);
 await asAdmin("update public.iid_battles set settled_at=now() where id=$1",[row.rows[0].id]);
 const again=await hall();
 assert.equal(again.save.self.rank,13,"no double credit after re-settlement update");
 assert.equal(again.save.self.hp,info.save.self.hp,"no second HP credit");
});

test("KILL and V2 War Influence remain distinct; V2 does not inherit V1 scores",async()=>{
 const v1=await asAdmin("insert into public.iid_battles(user_id,action,engine_version,power,applied_hp) values($1,'KILL',1,80,65) returning id",[user(13)]);
 await asAdmin("update public.iid_battles set settled_at=now() where id=$1",[v1.rows[0].id]);
 assert.equal((await hall()).kill.self.rank,1);
 assert.equal((await hall()).kill.self.hp,65);
 assert.equal((await hall()).kill.total_hp,65);
 const v2=await asAdmin("insert into public.iid_battles(user_id,action,engine_version,war_influence,applied_hp) values($1,'HEAL',2,300,900),($2,'HEAL',2,200,900) returning id",[user(13),user(12)]);
 await asAdmin("update public.iid_battles set settled_at=now() where id=$1 or id=$2",[v2.rows[0].id,v2.rows[1].id]);
 await asAdmin("update public.iid_economy_control set v2_enabled=true where id=1");
 const v2Ranks=await hall();
 assert.equal(v2Ranks.engine_version,2);
 assert.equal(v2Ranks.score_unit,"WAR INFLUENCE");
 assert.equal(v2Ranks.save.top.length,2);
 assert.equal(Number(v2Ranks.save.total_score),500);
 assert.equal(Number(v2Ranks.kill.total_score),0);
 assert.equal(v2Ranks.save.top[0].nickname,"Player_13");
 assert.equal(v2Ranks.save.self.rank,1);
 assert.equal(v2Ranks.save.self.score,300);
 assert.equal(v2Ranks.save.self.hp,158,"V2 is influence, not invented individual HP");
 assert.equal(v2Ranks.kill.top.length,0);
 await asAdmin("update public.iid_economy_control set v2_enabled=false where id=1");
 assert.equal((await hall()).save.self.rank,13);
});

test("30-day Legendary Top 3 uses single strongest verified V2 battle per unique player",async()=>{
 await asAdmin("update public.iid_economy_control set v2_enabled=true where id=1");
 const records=[
  [1,"HEAL",900,140],
  [1,"KILL",1400,185],
  [1,"HEAL",1200,165],
  [2,"HEAL",1300,175],
  [3,"KILL",1100,165],
  [4,"HEAL",1000,150]
 ];
 let repeatedId=null;
 for(const [person,action,power,influence] of records){
  const t=await asAdmin(
   "insert into public.iid_battles(user_id,action,engine_version,power,war_influence,applied_hp) values($1,$2,2,$3,$4,0) returning id",
   [user(person),action,power,influence]);
  const battle=t.rows[0].id;
  await asAdmin("update public.iid_battles set settled_at=now() where id=$1",[battle]);
  if(person===2)repeatedId=battle;
 }
 const rank=await hall();
 assert.equal(rank.engine_version,2);
 assert.equal(rank.score_unit,"FACTION POINTS");
 assert.equal(rank.period,"30-DAY LEADERBOARD CYCLE");
 assert.equal(rank.legendary.length,3);
 assert.deepEqual(rank.legendary.map(x=>x.nickname),["Player_1","Player_2","Player_3"]);
 assert.deepEqual(rank.legendary.map(x=>x.power),[1400,1300,1100]);
 assert.deepEqual(rank.legendary.map(x=>x.action),["KILL","HEAL","KILL"]);
 assert.equal(rank.save.top[0].nickname,"Player_1");
 assert.equal(rank.save.top[0].score,140+165);
 assert.ok(rank.season.ends_at);
 assert.doesNotMatch(JSON.stringify(rank),/10000000-0000-4000|email/);
 const before=(await asAdmin("select save_points,kill_points from public.iid_hof_season_totals where user_id=$1 and season_no=$2",[user(2),rank.season.number])).rows[0];
 await asAdmin("update public.iid_battles set settled_at=now() where id=$1",[repeatedId]);
 const after=(await asAdmin("select save_points,kill_points from public.iid_hof_season_totals where user_id=$1 and season_no=$2",[user(2),rank.season.number])).rows[0];
 assert.deepEqual(after,before,"re-settlement cannot inflate points");
 await login(13,"anon");
 await assert.rejects(db.query("select * from public.iid_hof_season_totals"),/permission denied/);
 await assert.rejects(hall(),/permission denied/);
 await login(13);
 await asAdmin("update public.iid_economy_control set v2_enabled=false where id=1");
});
