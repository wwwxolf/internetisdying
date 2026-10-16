import {test} from 'node:test';import assert from 'node:assert/strict';import {serveV4Summary} from '../../src/v4-summary.js';
test('cache strips personal headers and query strings; never caches errors',async()=>{
 let sent,key;const pending=[];const ctx={waitUntil:p=>pending.push(p)};
 const cache={match:async k=>{key=k;return null;},put:async()=>{}};
 const req=new Request('https://game.test/api/v4-summary?user=secret',{headers:{Authorization:'secret',Cookie:'private'}});
 const r=await serveV4Summary(req,ctx,{cache,fetcher:async(u,o)=>{sent=o;return Response.json(null);}});
 assert.equal(await r.json(),null);assert.equal(key.url,'https://game.test/api/v4-summary?cache=v4-launch');assert.equal(sent.headers.Authorization,undefined);assert.equal(sent.headers.Cookie,undefined);assert.equal(r.headers.get('Cache-Control'),'no-store');await Promise.all(pending);
 const bad=await serveV4Summary(req,ctx,{cache,fetcher:async()=>new Response('',{status:500})});assert.equal(bad.status,503);assert.equal(bad.headers.get('Cache-Control'),'no-store');
});

test('published V4 summary is briefly cached, but prelaunch null never persists',async()=>{
 let writes=0;const ctx={waitUntil(){}},cache={match:async()=>null,put:async()=>{writes++;}};
 const valid={id:'epoch',hp:500000,status:'ACTIVE',admission:true};
 const req=new Request('https://game.test/api/v4-summary');
 const res=await serveV4Summary(req,ctx,{cache,fetcher:async()=>Response.json(valid)});
 assert.equal(res.headers.get('Cache-Control'),'public, max-age=10');
 assert.equal(writes,1);
 const absent=await serveV4Summary(req,ctx,{cache,fetcher:async()=>Response.json(null)});
 assert.equal(absent.headers.get('Cache-Control'),'no-store');
 assert.equal(writes,1);
});
