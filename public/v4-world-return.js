import {initV4ShareUI} from "./v4-share-ui.js";
/* V4 return report is independent from legacy V2 reporting and sharing.
   Display verified settled HP, never equate faction power to applied world HP. */
export function v4ReturnHeadline(data){
 if(data.first_visit)return 'WELCOME TO WORLD_001_';
 const net=Number(data.net_hp);
 const activity=Number(data.battle_windows)+Number(data.decay_pulses)+Number(data.chaos_events);
 if(activity===0)return 'NOT A SINGLE PECK WAS HEARD_';
 if(net>0)return 'THE INTERNET BITES BACK_';
 if(net===0)return 'A PERFECT STALEMATE_';
 const battle=Number(data.battle_world_hp),decay=Number(data.decay_hp),chaos=Number(data.chaos_hp);
 if(battle<0&&-battle>=Math.max(decay,-chaos))return 'THE CHICKEN IS WINNING_';
 if(decay>0&&decay>=Math.max(-battle,-chaos))return 'SIGNAL ROT IS SPREADING_';
 if(chaos<0&&-chaos>Math.max(-battle,decay))return 'THE COOP WENT WILD_';
 return 'THE INTERNET TOOK A HIT_';
}

export async function initV4WorldReturn({sb,nickname}){
 const $=id=>document.getElementById(id);
 const root=$('world-return');
 if(!root)return;
 root.hidden=false;
 // V4 has its own immutable share publisher; never reuse iid_publish_share_card (V2).
 initV4ShareUI({sb});
 const statLabel=(cls,label)=>{
  const el=root.querySelector('.world-return-stat.'+cls+' span');
  if(el)el.textContent=label;
 };
 statLabel('heal','SAVE FACTION POWER');
 statLabel('kill','KILL FACTION POWER');
 statLabel('decay','SETTLED NET DECAY');
 statLabel('chaos','CHAOS WORLD IMPACT');
 const fmt=n=>Number(n).toLocaleString('en-US');
 const signed=n=>(n>0?'+':n<0?'−':'')+fmt(Math.abs(Number(n)));
 const text=(id,t)=>{$(id).textContent=String(t);};
 let busy=false;
 text('world-return-status','SYNCING V4 SETTLED HISTORY…');
 async function refresh(){
  if(busy)return;
  busy=true;
  try{
   const {data,error}=await sb.rpc('iid_v4_return_report');
   if(error)throw error;
   if(!data||data.engine_version!==4||data.source!=='V4_SETTLED_LEDGER')
    throw Error('Unverified V4 return report');
   for(const n of ['save_power','kill_power','world_hp','battle_world_hp','decay_hp','chaos_hp','net_hp',
    'battle_windows','decay_pulses','chaos_events']){
     if(!Number.isSafeInteger(Number(data[n])))throw Error('Invalid V4 report field: '+n);
   }
   root.dataset.trend=data.net_hp>0?'heal':data.net_hp<0?'kill':'quiet';
   text('world-return-name',nickname||'PLAYER');
   text('world-return-eyebrow',data.first_visit?'FIRST V4 VISIT_':'WHILE YOU WERE AWAY_');
   text('world-return-title',v4ReturnHeadline(data));
   text('world-return-since',data.first_visit
    ?'V4 WORLD EPOCH • VERIFIED EVENTS SINCE START'
    :'VERIFIED SETTLEMENTS SINCE '+new Date(data.from).toISOString().slice(0,16).replace('T',' ')+' UTC');
   text('world-return-heal','+'+fmt(data.save_power)+' POWER');
   text('world-return-kill','−'+fmt(data.kill_power)+' POWER');
   text('world-return-decay','−'+fmt(Math.max(0,data.decay_hp))+' HP');
   text('world-return-chaos',signed(data.chaos_hp)+' HP');
   text('world-return-net',signed(data.net_hp)+' HP');
   text('world-return-world',fmt(data.world_hp)+' / 1,000,000 HP');
   text('world-return-activity',fmt(data.battle_windows)+' SETTLED WAR WINDOWS • '+
    fmt(data.chaos_events)+' CHAOS EVENTS • '+fmt(data.decay_pulses)+' DECAY PULSES'+
    ' • NET BATTLE '+signed(data.battle_world_hp)+' HP');
   const evt=data.latest_event;
   text('world-return-event',evt
    ?'LAST SETTLED '+evt.kind+' • '+signed(evt.applied_hp)+' WORLD HP'
    :'NO SETTLED WORLD EVENTS IN THIS REPORT PERIOD');
   text('world-return-status','SERVER VERIFIED • V4 EPOCH REPORT • '+new Date(data.until).toISOString().slice(0,16).replace('T',' ')+' UTC');
  }catch(e){
   text('world-return-status','V4 WORLD HISTORY UNAVAILABLE • RETRY ON RELOAD');
   console.warn('V4 report unavailable',e);
  }finally{busy=false;}
 }
 $('world-return-dismiss').addEventListener('click',()=>{root.hidden=true;});
 await refresh();
}
