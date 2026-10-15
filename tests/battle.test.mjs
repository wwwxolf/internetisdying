import {PGlite} from '@electric-sql/pglite';
import {readFile, readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test, after} from 'node:test';

const db = new PGlite();
const U='10000000-0000-4000-8000-000000000001', V='10000000-0000-4000-8000-000000000002';
const S='20000000-0000-4000-8000-000000000001';
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key, deleted_at timestamptz, banned_until timestamptz);
create table auth.identities(user_id uuid, provider text);
create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
create function auth.uid() returns uuid language sql as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
`);
await db.exec(`create function auth.jwt() returns jsonb language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
grant usage on schema auth to anon,authenticated;
grant execute on all functions in schema auth to anon,authenticated;
insert into auth.users(id) values('${U}'),('${V}');
insert into auth.identities values('${U}','google'),('${V}','google');
insert into auth.sessions values('${S}','${U}',null);`);
// pg_cron is a Supabase-hosted extension and is not provided by PGlite.
// The scheduler migration is validated against the live Supabase database separately.
for (const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&!f.includes('_game_economy_v2_scheduler_staged.sql')).sort()) {
  await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
}
await db.exec(`insert into public.iid_profiles(user_id,nickname,origin) values('${U}','PlayerOne','HUMAN'),('${V}','PlayerTwo','GLITCH')`);
const claims = {sub:U,app_metadata:{provider:'google'},session_id:S};
async function login(c=claims,role='authenticated') {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify(c)]);
  await db.exec('set role '+role);
}
async function admin(sql) {await db.exec('reset role'); await db.exec(sql); await login();}
async function rpc(name,args=[],types=[]) {
  return (await db.query(`select public.iid_battle_${name}(${args.map((_,i)=>'$'+(i+1)+'::'+types[i]).join(',')}) as result`,args)).rows[0].result;
}
async function start(action='HEAL',req=crypto.randomUUID()) {return rpc('start',[req,action],['uuid','text']);}
async function tap(id,n) {return rpc('tap',[id,n],['uuid','integer']);}
async function settle(id) {return rpc('settle',[id],['uuid']);}
async function expire(id) {await admin(`update public.iid_battles set created_at=statement_timestamp()-interval '30 seconds',starts_at=statement_timestamp()-interval '27 seconds',ends_at=statement_timestamp()-interval '7 seconds' where id='${id}'`);}
async function fresh() {await admin('truncate public.iid_battles,public.iid_v2_window_results; update public.iid_economy_control set v2_enabled=false,activated_at=null; update public.iid_world set hp=500000,version=0,enabled=true;');}
await login();
after(()=>db.close());

test('migration defaults to paused and 500000 HP',async()=>{
  const s=await rpc('status');assert.equal(s.world.hp,500000);assert.equal(s.world.enabled,false);
  await assert.rejects(start(),/BATTLE_PAUSED/);assert.equal(s.monthly.tier,null);
});
test('Google identity, valid session and profile enforced on server',async()=>{
  await login({...claims,app_metadata:{provider:'email'}});await assert.rejects(rpc('status'),/GOOGLE_LOGIN_REQUIRED/);
  await login({...claims,session_id:crypto.randomUUID()});await assert.rejects(rpc('status'),/GOOGLE_LOGIN_REQUIRED/);
  await login({...claims,sub:V});await assert.rejects(rpc('status'),/GOOGLE_LOGIN_REQUIRED/);
  await login();
});
test('anonymous callers cannot invoke mutations or read history',async()=>{
  await login({},'anon');await assert.rejects(start(),/permission denied/);
  await assert.rejects(db.query('select * from public.iid_battles'),/permission denied/);
  await assert.rejects(rpc('tap_batch',['00000000-0000-0000-0000-000000000000',1],['uuid','integer']),/permission denied/);
  assert.equal((await db.query('select hp from public.iid_world')).rows[0].hp,500000);await login();
});
test('start is idempotent; separate request or opposite side resumes same pending battle',async()=>{
  await fresh();const key=crypto.randomUUID();const b=await start('HEAL',key);
  assert.equal((await start('HEAL',key)).id,b.id);assert.equal((await start('KILL')).id,b.id);
  await assert.rejects(start('KILL',key),/REQUEST_CONFLICT/);
  assert.equal(new Date(b.ends_at)-new Date(b.starts_at),20000);assert.equal(b.base,null);
  await assert.rejects(start(null),/INVALID_START/);
});
test('NULL action is rejected before creating, replaying or resuming V1/V2 battles',async()=>{
  for (const v2 of [false,true]) {
    await fresh();
    if(v2)await admin('update public.iid_economy_control set v2_enabled=true');
    await assert.rejects(start(null),/INVALID_START/);
    assert.equal((await db.query('select count(*)::int as n from public.iid_battles')).rows[0].n,0);
    const key=crypto.randomUUID(), b=await start('HEAL',key);
    await assert.rejects(start(null,key),/INVALID_START/);
    await assert.rejects(start(null),/INVALID_START/);
    const rows=(await db.query('select id,action,engine_version from public.iid_battles')).rows;
    assert.deepEqual(rows,[{id:b.id,action:'HEAL',engine_version:v2?2:1}]);
    assert.equal((await db.query('select hp from public.iid_world')).rows[0].hp,500000);
  }
  await fresh();
});
test('early tap and early settlement rejected',async()=>{
  await fresh();const b=await start();await assert.rejects(tap(b.id,1),/TAP_WINDOW_CLOSED/);
  await assert.rejects(settle(b.id),/BATTLE_NOT_FINISHED/);
});
test('tap sequence is idempotent, capped, ordered and server-timed',async()=>{
  await fresh();const b=await start();
  await admin(`update public.iid_battles set created_at=statement_timestamp()-interval '4 seconds',starts_at=statement_timestamp()-interval '1 second',ends_at=statement_timestamp()+interval '19 seconds' where id='${b.id}'`);
  assert.equal((await tap(b.id,1)).counted_taps,1);assert.equal((await tap(b.id,1)).counted_taps,1);
  await assert.rejects(tap(b.id,3),/SEQUENCE_GAP/);await assert.rejects(tap(b.id,51),/INVALID_SEQUENCE/);
  for(let n=2;n<=50;n++) {await admin(`update public.iid_battles set last_tap_at=statement_timestamp()-interval '1 second' where id='${b.id}'`);await tap(b.id,n);}
  assert.equal((await tap(b.id,50)).counted_taps,50);await assert.rejects(settle(b.id),/BATTLE_NOT_FINISHED/);
  await expire(b.id);const r=await settle(b.id);assert.equal(r.bonus,10);
});
test('settlement retry leaves HP/version and permanent history unchanged',async()=>{
  await fresh();const b=await start();await expire(b.id);const r=await settle(b.id);
  assert.deepEqual(await settle(b.id),r);const s=await rpc('status');assert.equal(s.world.version,1);
  assert.equal(s.monthly.battle_count,1);assert.equal(s.monthly.heal_count,1);assert.equal(s.monthly.heal_hp,r.applied_hp);
  await assert.rejects(start(),/WINDOW_ALREADY_USED/);
  assert.equal((await start('HEAL',b.request_id)).id,b.id);
});
test('unacknowledged settlement is recoverable from status',async()=>{
  const s=await rpc('status');assert.equal(s.active,null);assert.equal(s.latest.world_version,1);
});
test('clients cannot modify world, session timing, tap totals or history',async()=>{
  for(const q of ['update public.iid_world set hp=0','update public.iid_battles set counted_taps=50',
    'delete from public.iid_battles','select iid_private.random_int(100)','select iid_private.require_player()']) {
    await assert.rejects(db.query(q),/permission denied/);
  }
});
test('other player cannot read or settle a battle',async()=>{
  const b=(await rpc('status')).latest;
  await admin(`insert into auth.sessions values('20000000-0000-4000-8000-000000000002','${V}',null)`);
  await login({...claims,sub:V,session_id:'20000000-0000-4000-8000-000000000002'});
  assert.equal((await db.query('select * from public.iid_battles')).rows.length,0);
  await assert.rejects(settle(b.id),/BATTLE_NOT_FOUND/);await login();
});
test('abandoned sessions cannot be replaced, and late taps fail',async()=>{
  await fresh();const b=await start();await expire(b.id);await assert.rejects(tap(b.id,1),/TAP_WINDOW_CLOSED/);
  assert.equal((await start()).id,b.id);await settle(b.id);await assert.rejects(start(),/WINDOW_ALREADY_USED/);
});
test('pause prevents new battles but existing sessions can settle',async()=>{
  await fresh();const b=await start();await expire(b.id);await admin('update public.iid_world set enabled=false');
  await settle(b.id);assert.equal((await rpc('status')).monthly.battle_count,1);
});
test('batched taps are idempotent, capped, paced and tied to server timestamps',async()=>{
  await fresh();
  const b=await start('HEAL');
  await admin(`update public.iid_battles
    set created_at=statement_timestamp()-interval '6 seconds',
        starts_at=statement_timestamp()-interval '3 seconds',
        ends_at=statement_timestamp()+interval '17 seconds'
    where id='${b.id}'`);
  const batch=(n)=>rpc('tap_batch',[b.id,n],['uuid','integer']);
  assert.equal((await batch(8)).counted_taps,8);
  assert.equal((await batch(8)).counted_taps,8);
  await assert.rejects(batch(19),/BATCH_TOO_LARGE/); // delta 11
  await assert.rejects(batch(9),/TAP_TOO_FAST/); // no time to earn another tap
  await assert.rejects(batch(0),/INVALID_TAP_TOTAL/);
  await assert.rejects(batch(51),/INVALID_TAP_TOTAL/);
  await admin(`update public.iid_battles set last_tap_at=statement_timestamp()-interval '2 seconds' where id='${b.id}'`);
  assert.equal((await batch(18)).counted_taps,18);
  assert.equal((await batch(8)).counted_taps,18); // stale delayed ack
  await expire(b.id);
  await assert.rejects(batch(19),/TAP_WINDOW_CLOSED/);
  const r=await settle(b.id);
  assert.equal(r.counted_taps,18);
  assert.equal(r.bonus,2); // verified 18, not locally claimed 50
  assert.equal((await batch(18)).counted_taps,18);
});

test('six UTC slots are server-owned and one battle per current slot',async()=>{
 await fresh();
 const initial=await rpc('status');
 assert.equal(initial.window_timezone,'UTC');
 assert.equal(initial.window_used.length,6);
 assert.ok(initial.window_used.every(v=>v===false));
 assert.equal(initial.window_day,new Date().toISOString().slice(0,10));
 const slot=initial.window_slot;
 const b=await start('HEAL');await expire(b.id);await settle(b.id);
 const used=await rpc('status');
 assert.equal(used.window_used[slot],true);
 assert.equal(used.window_used.filter(Boolean).length,1);
 await assert.rejects(start('KILL'),/WINDOW_ALREADY_USED/);
 // All six slots are read from server-owned start timestamps, never browser cache.
 assert.equal(used.window_day,initial.window_day);
 assert.equal(used.window_slot,initial.window_slot);

});
test('UTC unique constraint blocks replayed slots but permits slot/day rollover',async()=>{
  await fresh();
  const insertAt=t=>`insert into public.iid_battles
    (user_id,request_id,nickname,action,created_at,starts_at,ends_at,
     settled_at,base,critical,bonus,power,hp_before,hp_after,applied_hp,world_version)
    select '${U}'::uuid,gen_random_uuid(),'PlayerOne','HEAL',t,
     t+interval '3 seconds',t+interval '23 seconds',t+interval '30 seconds',
     100,1,0,100,500000,500100,100,1
    from (select '${t}'::timestamptz as t) fixture`;
  // Same UTC date, two adjacent four-hour windows are allowed.
  await admin(insertAt('2026-10-14T03:59:30Z'));
  await admin(insertAt('2026-10-14T04:00:00Z'));
  // The next UTC day resets slot zero.
  await admin(insertAt('2026-10-15T00:00:00Z'));
  // UTC+7 midnight is NOT a reset: both fall in 16:00–19:59 UTC.
  await admin(insertAt('2026-10-14T16:59:30Z'));
  await db.exec('reset role');
  try {
    await assert.rejects(db.exec(insertAt('2026-10-14T03:59:31Z')),
      /iid_one_battle_per_utc_window/);
    await assert.rejects(db.exec(insertAt('2026-10-14T17:00:00Z')),
      /iid_one_battle_per_utc_window/);
  } finally {await login();}
});
test('authenticated start path retains player-row serialization',async()=>{
  await db.exec('reset role');
  try{
    const q=await db.query("select pg_get_functiondef('iid_private.require_player()'::regprocedure) as source");
    assert.match(q.rows[0].source,/from public\.iid_profiles[\s\S]*for update/i);
  }finally{await login();}
});
test('V2 combat uses 2-second ready, 10-second play, 50 taps and compressed war influence',async()=>{
 await fresh();
 await admin("update public.iid_economy_control set v2_enabled=true,activated_at=clock_timestamp()");
 const b=await start('HEAL');
 assert.equal(b.engine_version,2);
 assert.equal(new Date(b.starts_at)-new Date(b.created_at),2000);
 assert.equal(new Date(b.ends_at)-new Date(b.starts_at),10000);
 await assert.rejects(rpc('tap_batch',[b.id,51],['uuid','integer']),/INVALID_TAP_TOTAL/);
 await admin("update public.iid_battles set created_at=statement_timestamp()-interval '14 seconds',starts_at=statement_timestamp()-interval '12 seconds',ends_at=statement_timestamp()-interval '2 seconds',counted_taps=50 where id='"+b.id+"'");
 const r=await settle(b.id);
 assert.ok(r.power>=100&&r.power<=5300);
 assert.ok([100,150,200].includes(r.critical));
 assert.equal(r.bonus,6);
 assert.ok(r.war_influence>=50&&r.war_influence<=364);
 assert.equal(r.applied_hp,0,'V2 impact only applies when the window closes');
 assert.equal(r.hp_before,r.hp_after);
 assert.equal((await rpc('status')).world.hp,500000);
 assert.deepEqual(await settle(b.id),r,'V2 settlement is idempotent');
 await admin("update public.iid_economy_control set v2_enabled=false,activated_at=null");
});

test('V2 server-verified tier thresholds are 0–6% and +6% requires exactly 50 taps',async()=>{
 const ranges=[
  [0,0],[8,0],[9,1],[16,1],[17,2],[24,2],[25,3],[33,3],
  [34,4],[41,4],[42,5],[49,5],[50,6],[51,6]
 ];
 await db.exec('reset role');
 try{
  for(const [tapCount,bonus] of ranges){
   const actual=(await db.query('select iid_private.v2_tap_bonus($1::int) as v',[tapCount])).rows[0].v;
   assert.equal(actual,bonus,'tap '+tapCount);
  }
 }finally{await login();}
 // V2 per-battle power comes from the actual server accepted taps, not local taps.
 for(const [tapCount,bonus] of [[0,0],[8,0],[9,1],[17,2],[25,3],[34,4],[42,5],[49,5],[50,6]]){
  await fresh();
  await admin('update public.iid_economy_control set v2_enabled=true,activated_at=clock_timestamp()');
  const b=await start('HEAL');
  await admin(`update public.iid_battles set created_at=statement_timestamp()-interval '13 seconds', starts_at=statement_timestamp()-interval '11 seconds',
    ends_at=statement_timestamp()-interval '1 second',counted_taps=${tapCount} where id='${b.id}'`);
  const settled=await settle(b.id);
  assert.equal(settled.bonus,bonus,'settled tap count '+tapCount);
  assert.equal(settled.engine_version,2);
  assert.equal(settled.applied_hp,0);
  assert.equal((await settle(b.id)).war_influence,settled.war_influence);
 }
 await fresh();
});

test('V2 accepts up to 50 acknowledged taps in bounded idempotent batches; 51st rejected',async()=>{
 await fresh();
 await admin('update public.iid_economy_control set v2_enabled=true,activated_at=clock_timestamp()');
 const b=await start('HEAL');
 const batches=async n=>rpc('tap_batch',[b.id,n],['uuid','integer']);
 await admin(`update public.iid_battles set created_at=statement_timestamp()-interval '7 seconds', starts_at=statement_timestamp()-interval '5 seconds',
   ends_at=statement_timestamp()+interval '5 seconds',last_tap_at=null where id='${b.id}'`);
 await assert.rejects(batches(51),/INVALID_TAP_TOTAL/);
 await assert.rejects(batches(11),/BATCH_TOO_LARGE/);
 for(const n of [10,20,30,40,50]){
  if(n>10)await admin(`update public.iid_battles set last_tap_at=statement_timestamp()-interval '1 second' where id='${b.id}'`);
  const ack=await batches(n);assert.equal(ack.counted_taps,n);
  assert.equal((await batches(n)).counted_taps,n,'retry absolute tap total');
 }
 await assert.rejects(rpc('tap',[b.id,51],['uuid','integer']),/INVALID_SEQUENCE/);
 await admin(`update public.iid_battles set ends_at=statement_timestamp()-interval '1 second' where id='${b.id}'`);
 await assert.rejects(batches(51),/INVALID_TAP_TOTAL/);
 const result=await settle(b.id);
 assert.equal(result.bonus,6);assert.equal(result.counted_taps,50);
 await fresh();
});

test('V2 Chaos is symmetric, honors quorum ten and caps absolute impact',async()=>{
 await db.exec('reset role');
 try{
   const q=async(d,r)=> (await db.query('select iid_private.chaos_impact_v2($1::bigint,$2::bigint,10) v',[d,r])).rows[0].v;
   assert.equal(await q(0,20),4123);
   assert.equal(await q(20,0),-4123);
   assert.equal(await q(5,5),0);
   assert.equal(await q(0,9),0);
   assert.ok(Math.abs(await q(0,1000000))<=12000);
 }finally{await login();}
});
test('monthly general-card boundaries, UTC summary and heal/kill aggregation',async()=>{
  await fresh();const b=await start('KILL');await expire(b.id);await settle(b.id);
  for(const [n,tier] of [[1,'Common'],[14,'Common'],[15,'Rare'],[44,'Rare'],[45,'Legendary'],[89,'Legendary'],[90,'Ancestral']]) {
    // Synthetic month history must respect the production one-per-UTC-window
    // invariant. Allocate each simulated battle a distinct four-hour slot.
    await admin(`delete from public.iid_battles where id<>'${b.id}';
      with month_clock as (
        select date_trunc('month',statement_timestamp() at time zone 'UTC')
          at time zone 'UTC' as month_start
      ), possible as (
        select month_start + g.i * interval '4 hours' as t
        from month_clock cross join generate_series(0,167) g(i)
      ), available as (
        select p.t from possible p
        where not exists (
          select 1 from public.iid_battles x
          where x.user_id='${U}'::uuid
            and x.created_at>=p.t and x.created_at<p.t+interval '4 hours'
        ) order by p.t limit ${n-1}
      )
      insert into public.iid_battles
      (id,user_id,request_id,nickname,action,created_at,starts_at,ends_at,
       counted_taps,last_tap_at,settled_at,base,critical,bonus,power,
       hp_before,hp_after,applied_hp,world_version)
      select gen_random_uuid(),b.user_id,gen_random_uuid(),b.nickname,b.action,
       a.t,a.t+interval '3 seconds',a.t+interval '23 seconds',
       b.counted_taps,null,a.t+interval '30 seconds',b.base,b.critical,b.bonus,
       b.power,b.hp_before,b.hp_after,b.applied_hp,b.world_version
      from public.iid_battles b cross join available a where b.id='${b.id}';`);
    const s=await rpc('status');assert.equal(s.monthly.tier,tier);assert.equal(s.monthly.kill_count,n);assert.equal(s.monthly.heal_count,0);
    assert.equal(s.monthly.timezone,'UTC');assert.equal(s.monthly.nickname,'PlayerOne');
  }
});
test('RNG distribution ranges and exact critical/bonus formula',async()=>{
  await fresh();
  await admin(`create table iid_private.test_rolls(pos serial,value integer);
    create or replace function iid_private.random_int(n integer) returns integer language plpgsql set search_path='' as $$
    declare v integer; begin delete from iid_private.test_rolls where pos=(select min(pos) from iid_private.test_rolls) returning value into v;
    if v is null or v>=n then raise exception 'TEST_RNG_RANGE'; end if;return v;end $$;`);
  for(const [r,c,offset,base,critical,taps] of [[0,0,0,0,1,0],[59,94,500,500,1,9],[60,95,0,501,2,10],
    [89,98,1499,2000,2,20],[90,99,0,2001,3,30],[98,0,7999,10000,1,40],[99,99,14999,25000,3,50]]) {
    await fresh();await admin(`insert into iid_private.test_rolls(value) values(${r}),(${c}),(${offset})`);
    const b=await start();await expire(b.id);await admin(`update public.iid_battles set counted_taps=${taps}`);
    const x=await settle(b.id);assert.equal(x.base,base);assert.equal(x.critical,critical);
    assert.equal(x.bonus,Math.floor(taps/10)*2);assert.equal(x.power,Math.round(base*critical*(100+x.bonus)/100));
  }
});
test('HP clamps at both boundaries and stores applied versus rolled power',async()=>{
  for(const [action,hp,after] of [['HEAL',999999,1000000],['KILL',1,0]]) {
    await fresh();await admin(`update public.iid_world set hp=${hp};insert into iid_private.test_rolls(value) values(99),(99),(14999)`);
    const b=await start(action);await expire(b.id);const r=await settle(b.id);
    assert.equal(r.hp_after,after);assert.equal(r.applied_hp,1);assert.equal(r.power,75000);
  }
});


async function crpc(name,args=[],types=[]) {
 const placeholders=args.map((_,i)=>'$'+(i+1)+'::'+types[i]).join(',');
 return (await db.query('select public.iid_chaos_'+name+'('+placeholders+') as result',args)).rows[0].result;
}

async function cronRpc(name) {
 await db.exec('reset role');
 try {return (await db.query('select iid_private.'+name+'() as result')).rows[0].result;}
 finally {await login();}
}

test('Daily Chaos catalog contains 30 digital event pairs with pixel prompts',async()=>{
 await login();
 const d=await db.query("select count(*)::int as n,min(day_rotation) as first,max(day_rotation) as last from public.iid_chaos_catalog");
 assert.equal(d.rows[0].n,30);assert.equal(d.rows[0].first,1);assert.equal(d.rows[0].last,30);
 const first=(await db.query('select * from public.iid_chaos_catalog where day_rotation=1')).rows[0];
 assert.equal(first.damage_title,'BOT INVASION');assert.equal(first.recovery_title,'GLOBAL FIREWALL');
 assert.equal(first.damage_hp,0);assert.equal(first.recovery_hp,0);
 assert.match(first.damage_pixel_prompt,/pixel art/i);
});
test('Daily Chaos is paused by default and cannot accept user votes',async()=>{
 await fresh();
 const s=await crpc('status');assert.equal(s.enabled,false);
 assert.equal(s.event.damage_title,'BOT INVASION');
 await assert.rejects(crpc('vote',['damage'],['text']),/CHAOS_PAUSED/);
 assert.equal((await db.query('select count(*)::int as n from public.iid_chaos_votes')).rows[0].n,0);
});
test('Daily Chaos voting is one per verified user per UTC day, non-editable',async()=>{
 await fresh();
 await admin("update public.iid_chaos_control set enabled=true, anchor_utc=(statement_timestamp() at time zone 'UTC')::date");
 const v=await crpc('vote',['damage'],['text']);assert.equal(v.recorded,true);
 assert.equal((await crpc('vote',['damage'],['text'])).choice,'damage');
 await assert.rejects(crpc('vote',['recovery'],['text']),/VOTE_ALREADY_CAST/);
 const st=await crpc('status');
 assert.equal(st.voted_for,'damage');assert.equal(Number(st.damage_votes),1);
 assert.equal(Number(st.recovery_votes),0);
 await login({},'anon');
 await assert.rejects(crpc('vote',['damage'],['text']),/permission denied/);
 await login();
});
test('World Decay is 800..1000 HP, idempotent per 3-hour slot and paused when disabled',async()=>{
 await fresh();
 await admin("delete from public.iid_decay_pulses; update public.iid_chaos_control set enabled=false,decay_anchor_at=statement_timestamp()-interval '6 hours 10 minutes'");
 // The preceding RNG boundary test installs a deterministic random_int fixture.
 await admin('insert into iid_private.test_rolls(value) values (50)');
 assert.match(String((await cronRpc('process_decay')).status),/PAUSED/);
 await admin('update public.iid_chaos_control set enabled=true');
 const first=await cronRpc('process_decay');
 assert.equal(first.processed,1);assert.ok(first.hp<=499200&&first.hp>=499000);
 assert.equal((await cronRpc('process_decay')).processed,0);
 const pulses=(await db.query('select * from public.iid_decay_pulses')).rows;
 assert.equal(pulses.length,1);assert.ok(pulses[0].rolled_hp>=800&&pulses[0].rolled_hp<=1000);
 await admin('update public.iid_chaos_control set enabled=false');
 assert.equal((await cronRpc('process_decay')).status,'PAUSED');
});
test('Daily Chaos 20-vote result executes once and applies Hybrid Vote Power +1333 HP',async()=>{
 await fresh();
 await admin("delete from public.iid_chaos_votes; delete from public.iid_chaos_results; delete from public.iid_chaos_days; update public.iid_chaos_control set enabled=true,anchor_utc=(statement_timestamp() at time zone 'UTC')::date-1");
 await admin("insert into public.iid_chaos_days(day_utc,rotation_day) values((statement_timestamp() at time zone 'UTC')::date-1,1)");
 await admin("insert into public.iid_chaos_votes(day_utc,user_id,choice) select (statement_timestamp() at time zone 'UTC')::date-1,gen_random_uuid(),'recovery' from generate_series(1,20)");
 const a=await cronRpc('resolve_previous_chaos');
 assert.equal(a.winner,'recovery');assert.equal(a.applied_hp,1333);assert.equal(a.nominal_hp,1333);
 assert.equal(a.damage_votes,0);assert.equal(a.recovery_votes,20);
 assert.equal(a.hp_after,501333);
 const b=await cronRpc('resolve_previous_chaos');
 assert.deepEqual(b,a);
 assert.equal((await rpc('status')).world.version,1);
 assert.equal((await db.query('select count(*)::int as n from public.iid_chaos_results')).rows[0].n,1);
});

async function expectedHybrid(damage,recovery,quorum=20) {
 await db.exec('reset role');
 try {
  const q=await db.query('select iid_private.chaos_impact($1::bigint,$2::bigint,$3::integer) as value',[damage,recovery,quorum]);
  return q.rows[0].value;
 } finally {await login();}
}
test('Hybrid Vote Power: turnout + margin formula, tie and quorum',async()=>{
 for(const [h,k,v] of [
  [100,20,3872],[10000,9920,250],[200,1000,-7972],
  [500,250,4584],[10000,0,11811],[0,20,-1333],
  [10,10,0],[10,9,0],[1,0,0],[0,0,0],[1999999,1,11999]
 ]) assert.equal(await expectedHybrid(k,h),v,h+' HEAL vs '+k+' KILL');
});
test('Hybrid Vote Power output always within ±12000 and has anti-spike bounds',async()=>{
 for(const [h,k] of [[1e8,0],[0,1e8],[250000,249999],[10000,9920],[50,50]]) {
  const impact=await expectedHybrid(k,h);
  assert.ok(Math.abs(impact)<=12000);
  if(h>k)assert.ok(impact>=0);
  if(h<k)assert.ok(impact<=0);
 }
 await db.exec('reset role');
 try{
  await assert.rejects(db.query("select iid_private.chaos_impact(-1,1,20)"),/INVALID_VOTE_COUNTS/);
 }finally{await login();}
});
test('Hybrid Vote Power server status exposes projection but cannot bypass pause',async()=>{
 await fresh();
 await admin('update public.iid_chaos_control set enabled=false, anchor_utc=null');
 const st=await crpc('status');
 assert.equal(st.enabled,false);
 assert.equal(st.maximum_impact_hp,12000);
 assert.equal(st.formula_version,'HYBRID_V1');
 assert.equal(st.projected_impact_hp,0);
 await assert.rejects(crpc('vote',['recovery'],['text']),/CHAOS_PAUSED/);
});


async function presence(mode='open'){
 return (await db.query('select public.iid_return_digest($1::text) as result',[mode])).rows[0].result;
}
test('World Return first visit is truthful and creates no fictitious activity',async()=>{
 await fresh();
 await admin("truncate public.iid_player_presence,public.iid_decay_pulses,public.iid_chaos_votes,public.iid_chaos_results,public.iid_chaos_days,public.iid_battles cascade");
 const first=await presence();
 assert.equal(first.first_visit,true);
 assert.equal(first.world_hp,500000);
 assert.equal(first.net_hp,0);
 assert.equal(first.heal_battles,0);
 assert.equal(first.kill_battles,0);
 assert.equal(first.decay_pulses,0);
 assert.equal(first.chaos_events,0);
 assert.equal(first.source,'SERVER_LEDGER');
 await db.exec('reset role');
 const activeBefore=(await db.query("select last_active_at from public.iid_player_presence where user_id=$1::uuid",[U])).rows[0].last_active_at;
 await login();
 const refresh=await presence();
 assert.equal(refresh.replayed,true);
 assert.equal(refresh.first_visit,true);
 await db.exec('reset role');
 const activeAfter=(await db.query("select last_active_at from public.iid_player_presence where user_id=$1::uuid",[U])).rows[0].last_active_at;
 await login();
 assert.equal(String(activeAfter),String(activeBefore),'refresh must not erase events from the cursor');
});
test('World Return sums actual HEAL, KILL, decay and event ledger independently',async()=>{
 await fresh();
 await admin("truncate public.iid_player_presence,public.iid_decay_pulses,public.iid_chaos_votes,public.iid_chaos_results,public.iid_chaos_days,public.iid_battles cascade");
 await presence();
 await admin("update public.iid_player_presence set last_active_at=clock_timestamp()-interval '5 hours',last_digest_at=clock_timestamp()-interval '10 minutes'");
 // Insert fully settled synthetic game rows; the return digest must never
 // infer action direction from applied_hp (all battle applied_hp are >= 0).
 await admin("insert into public.iid_battles(id,user_id,request_id,nickname,action,created_at,starts_at,ends_at,counted_taps,settled_at,base,critical,bonus,power,hp_before,hp_after,applied_hp,world_version) values "+
 " (gen_random_uuid(),'"+U+"',gen_random_uuid(),'PlayerOne','HEAL',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '2 hours'+interval '3 seconds',statement_timestamp()-interval '2 hours'+interval '23 seconds',0,clock_timestamp()-interval '90 minutes',400,1,0,400,500000,500400,400,1),"+
 " (gen_random_uuid(),'"+V+"',gen_random_uuid(),'PlayerTwo','KILL',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '2 hours'+interval '3 seconds',statement_timestamp()-interval '2 hours'+interval '23 seconds',0,clock_timestamp()-interval '90 minutes',200,1,0,200,500400,500200,200,2)");
 await admin("insert into public.iid_decay_pulses(slot_no,scheduled_at,rolled_hp,applied_hp,hp_after,world_version,settled_at) values (1,clock_timestamp()-interval '70 minutes',900,900,499300,3,clock_timestamp()-interval '60 minutes')");
 await admin("insert into public.iid_chaos_days(day_utc,rotation_day,closed) values ((clock_timestamp() at time zone 'UTC')::date,1,true)");
 await admin("insert into public.iid_chaos_results(day_utc,rotation_day,damage_votes,recovery_votes,winner,nominal_hp,applied_hp,hp_after,world_version,settled_at) values ((clock_timestamp() at time zone 'UTC')::date,1,20,100,'recovery',3872,3872,503172,4,clock_timestamp()-interval '30 minutes')");
 await admin("update public.iid_world set hp=503172,version=4");
 const r=await presence();
 assert.equal(r.first_visit,false);
 assert.equal(r.heal_battles,1);
 assert.equal(r.kill_battles,1);
 assert.equal(r.heal_hp,400);
 assert.equal(r.kill_hp,200);
 assert.equal(r.decay_hp,900);
 assert.equal(r.chaos_hp,3872);
 assert.equal(r.net_hp,3172);
 assert.equal(r.world_hp,503172);
 assert.equal(r.latest_event.title,'GLOBAL FIREWALL');
 assert.equal(r.latest_event.applied_hp,3872);
});
test('World Return heartbeat, refresh replay and security boundaries',async()=>{
 await fresh();
 await admin("truncate public.iid_player_presence cascade");
 const first=await presence();
 const hb=await presence('heartbeat');
 assert.equal(hb.heartbeat,true);
 assert.equal(hb.net_hp,undefined);
 const repeat=await presence();
 assert.equal(repeat.replayed,true);
 assert.equal(repeat.until,first.until);
 await assert.rejects(presence('set-world-hp'),/INVALID_PRESENCE_MODE/);
 await login({},'anon');
 await assert.rejects(presence(),/permission denied/);
 await assert.rejects(db.query('select * from public.iid_player_presence'),/permission denied/);
 await login();
});


test('Global Pulses counts only settled server-accepted taps, never pending or retries',async()=>{
 await fresh();
 const read=async()=>(await db.query('select public.iid_global_pulses() as result')).rows[0].result;
 const blank=await read();
 assert.equal(blank.total_pulses,0);
 assert.equal(blank.settled_battles,0);
 assert.equal(blank.world_active,true);
 const started=await start('HEAL');
 await admin("update public.iid_battles set counted_taps=17 where id='"+started.id+"'");
 assert.equal((await read()).total_pulses,0,'pending taps must not be counted');
 await expire(started.id);
 // The RNG boundary suite installs a deterministic roll fixture; seed it.
 await admin("delete from iid_private.test_rolls; insert into iid_private.test_rolls(value) values (0),(0),(0)");
 await settle(started.id);
 assert.equal((await read()).total_pulses,17);
 await settle(started.id);
 assert.equal((await read()).total_pulses,17,'idempotent settlement cannot increase Global Pulses');
 await admin("insert into public.iid_battles(id,user_id,request_id,nickname,action,created_at,starts_at,ends_at,counted_taps,settled_at,base,critical,bonus,power,hp_before,hp_after,applied_hp,world_version) values (gen_random_uuid(),'"+V+"',gen_random_uuid(),'PlayerTwo','KILL',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '2 hours'+interval '3 seconds',statement_timestamp()-interval '2 hours'+interval '23 seconds',9,clock_timestamp()-interval '90 minutes',200,1,0,200,500000,499800,200,2)");
 assert.equal((await read()).total_pulses,26,'both HEAL and KILL count accepted taps');
 assert.equal((await read()).settled_battles,2);
 await login({},'anon');
 const publicResult=await read();
 assert.equal(publicResult.total_pulses,26);
 assert.deepEqual(Object.keys(publicResult).sort(),['settled_battles','total_pulses','world_active']);
 await assert.rejects(db.query('select * from public.iid_battles'),/permission denied/);
 await login();
});


test('Breaking Internet share snapshot reads current settled ledgers without advancing presence cursor',async()=>{
 await fresh();
 await admin("truncate public.iid_player_presence,public.iid_decay_pulses,public.iid_chaos_results,public.iid_chaos_days cascade");
 const share=async()=>(await db.query('select public.iid_share_snapshot() as result')).rows[0].result;
 await assert.rejects(share(),/RETURN_REPORT_NOT_READY/);
 await presence();
 await admin("update public.iid_player_presence set last_active_at=clock_timestamp()-interval '5 hours',last_digest_at=clock_timestamp()-interval '10 minutes'");
 await presence();
 await db.exec('reset role');
 const before=(await db.query("select last_active_at,last_digest_at from public.iid_player_presence where user_id=$1::uuid",[U])).rows[0];
 await login();
 const first=await share();
 assert.equal(first.source,'SERVER_LEDGER');
 assert.equal(first.net_hp,0);
 assert.equal(first.world_hp,500000);
 assert.equal(first.heal_hp,0);
 await admin("insert into public.iid_battles(id,user_id,request_id,nickname,action,created_at,starts_at,ends_at,counted_taps,settled_at,base,critical,bonus,power,hp_before,hp_after,applied_hp,world_version) values "+
 " (gen_random_uuid(),'"+U+"',gen_random_uuid(),'PlayerOne','HEAL',statement_timestamp()-interval '2 minutes',statement_timestamp()-interval '117 seconds',statement_timestamp()-interval '97 seconds',12,clock_timestamp(),180,1,0,180,500000,500180,180,1)");
 await admin('update public.iid_world set hp=500180,version=1');
 const second=await share();
 assert.equal(second.heal_hp,180);
 assert.equal(second.net_hp,180);
 assert.equal(second.world_hp,500180);
 assert.equal(second.heal_battles,1);
 await db.exec('reset role');
 const after=(await db.query("select last_active_at,last_digest_at from public.iid_player_presence where user_id=$1::uuid",[U])).rows[0];
 await login();
 assert.equal(String(before.last_active_at),String(after.last_active_at));
 assert.equal(String(before.last_digest_at),String(after.last_digest_at));
 await login({},'anon');
 await assert.rejects(share(),/permission denied/);
 await login();
});


test('Share links publish live snapshots, are immutable, and reveal no private account data',async()=>{
 await fresh();
 await admin("truncate public.iid_share_cards,public.iid_player_presence cascade");
 const publish=async()=>(await db.query('select public.iid_publish_share_card() as data')).rows[0].data;
 const publicRead=async id=>(await db.query('select public.iid_public_share_card($1::uuid) as data',[id])).rows[0].data;
 await assert.rejects(publish(),/RETURN_REPORT_NOT_READY/);
 await presence();
 const first=await publish();
 assert.match(first.id,/^[a-f0-9-]{36}$/);
 assert.equal(first.snapshot.world_hp,500000);
 assert.equal(first.snapshot.net_hp,0);
 assert.equal((await publicRead(first.id)).world_hp,500000);
 await admin("update public.iid_world set hp=500180,version=1");
 const next=await publish();
 assert.notEqual(next.id,first.id);
 assert.equal(next.snapshot.world_hp,500180);
 assert.equal((await publicRead(first.id)).world_hp,500000,'already-shared preview must stay immutable');
 assert.equal((await publicRead(next.id)).world_hp,500180);
 assert.deepEqual(Object.keys(await publicRead(first.id)).includes("email"),false);
 await login({},'anon');
 assert.equal((await publicRead(first.id)).world_hp,500000);
 await assert.rejects(publish(),/permission denied/);
 await assert.rejects(db.query('select * from public.iid_share_cards'),/permission denied/);
 await login();
});
