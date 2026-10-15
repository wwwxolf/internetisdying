import {renderCountryBadge} from "./identity-flag.js";

/* Read-only leaderboard: all ranking data is calculated by authenticated RPC. */
export async function initHallOfFame({sb}){
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
  if(version===2){
   const influence=Math.max(0,Number(item.score)||0);
   return (side==="save"?"+":"−")+fmt(influence)+" INFLUENCE"
     +(hp>0?" • V1: "+(side==="save"?"+":"−")+fmt(hp)+" HP":"");
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
  if(total)total.textContent=(version===2?"HISTORIC V1 ":"TOTAL ")+
   (side==="save"?"SAVE ":"KILL ")+(side==="save"?"+":"−")+
   fmt(Math.max(0,Number(data?.total_hp)||0))+" HP";
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
 let busy=false;
 async function reload(){
  if(busy)return;
  busy=true;refresh.disabled=true;status.textContent="SYNCING VERIFIED RANKINGS…";
  try{
   const {data,error}=await sb.rpc("iid_hall_of_fame");
   if(error)throw error;
   if(!data||!data.save||!data.kill)throw Error("Unexpected response");
   showSide("save",data.save,data.engine_version);
   showSide("kill",data.kill,data.engine_version);
   scoring.textContent="ALL TIME • VERIFIED V"+data.engine_version+" "+data.score_unit+
    " • V1 AND V2 SCORES NEVER MIX";
   status.textContent="SERVER VERIFIED • UPDATED";
  }catch(e){
   status.textContent="RANKINGS TEMPORARILY UNAVAILABLE • TAP RETRY";
   console.warn("Hall of Fame unavailable:",e);
  }finally{busy=false;refresh.disabled=false;}
 }
 refresh.addEventListener("click",reload);
 await reload();
}
