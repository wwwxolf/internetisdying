/* WHILE YOU WERE GONE — world-ledger return digest. All numbers come
   directly from iid_return_digest; never manufacture global events. */
export async function initWorldReturn({sb,nickname}) {
 const $=id=>document.getElementById(id);
 const root=$("world-return");
 if(!root)return;
 root.hidden=false;
 const fmt=n=>Number(n||0).toLocaleString("en-US");
 const signed=n=>(n>0?"+":n<0?"−":"")+fmt(Math.abs(Number(n||0)));
 let report=null,disposed=false,busy=false,lastVisible=Date.now();
 const visible=()=>document.visibilityState==="visible";
 const message=(s)=>{$("world-return-status").textContent=s;};
 const text=(id,s)=>{$(id).textContent=s;};
 const formatAge=(from,until)=>{
   const seconds=Math.max(0,Math.floor((Date.parse(until)-Date.parse(from))/1000));
   if(seconds<60)return "LESS THAN A MINUTE";
   const days=Math.floor(seconds/86400);
   const hrs=Math.floor((seconds%86400)/3600);
   const mins=Math.floor(seconds%3600/60);
   return (days?days+"D ":"")+(hrs?hrs+"H ":"")+(mins?mins+"M":"");
 };
 async function rpc(mode){
  const {data,error}=await sb.rpc("iid_return_digest",{p_mode:mode});
  if(error)throw error;return data;
 }
 function buildShare(data) {
   const href=new URL("./index.html",location.href).href;
   const net=Number(data.net_hp||0);
   const headline=net<0?"THE INTERNET GOT WORSE WHILE I WAS GONE."
     :net>0?"THE INTERNET IS FIGHTING BACK.":"THE INTERNET IS HOLDING ITS BREATH.";
   return [
     "THE INTERNET IS DYING_",
     headline,
     "SAVE +"+fmt(data.heal_hp)+" HP | KILL −"+fmt(data.kill_hp)+" HP",
     "WORLD DECAY −"+fmt(data.decay_hp)+" HP | DAILY CHAOS "+signed(data.chaos_hp)+" HP",
     "WORLD NET "+signed(net)+" HP",
     "CURRENT WORLD "+fmt(data.world_hp)+" / 1,000,000 HP",
     "Will you SAVE it or KILL it?",
     href
   ].join("\n");
 }
 function render(data) {
  report=data;
  text("world-return-name",nickname||"PLAYER");
  const visited=!data.first_visit,quiet=Number(data.net_hp)===0
    && Number(data.heal_battles)===0 && Number(data.kill_battles)===0
    && Number(data.chaos_events)===0 && Number(data.decay_pulses)===0;
  const change=Number(data.net_hp||0);
  root.dataset.trend=change>0?"heal":change<0?"kill":"quiet";
  text("world-return-title",!visited?"WELCOME TO WORLD_001_"
    :quiet?"THE INTERNET WAS QUIET_":change<0?"THE INTERNET TOOK A HIT_"
    :change>0?"THE INTERNET FOUGHT BACK_":"A PERFECT STALEMATE_");
  text("world-return-since",!visited?"FIRST VISIT • HISTORY STARTS NOW"
    :"YOU WERE AWAY FOR "+formatAge(data.from,data.until)+(data.time_limited?" • LAST 30 DAYS ONLY":""));
  text("world-return-heal","+"+fmt(data.heal_hp)+" HP");
  text("world-return-kill","−"+fmt(data.kill_hp)+" HP");
  text("world-return-decay","−"+fmt(data.decay_hp)+" HP");
  text("world-return-chaos",signed(data.chaos_hp)+" HP");
  text("world-return-net",signed(change)+" HP");
  text("world-return-world",fmt(data.world_hp)+" / 1,000,000 HP");
  text("world-return-activity",!visited?"COME BACK AFTER YOUR NEXT SESSION TO SEE REAL WORLD CHANGES."
    :quiet?(data.world_enabled?"NO VERIFIED WORLD CHANGES DURING THIS PERIOD.":"WORLD PAUSED • NO VERIFIED CHANGES.")
    :fmt(data.heal_battles)+" SAVE / "+fmt(data.kill_battles)+" KILL BATTLES • "+fmt(data.chaos_events)+" DAILY EVENTS");
  text("world-return-event",data.latest_event
    ?"LATEST: "+data.latest_event.title+" • "+signed(data.latest_event.applied_hp)+" HP"
    :"NO DAILY CHAOS EVENT DURING THIS PERIOD");
  const share=$("world-return-share");
  share.disabled=!visited||quiet;
  if(share.disabled)share.title="Available after verified world activity";
  else share.removeAttribute("title");
  message("SERVER VERIFIED • "+(data.replayed?"RECENT REPORT":"SINCE YOUR LAST VISIT"));
 }
 async function open() {
  if(disposed||busy)return;
  busy=true;
  message("SYNCING VERIFIED WORLD HISTORY…");
  try{render(await rpc("open"));}
  catch(e){message("HISTORY UNAVAILABLE • SERVER SYNC FAILED");console.warn("Return digest unavailable:",e);}
  finally{busy=false;}
 }
 const btn=$("world-return-share");
 btn.addEventListener("click",()=>{
  if(!report||btn.disabled)return;
  const text=buildShare(report);
  // WhatsApp deep link: share a text-first verified world report, with no
  // fabricated player counts or images.
  const url="https://wa.me/?text="+encodeURIComponent(text);
  window.open(url,"_blank","noopener,noreferrer");
 });
 const close=$("world-return-dismiss");
 close.addEventListener("click",()=>{root.hidden=true;});
 await open();
 const interval=setInterval(async()=>{
  if(disposed||!visible()||busy)return;
  try{await rpc("heartbeat");}catch(e){console.warn("World presence heartbeat unavailable:",e);}
 },90000);
 const onVisibility=async()=>{
  if(disposed)return;
  if(!visible()){lastVisible=Date.now();return;}
  if(Date.now()-lastVisible>15*60000)await open();
  else try{await rpc("heartbeat");}catch(e){/* transient reconnect */}
 };
 document.addEventListener("visibilitychange",onVisibility);
 window.addEventListener("pagehide",()=>{
  disposed=true;clearInterval(interval);
  document.removeEventListener("visibilitychange",onVisibility);
 },{once:true});
}
