import {renderCountryBadge} from "./identity-flag.js";

/* Read-only leaderboard: all ranking data is calculated by authenticated RPC. */
export async function initHallOfFame({sb,rpcName="iid_hall_of_fame"}){
 const $=id=>document.getElementById(id);
 const root=$("hall-of-fame");
 if(!root)return;
 root.hidden=false;
 const status=$("hof-status"),refresh=$("hof-refresh"),scoring=$("hof-scoring");
 const create=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=String(text);
  return el;
 };
 const fmt=n=>Number(n||0).toLocaleString("en-US");
 const scoreLabel=(item,side,version)=>{
  const hp=Math.max(0,Number(item.hp)||0);
  if(version===2||version===4){
   const influence=Math.max(0,Number(item.score)||0);
   return (side==="save"?"+":"−")+fmt(influence)+(version===4?" FACTION POWER":" FACTION POINTS");
  }
  return (side==="save"?"+":"−")+fmt(hp)+" HP";
 };
 const entry=(item,side,version,selfLine=false)=>{
  const row=create("div","hof-entry"+(item.is_you||selfLine?" hof-you":""));
  row.append(create("span","hof-rank",item.rank?"#"+item.rank:"—"));
  row.append(create("span","hof-name",item.nickname||"PLAYER"));
  const badge=create("span","arena-country hof-country");
  renderCountryBadge(badge,item);
  row.append(badge);
  row.append(create("span","hof-hp hof-hp-"+side,scoreLabel(item,side,version)));
  if(item.is_you||selfLine){
   row.setAttribute("aria-label","Your ranking");
   row.append(create("span","hof-you-tag","YOU"));
  }
  return row;
 };
 const showSide=(side,data,version)=>{
  const total=$("hof-"+side+"-total");
  if(total){
   if(version===2||version===4){
    total.textContent="TOTAL "+(side==="save"?"SAVE +":"KILL −")+
      fmt(Math.max(0,Number(data?.total_score)||0))+(version===4?" FACTION POWER":" FACTION POINTS");
   }else{
    total.textContent="TOTAL "+(side==="save"?"SAVE +":"KILL −")+
      fmt(Math.max(0,Number(data?.total_hp)||0))+" HP";
   }
  }
  const list=$("hof-"+side+"-list"),footer=$("hof-"+side+"-self");
  list.replaceChildren();
  const top=Array.isArray(data?.top)?data.top.slice(0,10):[];
  if(top.length===0)list.append(create("p","hof-empty","NO VERIFIED BATTLES YET"));
  else for(const item of top)list.append(entry(item,side,version));
  footer.replaceChildren();
  const self=data?.self;
  if(!self){footer.hidden=true;return;}
  if(self.in_top10){footer.hidden=true;return;}
  footer.hidden=false;
  footer.append(create("div","hof-self-divider",top.length?"YOUR POSITION":"YOUR RANK"));
  if(self.qualified&&Number.isInteger(self.rank)&&self.rank>0){
   footer.append(entry({...self,is_you:true},side,version,true));
  }else{
   const row=create("div","hof-entry hof-unranked");
   row.append(create("span","hof-rank","—"));
   row.append(create("span","hof-name",self.nickname||"PLAYER"));
   const badge=create("span","arena-country hof-country");
   renderCountryBadge(badge,self);
   row.append(badge);
   row.append(create("span","hof-hp hof-hp-"+side,scoreLabel(self,side,version)));
   row.append(create("span","hof-unranked-label","UNRANKED"));
   footer.append(row);
  }
 };

 const renderLegendary=(items,enabled)=>{
  const section=$("hof-legendary"),list=$("hof-legendary-list");
  if(!section||!list)return;
  section.hidden=!enabled;
  list.replaceChildren();
  if(!enabled)return;
  const records=Array.isArray(items)?items.slice(0,3):[];
  for(let i=0;i<3;i++){
   const item=records[i];
   const podium=create("article","hof-legendary-card hof-legendary-rank-"+(i+1));
   podium.append(create("span","hof-legendary-place","#"+(i+1)));
   if(item){
    podium.append(create("span","hof-legendary-name",item.nickname||"PLAYER"));
    const badge=create("span","arena-country hof-legendary-country");
    renderCountryBadge(badge,item);
    podium.append(badge);
    podium.append(create("strong","hof-legendary-power",fmt(item.power)));
    podium.append(create("span","hof-legendary-unit","PERSONAL POWER"));
    podium.append(create("span","hof-legendary-side "+(item.action==="HEAL"?"save":"kill"),
      item.action==="HEAL"?"✦ SAVE":"✕ KILL"));
    if(item.is_you)podium.append(create("span","hof-legendary-you","YOU"));
   }else{
    podium.className+=" hof-legendary-awaiting";
    podium.append(create("span","hof-legendary-empty","AWAITING VERIFIED BATTLE"));
   }
   list.append(podium);
  }
 };
 let busy=false;
 async function reload(){
  if(busy)return;
  busy=true;refresh.disabled=true;status.textContent="SYNCING VERIFIED RANKINGS…";
  try{
   const {data,error}=await sb.rpc(rpcName);
   if(error)throw error;
   if(!data||!data.save||!data.kill)throw Error("Unexpected response");
   showSide("save",data.save,data.engine_version);
   showSide("kill",data.kill,data.engine_version);
   const season=data.season;
   scoring.textContent=data.engine_version===4
    ?"V4 • 30-DAY EPOCH • VERIFIED FACTION POWER"
    :data.engine_version===2
    ?"SEASON "+String(season?.number||1).padStart(2,"0")+" • 30-DAY FACTION RANKINGS • 4H WORLD SETTLEMENT"
    :"V1 • VERIFIED PERSONAL POWER";
   const note=$("hof-cycle-note");
   if(note){
    note.textContent=data.engine_version===4 && data.ends_at
     ?"WORLD ENDS "+new Date(data.ends_at).toLocaleDateString("en-US",{timeZone:"UTC",day:"numeric",month:"short",year:"numeric"}).toUpperCase()+" UTC • CURRENT EPOCH ONLY"
     :data.engine_version===2 && season?.ends_at
     ?"LEADERBOARD ENDS "+new Date(season.ends_at).toLocaleDateString("en-US",{timeZone:"UTC",day:"numeric",month:"short",year:"numeric"}).toUpperCase()+" UTC • WORLD EPOCH V3 NOT ACTIVE"
     :"LEGACY ALL-TIME RANKINGS • WORLD EPOCH V3 NOT ACTIVE";
   }
   renderLegendary(data.legendary,data.engine_version===2||data.engine_version===4);
   if(data.engine_version===4){
     const personal=data.personal;
     $("monthly-summary").textContent=personal
      ?"V4 • CURRENT EPOCH\\nVERIFIED BATTLES "+fmt(personal.battles)+
       " • SAVE +"+fmt(personal.save_power)+" FACTION POWER"+
       " • KILL −"+fmt(personal.kill_power)+" FACTION POWER"+
       "\\nWORLD HP IS SETTLED SEPARATELY"
      :"V4 PERSONAL STATS UNAVAILABLE";
   }
   status.textContent="SERVER VERIFIED • UPDATED";
  }catch(e){
   status.textContent="RANKINGS TEMPORARILY UNAVAILABLE • TAP RETRY";
   console.warn("Hall of Fame unavailable:",e);
  }finally{busy=false;refresh.disabled=false;}
 }
 refresh.addEventListener("click",reload);
 // Battle results are recorded before this event; refresh the ranks without page reload.
 const onBattleSettled=()=>{void reload();};
 if(typeof document.addEventListener==="function"){
  document.addEventListener("iid:battle-settled",onBattleSettled);
  if(typeof window!=="undefined"&&typeof window.addEventListener==="function"){
   window.addEventListener("pagehide",()=>document.removeEventListener("iid:battle-settled",onBattleSettled),{once:true});
  }
 }
 await reload();
}
