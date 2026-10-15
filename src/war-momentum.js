// Public, anonymous, read-only V2 momentum. Worker serves short-lived edge-cached data.
// Never forward a browser's Authorization header, cookies, or query string.
const DB="https://wywrahaqpocueddxmjjq.supabase.co";
const KEY="sb_publishable_F8_CrtwDngDwWJ_Pda8oUw_-vMMOlYh";
let inFlight=null;
export const WAR_CACHE_TTL=8;
export function verifyMomentum(d){
 if(!d||typeof d.enabled!=="boolean"||
  ![d.save_influence,d.kill_influence,d.battle_count].every(n=>Number.isSafeInteger(n)&&n>=0))
  throw Error("INVALID_V2_AGGREGATES");
 const s=Date.parse(d.window_start),end=Date.parse(d.window_end),now=Date.parse(d.server_now);
 if(![s,end,now].every(Number.isFinite)||end-s!==14400000||
  s%14400000!==0||now<s||now>=end||d.enabled===false&&(d.save_influence||d.kill_influence||d.battle_count))
  throw Error("INVALID_V2_WINDOW");
 return {
  enabled:d.enabled,window_start:d.window_start,window_end:d.window_end,
  save_influence:d.save_influence,kill_influence:d.kill_influence,
  battle_count:d.battle_count,server_now:d.server_now
 };
}
async function originRead(fetcher){
 const response=await fetcher(DB+"/rest/v1/rpc/iid_public_v2_momentum",{
  method:"POST",
  headers:{"apikey":KEY,"Content-Type":"application/json","Accept":"application/json"},
  body:"{}",signal:AbortSignal.timeout(4500)
 });
 if(!response.ok)throw Error("MOMENTUM_RPC_UNAVAILABLE");
 return verifyMomentum(await response.json());
}
export function momentumCacheTtl(d,now=Date.now()){
 const remaining=Math.max(1,Math.ceil((Date.parse(d.window_end)-now)/1000));
 return Math.min(WAR_CACHE_TTL,remaining);
}
export async function serveWarMomentum(request,ctx,{fetcher=fetch,cache=typeof caches==="undefined"?null:caches.default,now=Date.now}={}){
 if(request.method!=="GET"&&request.method!=="HEAD")
  return new Response("Method not allowed",{status:405,headers:{"Allow":"GET, HEAD","Cache-Control":"no-store"}});
 const u=new URL(request.url);
 // Cache by a canonical path AND current UTC slot: previous window cannot leak past reset.
 const slot=Math.floor(now()/14400000);
 const key=new Request(u.origin+"/api/war-momentum?slot="+slot);
 if(cache){
  try{
   const hit=await cache.match(key);
   if(hit)return request.method==="HEAD"?new Response(null,{status:hit.status,headers:hit.headers}):hit;
  }catch{}
 }
 try{
  if(!inFlight)inFlight=originRead(fetcher).finally(()=>{inFlight=null;});
  const data=await inFlight;
  // If the cache fetch was started across a window boundary, reject stale results.
  if(Date.parse(data.window_start)!==slot*14400000)throw Error("STALE_WINDOW");
  const maxAge=momentumCacheTtl(data,now());
  const response=new Response(JSON.stringify(data),{
   status:200,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"public,max-age=0,s-maxage="+maxAge,
    "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY"}
  });
  if(cache&&ctx?.waitUntil){
   ctx.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
  }
  return request.method==="HEAD"?new Response(null,{status:200,headers:response.headers}):response;
 }catch{
  return new Response(JSON.stringify({error:"MOMENTUM_UNAVAILABLE"}),{
   status:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
  });
 }
}
