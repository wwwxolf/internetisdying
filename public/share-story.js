/* World_001 share story: deterministic, snapshot-derived, no random or AI runtime.
   The same immutable report feeds downloadable PNG and WhatsApp OG preview.
   'Winner' wording is used only when the corresponding verified impact dominates. */
export function shareStory(d){
 const heal=Number(d.heal_hp),kill=Number(d.kill_hp),decay=Number(d.decay_hp);
 const chaos=Number(d.chaos_hp),net=Number(d.net_hp),hp=Number(d.world_hp);
 const events=["heal_battles","kill_battles","decay_pulses","chaos_events"]
   .reduce((n,k)=>n+Number(d[k]||0),0);
 const quiet=heal===0&&kill===0&&decay===0&&chaos===0&&events===0;
 const story=(key,headline,detail,tone)=>({key,headline,detail,tone});
 if(hp===0)return story("offline",["THE INTERNET","IS OFFLINE_"],["NO SIGNAL","REMAINING_"],"kill");
 if(quiet)return story("quiet",["NO PECKS","REPORTED_"],["THE INTERNET","STAYED QUIET_"],"neutral");
 if(net===0)return story("stalemate",["TOTAL","STALEMATE_"],["CHICKEN MEETS","FIREWALL_"],"neutral");
 if(net>0){
  if(chaos>heal)return story("chaos-recovery",["CHAOS SAVED","THE NET_"],["UNEXPECTED","RECOVERY_"],"heal");
  return story("recovery",["PATCHED FOR","NOW_"],["THE INTERNET","FOUGHT BACK_"],"heal");
 }
 const negChaos=Math.max(0,-chaos);
 if(negChaos>kill&&negChaos>decay)
   return story("chaos-damage",["CHAOS BURST","STRUCK_"],["THE NET","TOOK A HIT_"],"chaos");
 if(decay>kill&&decay>=negChaos)
   return story("decay",["THE NET IS","ROTTING_"],["SILENT DAMAGE","SPREADS_"],"decay");
 if(kill>0&&kill>=decay&&kill>=negChaos)
   return story("chicken",["THE CHICKEN","IS WINNING_"],["PECK DAMAGE","LED THE FALL_"],"kill");
 return story("damage",["THE INTERNET","TOOK A HIT_"],["THE SIGNAL","FELL BACK_"],"kill");
}

export const SHARE_LABELS=Object.freeze({
 heal:"INTERNET REPAIRED",kill:"CHICKEN DAMAGE",decay:"NET DECAY",
 chaos:"CHAOS BURST",net:"NET INTERNET CHANGE",health:"INTERNET HEALTH"
});
