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
  // A fresh snapshot can be generated even on a quiet/first visit.
  // The server supplies truthful zeroes; a local demo never contributes.
  share.disabled=false;
  share.removeAttribute("title");
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
 const modal=$("share-card-modal");
 const preview=$("share-card-preview");
 const feedback=$("share-card-feedback");
 const native=$("share-card-native");
 const download=$("share-card-download");
 const whatsapp=$("share-card-whatsapp");
 let shareFile=null,shareData=null,shareUrl=null,shareLib=null,preparing=false;
 const clearShare=()=>{
  if(shareUrl){URL.revokeObjectURL(shareUrl);shareUrl=null;}
  shareFile=null;shareData=null;
 };
 const closeShare=()=>{
  modal.hidden=true;clearShare();btn.focus();
 };
 $("share-card-close").addEventListener("click",closeShare);
 modal.addEventListener("click",e=>{if(e.target===modal)closeShare();});
 document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!modal.hidden)closeShare();
 });
 async function prepareCard(){
  if(preparing||!report||btn.disabled)return;
  preparing=true;btn.disabled=true;
  message("FETCHING CURRENT SERVER SNAPSHOT…");
  try{
   // A fresh RPC is mandatory: never reuse the cached 'While You Were Gone'
   // panel values or a previous PNG for a newly requested share.
   const {data,error}=await sb.rpc("iid_share_snapshot");
   if(error)throw error;
   shareLib??=await import("./breaking-share-card.js?v=1");
   shareLib.validateSnapshot(data);
   const png=await shareLib.renderBreakingCard(data);
   if(png.type!=="image/png")throw Error("PNG unavailable");
   clearShare();
   shareData=data;
   shareFile=new File([png],shareLib.filenameFor(data),{type:"image/png"});
   shareUrl=URL.createObjectURL(shareFile);
   preview.src=shareUrl;
   preview.alt="BREAKING INTERNET pixel card, "+shareLib.headlineFor(data).join(" ")+
    ". World health "+shareLib.worldStage(data.world_hp)+
    ". Verified snapshot "+data.snapshot_at+".";
   feedback.textContent="LIVE DATA CAPTURED • "+new Date(data.snapshot_at).toLocaleString();
   native.hidden=!(typeof navigator.share==="function"&&
     typeof navigator.canShare==="function"&&
     navigator.canShare({files:[shareFile]}));
   $("share-card-tip").textContent=native.hidden
     ?"SAVE PNG, then attach it in WhatsApp. WHATSAPP LINK sends only the game link."
     :"SHARE IMAGE opens your device's share menu. Choose WhatsApp to attach the PNG.";
   modal.hidden=false;
   $("share-card-close").focus();
   message("PIXEL SHARE CARD READY • SERVER VERIFIED");
  }catch(e){
   clearShare();
   message("SHARE CARD UNAVAILABLE • RETRY");
   console.warn("Share snapshot or image failed:",e);
  }finally{preparing=false;btn.disabled=false;}
 }
 btn.addEventListener("click",()=>{void prepareCard();});
 native.addEventListener("click",()=>{
  if(!shareFile||!shareData||!shareLib||typeof navigator.share!=="function")return;
  // MUST invoke navigator.share synchronously from this user tap.
  const details={files:[shareFile],title:"BREAKING INTERNET",
   text:shareLib.shareCaption(shareData)};
  navigator.share(details).then(()=>{
   feedback.textContent="SHARE SHEET COMPLETED";
  }).catch(e=>{
   feedback.textContent=e?.name==="AbortError"?"SHARE CANCELED":
     "SHARING UNAVAILABLE. USE SAVE PNG BELOW.";
  });
 });
 download.addEventListener("click",()=>{
  if(!shareFile||!shareUrl)return;
  const a=document.createElement("a");
  a.href=shareUrl;a.download=shareFile.name;
  document.body.append(a);a.click();a.remove();
  feedback.textContent="PNG READY • ATTACH IT IN WHATSAPP";
 });
 whatsapp.addEventListener("click",()=>{
  if(!shareData||!shareLib)return;
  // wa.me supports a message and URL, NOT a binary image attachment.
  window.open("https://wa.me/?text="+encodeURIComponent(shareLib.shareCaption(shareData)),
   "_blank","noopener,noreferrer");
  feedback.textContent="LINK ONLY. ATTACH YOUR SAVED PNG IN WHATSAPP.";
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
  disposed=true;clearShare();clearInterval(interval);
  document.removeEventListener("visibilitychange",onVisibility);
 },{once:true});
}
