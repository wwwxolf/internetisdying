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
for (const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
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
async function expire(id) {await admin(`update public.iid_battles set created_at=clock_timestamp()-interval '30 seconds',starts_at=clock_timestamp()-interval '27 seconds',ends_at=clock_timestamp()-interval '7 seconds' where id='${id}'`);}
async function fresh() {await admin('truncate public.iid_battles; update public.iid_world set hp=500000,version=0,enabled=true;');}
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
test('early tap and early settlement rejected',async()=>{
  await fresh();const b=await start();await assert.rejects(tap(b.id,1),/TAP_WINDOW_CLOSED/);
  await assert.rejects(settle(b.id),/BATTLE_NOT_FINISHED/);
});
test('tap sequence is idempotent, capped, ordered and server-timed',async()=>{
  await fresh();const b=await start();
  await admin(`update public.iid_battles set created_at=clock_timestamp()-interval '4 seconds',starts_at=clock_timestamp()-interval '1 second',ends_at=clock_timestamp()+interval '19 seconds' where id='${b.id}'`);
  assert.equal((await tap(b.id,1)).counted_taps,1);assert.equal((await tap(b.id,1)).counted_taps,1);
  await assert.rejects(tap(b.id,3),/SEQUENCE_GAP/);await assert.rejects(tap(b.id,51),/INVALID_SEQUENCE/);
  for(let n=2;n<=50;n++) {await admin(`update public.iid_battles set last_tap_at=clock_timestamp()-interval '1 second' where id='${b.id}'`);await tap(b.id,n);}
  assert.equal((await tap(b.id,50)).counted_taps,50);await assert.rejects(settle(b.id),/BATTLE_NOT_FINISHED/);
  await expire(b.id);const r=await settle(b.id);assert.equal(r.bonus,10);
});
test('settlement retry leaves HP/version and permanent history unchanged',async()=>{
  await fresh();const b=await start();await expire(b.id);const r=await settle(b.id);
  assert.deepEqual(await settle(b.id),r);const s=await rpc('status');assert.equal(s.world.version,1);
  assert.equal(s.monthly.battle_count,1);assert.equal(s.monthly.heal_count,1);assert.equal(s.monthly.heal_hp,r.applied_hp);
  await assert.rejects(start(),/COOLDOWN_ACTIVE/);
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
  assert.equal((await start()).id,b.id);await settle(b.id);await assert.rejects(start(),/COOLDOWN_ACTIVE/);
});
test('pause prevents new battles but existing sessions can settle',async()=>{
  await fresh();const b=await start();await expire(b.id);await admin('update public.iid_world set enabled=false');
  await settle(b.id);assert.equal((await rpc('status')).monthly.battle_count,1);
});
test('batched taps are idempotent, capped, paced and tied to server timestamps',async()=>{
  await fresh();
  const b=await start('HEAL');
  await admin(`update public.iid_battles
    set created_at=clock_timestamp()-interval '6 seconds',
        starts_at=clock_timestamp()-interval '3 seconds',
        ends_at=clock_timestamp()+interval '17 seconds'
    where id='${b.id}'`);
  const batch=(n)=>rpc('tap_batch',[b.id,n],['uuid','integer']);
  assert.equal((await batch(8)).counted_taps,8);
  assert.equal((await batch(8)).counted_taps,8);
  await assert.rejects(batch(19),/BATCH_TOO_LARGE/); // delta 11
  await assert.rejects(batch(9),/TAP_TOO_FAST/); // no time to earn another tap
  await assert.rejects(batch(0),/INVALID_TAP_TOTAL/);
  await assert.rejects(batch(51),/INVALID_TAP_TOTAL/);
  await admin(`update public.iid_battles set last_tap_at=clock_timestamp()-interval '2 seconds' where id='${b.id}'`);
  assert.equal((await batch(18)).counted_taps,18);
  assert.equal((await batch(8)).counted_taps,18); // stale delayed ack
  await expire(b.id);
  await assert.rejects(batch(19),/TAP_WINDOW_CLOSED/);
  const r=await settle(b.id);
  assert.equal(r.counted_taps,18);
  assert.equal(r.bonus,2); // verified 18, not locally claimed 50
  assert.equal((await batch(18)).counted_taps,18);
});

test('rolling 24-hour cap independently rejects a seventh settlement opportunity',async()=>{
  await fresh();const b=await start();await expire(b.id);await settle(b.id);
  await admin(`update public.iid_battles set created_at=clock_timestamp()-interval '6 hours',starts_at=clock_timestamp()-interval '6 hours'+interval '3 seconds',ends_at=clock_timestamp()-interval '6 hours'+interval '23 seconds',settled_at=clock_timestamp()-interval '5 hours';
    insert into public.iid_battles select gen_random_uuid(),user_id,gen_random_uuid(),nickname,action,created_at,starts_at,ends_at,counted_taps,last_tap_at,settled_at,base,critical,bonus,power,hp_before,hp_after,applied_hp,world_version from public.iid_battles cross join generate_series(1,5);`);
  await assert.rejects(start(),/ROLLING_LIMIT_REACHED/);
  assert.equal((await rpc('status')).rolling_count,6);
});
test('monthly general-card boundaries, UTC summary and heal/kill aggregation',async()=>{
  await fresh();const b=await start('KILL');await expire(b.id);await settle(b.id);
  for(const [n,tier] of [[1,'Common'],[14,'Common'],[15,'Rare'],[44,'Rare'],[45,'Legendary'],[89,'Legendary'],[90,'Ancestral']]) {
    await admin(`delete from public.iid_battles where id<>'${b.id}';
      insert into public.iid_battles select gen_random_uuid(),user_id,gen_random_uuid(),nickname,action,created_at,starts_at,ends_at,counted_taps,last_tap_at,settled_at,base,critical,bonus,power,hp_before,hp_after,applied_hp,world_version from public.iid_battles cross join generate_series(1,${n-1});`);
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
 assert.equal(first.damage_hp,-6000);assert.equal(first.recovery_hp,6000);
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
 await admin("update public.iid_chaos_control set enabled=true, anchor_utc=(clock_timestamp() at time zone 'UTC')::date");
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
 await admin("delete from public.iid_decay_pulses; update public.iid_chaos_control set enabled=false,decay_anchor_at=clock_timestamp()-interval '3 hours 10 minutes'");
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
test('Daily Chaos 20-vote result executes once and applies exactly +6000 HP',async()=>{
 await fresh();
 await admin("delete from public.iid_chaos_votes; delete from public.iid_chaos_results; delete from public.iid_chaos_days; update public.iid_chaos_control set enabled=true,anchor_utc=(clock_timestamp() at time zone 'UTC')::date-1");
 await admin("insert into public.iid_chaos_days(day_utc,rotation_day) values((clock_timestamp() at time zone 'UTC')::date-1,1)");
 await admin("insert into public.iid_chaos_votes(day_utc,user_id,choice) select (clock_timestamp() at time zone 'UTC')::date-1,gen_random_uuid(),'recovery' from generate_series(1,20)");
 const a=await cronRpc('resolve_previous_chaos');
 assert.equal(a.winner,'recovery');assert.equal(a.applied_hp,6000);
 assert.equal(a.damage_votes,0);assert.equal(a.recovery_votes,20);
 assert.equal(a.hp_after,506000);
 const b=await cronRpc('resolve_previous_chaos');
 assert.deepEqual(b,a);
 assert.equal((await rpc('status')).world.version,1);
 assert.equal((await db.query('select count(*)::int as n from public.iid_chaos_results')).rows[0].n,1);
});
