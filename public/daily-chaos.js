import {chaosPollDelay,jitterDelay} from "./arena-polling.js";
/* NEXT CHAOS: 30 rotating internet-themed pixel events.
 * Presentation and authenticated RPC only. Never predicts or changes HP locally.
 * Database remains the authority for one-vote/day, UTC timing and resolution.
 */
const PIXEL_ICONS = Object.freeze({
  bot:["00111100","01111110","11011011","11111111","10100101","11111111","01011010","11000011"],
  shield:["00111100","01111110","11111111","11011011","11111111","01111110","00111100","00011000"],
  virus:["01000010","10100101","01111110","11111111","11011011","11111111","01011010","10100101"],
  patch:["00011000","00011000","11111111","11111111","11111111","11111111","00011000","00011000"],
  server:["11111111","10000001","10111001","11111111","10000001","10111001","11111111","01100110"],
  lock:["00111100","01100110","11000011","11111111","11100111","11100111","11111111","11111111"],
  key:["00001111","00011001","00011001","00001111","00111100","01100000","11000000","11000000"],
  mail:["11111111","11000011","10100101","10011001","10011001","10100101","11000011","11111111"],
  cloud:["00011100","00111110","01111111","11111111","11111111","01111111","00000000","01101100"],
  cable:["11000011","01100110","00111100","00011000","00011000","00111100","01100110","11000011"],
  database:["01111110","11000011","11111111","11000011","11111111","11000011","11111111","01111110"],
  browser:["11111111","10101011","11111111","10000001","10111101","10100101","10000001","11111111"],
  ai:["00111100","01111110","11111111","11100111","11011011","11111111","01111110","00100100"],
  warning:["00011000","00111100","01111110","11111111","11100111","11100111","11111111","00011000"],
  signal:["00011000","00111100","01111110","11111111","00011000","00011000","00100100","01000010"],
  filter:["11111111","01111110","00111100","00011000","00011000","00011000","00111100","01111110"]
});
const ICON_RULES=[
  [/bot|automated|swarm|riot|ai|algorithm/i,"bot"],
  [/firewall|shield|trust|protection|security|2fa|authenticity/i,"shield"],
  [/malware|trojan|ransomware|virus|extension|cryptominer/i,"virus"],
  [/patch|hotfix|update|repair|restore|reboot/i,"patch"],
  [/server|cooling|ddos|load balancer|data center/i,"server"],
  [/lock|password|session|account|cookie/i,"lock"],
  [/passkey|encryption|credential/i,"key"],
  [/spam|mail|inbox|phishing|notification/i,"mail"],
  [/cloud|failover/i,"cloud"],
  [/router|network|backbone|cable|routing|dns/i,"cable"],
  [/data|leak|backup/i,"database"],
  [/browser|app store|api|protocol/i,"browser"],
  [/deepfake|ethical|scanner|truth|verification/i,"ai"],
  [/panic|outbreak|chaos|blackout|meltdown|crisis/i,"warning"],
  [/signal|broadcast|focus|quality|clean|filter|purification/i,"filter"]
];
function pixelIcon(name,side) {
 const selected=ICON_RULES.find(([rule])=>rule.test(name))?.[1]||"signal";
 const matrix=PIXEL_ICONS[selected];
 const primary=side==="damage"?"#ff657d":"#72dfa6";
 const shade=side==="damage"?"#982946":"#26866e";
 const squares=[];
 const rect=(x,y,color)=>'<rect x="'+x+'" y="'+y+'" width="1" height="1" fill="'+color+'"/>';
 matrix.forEach((row,y)=>[...row].forEach((ch,x)=>{
   if(ch==="1")squares.push(rect(x+4,y+4,(x+y)%5===0?shade:primary));
 }));
 for(let i=0;i<8;i++){
   const x=(i*7+3)%16,y=(i*11+1)%16;
   if(x>=4&&x<12&&y>=4&&y<12)continue;
   squares.push(rect(x,y,side==="damage"?"#76324f":"#2d776a"));
 }
 return '<svg viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges" focusable="false">'+squares.join("")+'</svg>';
}
export function chaosTierPreview(day) {
 return ((Math.max(1,Math.floor(day||1))-1)%30)+1;
}
export async function initDailyChaos({sb}) {
 const $=id=>document.getElementById(id);
 const root=$("next-chaos");
 if(!root)return;
 let data=null,offset=0,disposed=false,busy=false,fetching=false;
 let pollTimer=null,failures=0;
 const now=()=>Date.now()+offset;
 const fmt=n=>Number(n||0).toLocaleString("en-US");
 const text=(id,value)=>{$(id).textContent=value;};
 const buttons=[...root.querySelectorAll("[data-chaos-choice]")];
 const textStatus=(message)=>text("chaos-status",message);
 async function rpc(action,args={}) {
   const {data,error}=await sb.rpc("iid_chaos_"+action,args);
   if(error)throw error;
   if(data?.server_now)offset=Date.parse(data.server_now)-Date.now();
   return data;
 }
 function draw() {
   if(!data)return;
   const p=data.event;
   if(!p)return textStatus("TODAY'S CHAOS PAIR IS UNAVAILABLE.");
   text("chaos-day","ROTATION "+String(data.day_rotation).padStart(2,"0")+" / 30");
   text("chaos-damage-title",p.damage_title);
   text("chaos-recovery-title",p.recovery_title);
   text("chaos-damage-desc",p.damage_description);
   text("chaos-recovery-desc",p.recovery_description);
   text("chaos-damage-impact","IMPACT SCALES WITH VOTES");
   text("chaos-recovery-impact","IMPACT SCALES WITH VOTES");
   $("chaos-damage-art").innerHTML=pixelIcon(p.damage_title,"damage");
   $("chaos-recovery-art").innerHTML=pixelIcon(p.recovery_title,"recovery");
   const cast=!!data.voted_for,open=data.enabled&&now()<Date.parse(data.closes_at);
   buttons.forEach(button=>{
     const choice=button.dataset.chaosChoice;
     button.disabled=busy||cast||!open;
     button.setAttribute("aria-pressed",String(choice===data.voted_for));
   });
   const total=Number(data.damage_votes||0)+Number(data.recovery_votes||0);
   const recoveryPct=total?Math.round(Number(data.recovery_votes)*100/total):50;
   $("chaos-vote-meter-recovery").style.width=recoveryPct+"%";
   $("chaos-vote-meter-damage").style.width=(100-recoveryPct)+"%";
   text("chaos-vote-count",fmt(total)+" VOTES • "+fmt(data.recovery_votes)+" DEFENSE / "+fmt(data.damage_votes)+" CHAOS");
   const projection=Number(data.projected_impact_hp||0);
   const projectionEl=$("chaos-projected-impact");
   projectionEl.dataset.side=projection>0?"recovery":projection<0?"damage":"tie";
   text("chaos-projected-impact",
     !data.enabled?"HYBRID VOTE POWER • PREVIEW ONLY"
     :total<Number(data.min_votes)?"MINIMUM "+fmt(data.min_votes)+" VOTES REQUIRED • CURRENT "+fmt(total)
     :projection===0?"PROJECTED IMPACT: 0 HP • TIE / TOO CLOSE"
     :"CURRENT PROJECTED IMPACT: "+(projection>0?"+":"−")+fmt(Math.abs(projection))+" HP");

   textStatus(!data.enabled?"CHAOS VOTING IS PAUSED • PIXEL PREVIEW ONLY"
    :cast?"YOUR VOTE IS LOCKED: "+data.voted_for.toUpperCase()
    :open?"CHOOSE ONE EVENT • ONE VOTE PER UTC DAY"
    :"VOTING CLOSED • WAITING FOR DAILY RESULTS");
   const result=data.latest_result;
   text("chaos-last-result",!result?"NO DAILY EVENT HAS BEEN EXECUTED YET"
     :result.winner==="tie"?"LAST EVENT: CHAOS STALEMATE • NO HP CHANGE"
     :result.winner==="no_quorum"?"LAST EVENT: INSUFFICIENT VOTES • NO HP CHANGE"
     :"LAST EVENT: "+result.winner.toUpperCase()+" WON • "+(result.applied_hp>=0?"+":"")+fmt(result.applied_hp)+" HP");
   if(data.last_decay){
     text("chaos-last-decay","LAST DECAY −"+fmt(data.last_decay.rolled_hp)+" HP");
   }else text("chaos-last-decay","WORLD DECAY NOT STARTED");
   tick();
 }
 function tick() {
   if(!data)return;
   const countdown=(ms)=> {
     const s=Math.ceil(Math.max(0,ms)/1000);
     return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(v=>String(v).padStart(2,"0")).join(":");
   };
   text("chaos-vote-time",countdown(Date.parse(data.closes_at)-now()));
   text("chaos-decay-time",data.next_decay_at?
     countdown(Date.parse(data.next_decay_at)-now()):"PAUSED");
 }
 function scheduleRefresh(delay){
   clearTimeout(pollTimer);pollTimer=null;
   if(disposed||document.hidden)return;
   pollTimer=setTimeout(()=>{pollTimer=null;void refresh();},delay);
 }
 async function refresh() {
   if(disposed||fetching||busy)return;
   fetching=true;
   try{
     data=await rpc("status");
     failures=0;draw();
   }catch(e){failures++;textStatus("SERVER SYNC FAILED: "+(e.message||"Please retry"));}
   finally{fetching=false;scheduleRefresh(chaosPollDelay(data?.enabled,failures));}
 }
 async function vote(choice) {
   if(!data?.enabled||busy||data.voted_for||now()>=Date.parse(data.closes_at))return;
   busy=true;draw();
   try{
     await rpc("vote",{p_choice:choice});
     // Always re-query authoritative vote totals and locked choice.
   }catch(e){textStatus("VOTE NOT CONFIRMED: "+e.message);}
   finally{busy=false;await refresh();}
 }
 buttons.forEach(button=>button.addEventListener("click",()=>vote(button.dataset.chaosChoice)));
 root.hidden=false;
 await refresh();
 const timer=setInterval(()=>{if(!document.hidden)tick();},1000);
 const visibility=()=>{
   if(document.hidden){clearTimeout(pollTimer);pollTimer=null;return;}
   tick();scheduleRefresh(jitterDelay(1500,5500));
 };
 document.addEventListener("visibilitychange",visibility);
 window.addEventListener("pagehide",()=>{
   disposed=true;clearInterval(timer);clearTimeout(pollTimer);
   document.removeEventListener("visibilitychange",visibility);
 },{once:true});
}
