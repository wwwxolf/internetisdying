import {test} from 'node:test';
import assert from 'node:assert/strict';
import {power,battleImpact,chaosImpact,cumulativeDecay,schedule,applyEvent,roundRatio} from '../../src/v4/economy.js';
test('all permitted tap and critical values; invalid claims rejected',()=>{
 for(let t=0;t<=50;t++)for(const c of [100,105]){const p=power(t,c);assert.equal(p,Math.floor((100+Math.floor(t/10))*c/100+.5));assert.ok(p>=100&&p<=110);}
 for(const t of [-1,51,1.1,NaN,null])assert.throws(()=>power(t,100));assert.throws(()=>power(50,200));
});
test('signed half-away rounding and bigint overflow safety',()=>{
 assert.equal(roundRatio(-5n,2n),-3);assert.equal(roundRatio(5n,2n),3);
 assert.equal(battleImpact(Number.MAX_SAFE_INTEGER,0),12000);
 assert.equal(battleImpact(Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER),0);
});
test('faction symmetry and monotonic contribution including quorum',()=>{
 for(let s=0;s<=100;s++)for(let k=0;k<=100;k++)for(const f of [battleImpact,chaosImpact]){
  assert.equal(f(s,k)+f(k,s),0);assert.ok(f(s+1,k)>=f(s,k));assert.ok(f(s,k+1)<=f(s,k));
 }
 assert.equal(chaosImpact(10,0),143);assert.equal(chaosImpact(6,4),0);
 assert.equal(battleImpact(73500,31500),4624);
});
test('331 ordered events, WIB decay grid, exact 510000 decay including tail',()=>{
 const e=schedule('2026-10-17T00:00:00Z');assert.equal(e.length,331);
 assert.equal(e.filter(x=>x.kind==='BATTLE').length,180);assert.equal(e.filter(x=>x.kind==='CHAOS').length,30);
 const d=e.filter(x=>x.kind==='DECAY');assert.equal(d.length,120);
 for(const x of d)assert.ok([0,6,12,18].includes((new Date(x.at).getUTCHours()+7)%24));
 assert.equal(e.at(-1).delta,-1000);assert.equal(e.reduce((a,x)=>a+(x.delta??0),0),-510000);
 assert.equal(cumulativeDecay(30*86400),510000);
 assert.throws(()=>schedule('2026-10-17T01:00:00Z'));
});
test('terminal cannot resurrect; max HP does not win; final zero loses',()=>{
 const active={hp:999999,status:'ACTIVE',winner:null};
 assert.equal(applyEvent(active,{kind:'BATTLE'},1e6,0).status,'ACTIVE');
 const dead=applyEvent({hp:1,status:'ACTIVE'},{kind:'DECAY',delta:-1});
 assert.equal(dead.winner,'KILL');assert.deepEqual(applyEvent(dead,{kind:'BATTLE'},1e6,0),dead);
 assert.equal(applyEvent({hp:1000,status:'ACTIVE'},{kind:'FINAL',delta:-1000}).winner,'KILL');
 assert.equal(applyEvent({hp:1001,status:'ACTIVE'},{kind:'FINAL',delta:-1000}).winner,'SAVE');
});
