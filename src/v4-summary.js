const DB='https://wywrahaqpocueddxmjjq.supabase.co';
const KEY='sb_publishable_F8_CrtwDngDwWJ_Pda8oUw_-vMMOlYh';
export async function serveV4Summary(request,ctx,{fetcher=fetch,cache=globalThis.caches?.default}={}){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const url=new URL(request.url);url.search='';const key=new Request(url.toString()+'?cache=v4-launch');
 const hit=await cache?.match(key);if(hit)return hit;
 try{
  const r=await fetcher(DB+'/rest/v1/rpc/iid_v4_summary',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(4500)});
  if(!r.ok)throw Error('summary unavailable');
  const d=await r.json();
  if(d!==null&&(!Number.isInteger(d.hp)||d.hp<0||d.hp>1000000||!['ACTIVE','FINAL'].includes(d.status)))throw Error('invalid summary');
  const response=Response.json(d,{headers:{'Cache-Control':d===null?'no-store':'public, max-age=10'}});
  if(cache&&d!==null)ctx.waitUntil(cache.put(key,response.clone()));return response;
 }catch{return Response.json({error:'WORLD_SYNC_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
