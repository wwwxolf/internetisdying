import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {COUNTRIES,COUNTRY_CODES} from '../public/countries.js';

const db=new PGlite(), A='10000000-0000-4000-8000-000000000001', B='10000000-0000-4000-8000-000000000002', C='10000000-0000-4000-8000-000000000003', D='10000000-0000-4000-8000-000000000004', E='10000000-0000-4000-8000-000000000005';
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; insert into auth.users values('${A}'),('${B}'),('${C}'),('${D}'),('${E}');`);
await db.exec(await readFile('supabase/migrations/20261014003346_create_iid_profiles_with_rls.sql','utf8'));
await db.exec(`insert into iid_profiles(user_id,nickname,origin) values('${A}','LegacyPlayer','HUMAN')`);
await db.exec(await readFile('supabase/migrations/20261015010610_phase1_player_identity.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261015101500_world001_avatar_origins.sql','utf8'))
async function login(id=A,role='authenticated'){
 await db.exec('reset role');
 await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id})]);
 await db.exec(`set role ${role}`);
}
async function adminQuery(sql){await db.exec('reset role');try{return await db.query(sql)}finally{await login(A)}}
await login();
after(()=>db.close());

test('legacy profile remains and receives a neutral OTHERS default without re-onboarding',async()=>{
 const old=(await db.query(`select nickname,origin,country_code,custom_flag from iid_profiles where user_id='${A}'`)).rows[0];
 assert.equal(old.nickname,'LegacyPlayer');assert.equal(old.origin,'HUMAN');assert.equal(old.country_code,'OTH');assert.match(old.custom_flag,/^[0-9A-F]{48}$/);
});
test('valid ISO country and compact OTHERS flag persist; invalid codes and flags are rejected',async()=>{
 await login(B);await db.query(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${B}','NewPlayer','BOT','IDN',null)`);await login(A);
 await assert.rejects(adminQuery(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${C}','BadCode','HUMAN','ZZZ',null)`),/check constraint/);
 await assert.rejects(adminQuery(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${D}','BadFlag','HUMAN','OTH','123')`),/check constraint/);
 await assert.rejects(adminQuery(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${E}','MissingFlag','HUMAN','OTH',null)`),/check constraint/);
 await adminQuery(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${E}','ValidFlag','ALIEN','OTH','${'0'.repeat(48)}')`);
});
test('country catalog contains 249 unique ISO alpha-3 choices',()=>{
 assert.equal(COUNTRIES.length,249);assert.equal(COUNTRY_CODES.size,249);assert.ok(COUNTRY_CODES.has('IDN'));assert.ok(COUNTRY_CODES.has('USA'));
});
test('existing account skips onboarding; new player saves selected country and existing avatar',async()=>{
 const prior={body:globalThis.document,window:globalThis.window,location:globalThis.location};
 async function open(existing){
  const nodes=new Map(), make=()=>({hidden:false,value:'',dataset:{},style:{setProperty(){}},children:[],listeners:{},addEventListener(type,fn){this.listeners[type]=fn},setAttribute(){},append(node){this.children.push(node)},replaceChildren(){this.children=[]},focus(){}});
  const get=id=>{if(!nodes.has(id))nodes.set(id,Object.assign(make(),{hidden:id==='profile-form'}));return nodes.get(id)};
  const origins=['HUMAN','BOT_CHICKEN','CHICKEN_MUTANT','EGG_GLITCH'].map(origin=>Object.assign(make(),{dataset:{origin}}));
  globalThis.document={body:{dataset:{page:'onboarding'}},getElementById:get,querySelectorAll:()=>origins,createElement:make};
  globalThis.location={href:'https://game.test/onboarding.html',assign(url){this.destination=url}};
  let inserted=null;
  globalThis.window={IID_CONFIG:{supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'1234567890123456'},supabase:{createClient(){return {auth:{async getUser(){return {data:{user:{id:'player'}}}}},from(){return {select(){return {eq(){return {async maybeSingle(){return {data:existing?{user_id:'player'}:null}}}}}},async insert(row){inserted=row;return {error:null}}}}}}}};
  await import(`../public/flow.js?test=${existing?'old':'new'}-${Date.now()}`);
  return {get,origins,inserted:()=>inserted};
 }
 try{
  const old=await open(true);assert.equal(globalThis.location.destination,'https://game.test/arena.html');assert.equal(old.get('profile-form').hidden,true);
  const fresh=await open(false);assert.equal(fresh.get('profile-form').hidden,false);fresh.get('nickname').value='PixelAce';fresh.origins[1].listeners.click();
  fresh.get('country-search').listeners.input();fresh.get('country-search').value='IDN';fresh.get('country-search').listeners.input();
  const indonesia=fresh.get('country-results').children.find(button=>button.innerHTML.includes('IDN'));indonesia.listeners.click();
  await fresh.get('profile-form').listeners.submit({preventDefault(){}});
  assert.equal(fresh.inserted().nickname,'PixelAce');assert.equal(fresh.inserted().origin,'BOT_CHICKEN');assert.equal(fresh.inserted().country_code,'IDN');assert.equal(fresh.inserted().custom_flag,null);
 }finally{globalThis.document=prior.body;globalThis.window=prior.window;globalThis.location=prior.location;}
});
test('nickname uniqueness stays case-insensitive and profile RLS stays owner-only',async()=>{
 await assert.rejects(db.query(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${A}','NEWPLAYER','GLITCH','IDN',null)`),/duplicate key/);
 await login(B);assert.equal((await db.query('select * from iid_profiles')).rows.length,1);
 await assert.rejects(db.query(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${A}','WrongOwner','HUMAN','IDN',null)`),/row-level security/);
 await login(A,'anon');await assert.rejects(db.query('select * from iid_profiles'),/permission denied/);
});

test('new World 001 origins persist while invalid origins remain rejected',async()=>{
 await adminQuery(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${C}','CyborgChicken','BOT_CHICKEN','IDN',null)`);
 await adminQuery(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${D}','RadioactiveHen','CHICKEN_MUTANT','IDN',null)`);
 const rows=(await adminQuery(`select origin from iid_profiles where user_id in ('${C}','${D}') order by origin`)).rows.map(r=>r.origin);
 assert.deepEqual(rows,['BOT_CHICKEN','CHICKEN_MUTANT']);
 await adminQuery(`delete from iid_profiles where user_id='${C}'`);
 await adminQuery(`insert into iid_profiles(user_id,nickname,origin,country_code,custom_flag) values('${C}','Egg404','EGG_GLITCH','IDN',null)`);
 const egg=(await adminQuery(`select origin from iid_profiles where user_id='${C}'`)).rows[0];
 assert.equal(egg.origin,'EGG_GLITCH');
 await assert.rejects(adminQuery(`update iid_profiles set origin='UNKNOWN' where user_id='${C}'`),/check constraint/);
});
