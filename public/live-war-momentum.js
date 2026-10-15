// Display-only fast polling of the cached, anonymous Cloudflare momentum endpoint.
// V2 war window is server-defined; never update World HP from War Influence.
export function slotStartMs(nowMs){return Math.floor(nowMs/14400000)*14400000;}
export function currentMomentum(d,nowMs){
 if(!d||!Number.isFinite(Date.parse(d.window_start))||d.enabled!==true)return null;
 if(Date.parse(d.window_start)!==slotStartMs(nowMs))return null;
 if(!Number.isSafeInteger(d.save_influence)||d.save_influence<0||
    !Number.isSafeInteger(d.kill_influence)||d.kill_influence<0||
    !Number.isSafeInteger(d.battle_count)||d.battle_count<0)return null;
 return d;
}
export function momentumDelay(failures=0,random=Math.random){
 const r=Math.max(0,Math.min(.999999,Number(random())||0));
 if(failures>0)return Math.round(Math.min(120000,20000*2**Math.min(3,failures-1))+r*5000);
 return Math.round(7000+2000*r);
}
export function startLiveWarMomentum(onUpdate,{
 fetcher=fetch,doc=document,win=window,clock=Date.now,random=Math.random,
 setTimer=setTimeout,clearTimer=clearTimeout
}={}){
 let timer=null,disposed=false,busy=false,failures=0;
 const clear=()=>{if(timer!==null){clearTimer(timer);timer=null;}};
 const later=ms=>{clear();if(disposed||doc.hidden)return;timer=setTimer(()=>{timer=null;void poll();},ms);};
 const poll=async()=>{
  if(disposed||doc.hidden||busy)return;
  busy=true;
  try{
   const response=await fetcher("/api/war-momentum",{cache:"no-store",credentials:"omit"});
   if(!response.ok)throw Error("MOMENTUM_UNAVAILABLE");
   const payload=await response.json();
   const data=currentMomentum(payload,clock());
   if(!data)throw Error("STALE_OR_INVALID_MOMENTUM");
   failures=0;
   if(!disposed)onUpdate(data);
  }catch{failures++;}finally{
   busy=false;
   later(momentumDelay(failures,random));
  }
 };
 const visibility=()=>{
  clear();if(disposed||doc.hidden)return;
  // Reconnect with staggered delay; do not stampede a shared database.
  later(1000+Math.round(2000*random()));
 };
 doc.addEventListener("visibilitychange",visibility);
 win.addEventListener("pagehide",stop,{once:true});
 function stop(){
  disposed=true;clear();doc.removeEventListener("visibilitychange",visibility);
 }
 later(1000+Math.round(3000*random()));
 return {stop,refresh:()=>{if(!busy)later(200+Math.round(1800*random()));}};
}
