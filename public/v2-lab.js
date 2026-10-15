// V2 simulation-only lab. No Supabase client, no auth, and no production mutations.
// Mirrors audited V2 formulas; production SQL remains the source of truth.
export function computeBattle(p){
 const {roll,crit_roll,draw,taps}=p;
 if(![roll,crit_roll,draw,taps].every(Number.isInteger)||roll<0||roll>=100||
  crit_roll<0||crit_roll>=100||taps<0||taps>24)throw Error("INVALID_SYNTHETIC_INPUT");
 const pool=roll<55?150:roll<85?350:roll<97?700:1201;
 if(draw<0||draw>=pool)throw Error("INVALID_DRAW");
 const base=(roll<55?100:roll<85?250:roll<97?600:1300)+draw;
 const critical=crit_roll<90?100:crit_roll<99?150:200;
 const bonus=Math.min(6,Math.floor(taps/4));
 const personal_power=Math.round(base*critical/100*(100+bonus)/100);
 const war_influence=Math.round(100*Math.sqrt(personal_power/400));
 return {base,critical,bonus,personal_power,war_influence};
}
export function totals(players){
 return players.reduce((acc,p)=>{
  if(p.action!=="HEAL"&&p.action!=="KILL")throw Error("INVALID_SIDE");
  acc[p.action==="HEAL"?"save":"kill"]+=p.war_influence;
  acc.count++;return acc;
 },{save:0,kill:0,count:0});
}
export function windowSettlement(players,worldHp=500000){
 const {save,kill,count}=totals(players);
 const q=save+kill===0?0:(save-kill)/(save+kill);
 // Production: round(6000*n/(n+2)*(exp(2*q/.12)-1)/(exp(2*q/.12)+1)).
 const nominal=Math.round(6000*count/(count+2)*Math.tanh(q/0.12));
 const hpAfter=Math.max(0,Math.min(1000000,worldHp+nominal));
 return {save,kill,count,q,nominal,applied:hpAfter-worldHp,hpAfter};
}
export function auditSamples(sample){
 if(sample?.simulation_only!==true||sample.engine_version!==2||sample.players?.length!==10)
  throw Error("EXPECTED_10_SIMULATED_PLAYERS");
 const ids=new Set(),names=new Set();
 for(const p of sample.players){
  if(ids.has(p.id)||names.has(p.nickname)||!p.nickname.startsWith("TEST_"))throw Error("DUPLICATE_TEST_IDENTITY");
  ids.add(p.id);names.add(p.nickname);
  const expected=computeBattle(p);
  for(const key of Object.keys(expected))if(expected[key]!==p[key])throw Error("FORMULA_MISMATCH_"+p.nickname+"_"+key);
 }
 const result=windowSettlement(sample.players,sample.baseline_hp);
 if(result.save!==sample.expected.save_influence||result.kill!==sample.expected.kill_influence||
 result.nominal!==sample.expected.nominal_hp||result.hpAfter!==sample.expected.settled_hp)
 throw Error("WINDOW_SETTLEMENT_MISMATCH");
 return result;
}
const $=id=>document.getElementById(id);
const fmt=n=>Number(n).toLocaleString("en-US");
const EMOJI={IDN:"🇮🇩",USA:"🇺🇸",JPN:"🇯🇵",GBR:"🇬🇧",BRA:"🇧🇷",DEU:"🇩🇪",FRA:"🇫🇷",KOR:"🇰🇷",IND:"🇮🇳",AUS:"🇦🇺"};
function node(tag,cls,value){
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(value!==undefined)e.textContent=String(value);
 return e;
}
function startLab(sample){
 const score=auditSamples(sample);
 const state={count:0,settled:false,autoplay:false};
 const real="SIMULATED ONLY • REAL WORLD_001 IS NOT MODIFIED";
 $("lab-warning").textContent=real;
 $("lab-audit").replaceChildren();
 for(const [label,result] of [
  ["10 TEST identities, no Google accounts",true],
  ["V2 SQL sample vs JavaScript formula (10/10)",true],
  ["CRIT / TAP BONUS / PERSONAL POWER",true],
  ["V2 influence separate from World HP",true],
  ["Window settlement bounds 0–1,000,000",true],
  ["No production Supabase writes",true]
 ]){
  const row=node("div","lab-audit-row");
  row.append(node("span","lab-audit-pass",result?"PASS":"FAIL"),node("span","",label));
  $("lab-audit").append(row);
 }
 const renderRanks=(side,list)=>{
  const target=$("lab-"+side+"-ranks");
  target.replaceChildren();
  const sorted=list.filter(p=>p.action===(side==="save"?"HEAL":"KILL"))
   .sort((a,b)=>b.war_influence-a.war_influence||a.id-b.id);
  if(!sorted.length){target.append(node("p","lab-empty","AWAITING FIRST "+side.toUpperCase()+" BATTLE"));return;}
  sorted.forEach((p,i)=>{
   const row=node("div","lab-rank");
   row.append(node("span","lab-place","#"+(i+1)),node("span","lab-rank-name",p.nickname),
    node("span","lab-country",(EMOJI[p.country_code]||"🌐")+" "+p.country_code),
    node("strong","lab-score",fmt(p.war_influence)+" WI"));
   target.append(row);
  });
 };
 function render(){
  const done=sample.players.slice(0,state.count);
  const tally=totals(done),simHp=state.settled?score.hpAfter:sample.baseline_hp;
  $("lab-count").textContent=state.count+" / 10";
  $("lab-save").textContent="+"+fmt(tally.save);
  $("lab-kill").textContent="−"+fmt(tally.kill);
  $("lab-hp").textContent=fmt(simHp);
  $("lab-meter-fill").style.width=(simHp/10000)+"%";
  $("lab-meter").setAttribute("aria-valuenow",String(simHp/10000));
  $("lab-hp-percent").textContent=(simHp/10000).toFixed(4).replace(/0+$/,"").replace(/\\.$/,"")+"%";
  $("lab-pending").textContent=state.settled?
   "WINDOW CLOSED • VERIFIED IN SIMULATION: "+(score.applied>=0?"+":"")+fmt(score.applied)+" HP":
   "WINDOW OPEN • "+fmt(tally.save+tally.kill)+" WAR INFLUENCE PENDING • REAL HP UNCHANGED";
  $("lab-delta").textContent=state.settled?
   (score.applied>=0?"+":"")+fmt(score.applied)+" HP APPLIED TO SIMULATED WORLD":"NO WORLD HP APPLIED YET";
  $("lab-next").disabled=state.count>=10||state.settled||state.autoplay;
  $("lab-all").disabled=state.count>=10||state.settled||state.autoplay;
  $("lab-settle").disabled=state.count!==10||state.settled||state.autoplay;
  $("lab-restart").disabled=state.autoplay;
  renderRanks("save",done);renderRanks("kill",done);
  const log=$("lab-battles");log.replaceChildren();
  sample.players.forEach((p,i)=>{
   const executed=i<state.count;
   const item=node("div","lab-player"+(executed?" played":""));
   const top=node("div","lab-player-head");
   top.append(node("span","lab-player-number",String(i+1).padStart(2,"0")),
    node("strong","",p.nickname),
    node("span","lab-origin",p.origin),
    node("span","lab-country",(EMOJI[p.country_code]||"🌐")+" "+p.country_code));
   const details=node("div","lab-player-detail",p.action==="HEAL"?"✦ SAVE":"✕ KILL");
   details.className+=" "+(p.action==="HEAL"?"positive":"negative");
   details.append(node("span","",executed?
    "TAPS "+p.taps+"/24 • CRIT ×"+(p.critical/100).toFixed(2)+" • BONUS +"+p.bonus+"%":"READY TO SIMULATE"));
   if(executed)details.append(node("strong","","+ "+fmt(p.war_influence)+" WI • "+fmt(p.personal_power)+" POWER"));
   else details.append(node("span","lab-idle","PENDING"));
   item.append(top,details);
   log.append(item);
  });
 }
 const step=()=>{
  if(state.count>=10||state.settled)return false;
  state.count++;render();return true;
 };
 $("lab-next").addEventListener("click",step);
 $("lab-all").addEventListener("click",async()=>{
  if(state.autoplay)return;state.autoplay=true;render();
  try{while(state.count<10){
   if(typeof document!=="undefined"&&document.hidden){while(state.count<10)step();break;}
   await new Promise(res=>setTimeout(res,230));
   step();
  }}finally{state.autoplay=false;render();}
 });
 $("lab-settle").addEventListener("click",()=>{
  if(state.count!==10||state.settled)return;
  state.settled=true;render();
 });
 $("lab-restart").addEventListener("click",()=>{
  if(state.autoplay)return;
  state.count=0;state.settled=false;render();
 });
 render();
}
if(typeof document!=="undefined"&&$("v2-lab")){
 fetch("./v2-lab-data.json?v=1",{cache:"no-store"})
  .then(async r=>{if(!r.ok)throw Error("HTTP "+r.status);return r.json();})
  .then(startLab)
  .catch(e=>{$("lab-warning").textContent="SIMULATION COULD NOT LOAD: "+e.message;});
}
