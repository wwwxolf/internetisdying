import {test} from 'node:test';import assert from 'node:assert/strict';import {serveV4Summary} from '../../src/v4-summary.js';
test('cache strips personal headers and query strings; never caches errors',async()=>{
 let sent,key;const pending=[];const ctx={waitUntil:p=>pending.push(p)};
 const cache={match:async k=>{key=k;return null;},put:async()=>{}};
 const req=new Request('https://game.test/api/v4-summary?user=secret',{headers:{Authorization:'secret',Cookie:'private'}});
 const r=await serveV4Summary(req,ctx,{cache,fetcher:async(u,o)=>{sent=o;return Response.json(null);}});
 assert.equal(await r.json(),null);assert.equal(key.url,'https://game.test/api/v4-summary');assert.equal(sent.headers.Authorization,undefined);assert.equal(sent.headers.Cookie,undefined);assert.equal(r.headers.get('Cache-Control'),'public, max-age=60');await Promise.all(pending);
 const bad=await serveV4Summary(req,ctx,{cache,fetcher:async()=>new Response('',{status:500})});assert.equal(bad.status,503);assert.equal(bad.headers.get('Cache-Control'),'no-store');
});
