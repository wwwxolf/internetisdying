import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {simulate,pathTo,readChallenge,challengeURL} from '../public/peck-engine.js';
import {LEVELS} from '../public/peck-levels.js';
const open={start:12,server:17,coop:35,walls:[]};
test('server is the default target; SAVE and KILL have distinct success conditions',()=>{
 assert.equal(simulate(open,[]).reason,'server');
 assert.equal(simulate(open,[]).won,false);
 assert.equal(simulate(open,[],'kill').won,false);
 const kill=simulate(open,[13,14,15],'kill');assert.equal(kill.won,true);assert.equal(kill.eaten,3);assert.equal(kill.steps,5);
});
test('crumb attraction uses walking distance around walls, not straight-line proximity',()=>{
 const l={...open,walls:[13,7,19]};const r=simulate(l,[14]);assert.equal(r.frames[1].target,17);
 assert.ok(pathTo(l,12,14).length-1>3);
});
test('nearest crumb wins; equal distances follow placement order',()=>{
 assert.equal(simulate(open,[6,18]).frames[1].target,6);
 assert.equal(simulate(open,[18,6]).frames[1].target,18);
 assert.equal(simulate(open,[14,13]).frames[1].target,13);
});
test('illegal plans are rejected and simulation never mutates its inputs',()=>{
 for(const plan of [[1,2,3,4],[1,1],[12],[17],[-1],[36],[1.5]])assert.throws(()=>simulate(open,plan));
 assert.throws(()=>simulate({...open,walls:[1]},[1]));
 const l=structuredClone(LEVELS[0]),p=[24,35],before=JSON.stringify({l,p});assert.deepEqual(simulate(l,p),simulate(l,p));assert.equal(JSON.stringify({l,p}),before);
});
test('all eight authored boards support both missions without fabricated opponents',()=>{
 assert.equal(LEVELS.length,8);assert.equal(new Set(LEVELS.map(l=>l.id)).size,8);
 for(const l of LEVELS){
  assert.equal(simulate(l,[]).reason,'server');
  const cells=Array.from({length:36},(_,i)=>i).filter(n=>!l.walls.includes(n)&&n!==l.start&&n!==l.server);
  let save=false,kill=false;
  outer:for(const a of cells)for(const b of cells)for(const c of cells){if(a===b||b===c||a===c)continue;
   if(!save){const r=simulate(l,[a,b,c],'save');save=r.won&&r.steps===l.par.save;}
   if(!kill){const r=simulate(l,[a,b,c],'kill');kill=r.won&&r.steps===l.par.kill;}
   if(save&&kill)break outer;
  }
  assert.ok(save,l.id+' SAVE is solvable at par');assert.ok(kill,l.id+' KILL is solvable at par');
 }
});
test('share links restore the exact board and mission, and reject unknown identities safely',()=>{
 for(const side of ['save','kill'])for(let index=0;index<LEVELS.length;index++){
  const url=new URL(challengeURL('https://example.com',LEVELS[index],side));
  assert.deepEqual(readChallenge(url.search,LEVELS),{index,side,shared:true});
 }
 assert.deepEqual(readChallenge('?level=%3Cscript%3E&side=admin',LEVELS),{index:0,side:'save',shared:false});
});
test('new front door loads puzzle and preserves the classic experience separately',async()=>{
 const html=await readFile('public/index.html','utf8'),legacy=await readFile('public/multiverse.html','utf8'),js=await readFile('public/peck.js','utf8');
 assert.match(html,/id="release"/);assert.match(html,/peck\.js\?v=1/);assert.match(html,/Classic V4 arena/);
 assert.match(legacy,/id="join-btn" href="\.\/prologue\.html"/);
 assert.doesNotMatch(js,/\.rpc\(|supabase|fetch\(/);
 assert.match(html,/id="copy-fallback"/);
});
