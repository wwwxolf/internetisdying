import {shareStory} from "./share-story.js";

export const V4_SHARE_LABELS=Object.freeze({
 heal:"NET BATTLE REPAIRS",kill:"NET BATTLE DAMAGE",decay:"NET DECAY",
 chaos:"CHAOS BURST",net:"NET INTERNET CHANGE",health:"INTERNET HEALTH"
});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const FIELDS=["world_hp","heal_hp","kill_hp","decay_hp","chaos_hp","net_hp",
 "heal_battles","kill_battles","battle_windows","decay_pulses","chaos_events","world_version"];

export function validateV4Share(d){
 if(!d||d.source!=="V4_SETTLED_LEDGER_SHARE"||d.engine_version!==4||
   d.period!=="LAST_24H"||!UUID.test(String(d.epoch_id))||
   !Number.isFinite(Date.parse(d.snapshot_at))||!Number.isFinite(Date.parse(d.from))||
   Date.parse(d.from)>Date.parse(d.snapshot_at)||
   Date.parse(d.snapshot_at)-Date.parse(d.from)>86400000||
   !["ACTIVE","FINAL"].includes(d.world_status)||
   !(d.winner===null||d.winner==="SAVE"||d.winner==="KILL"))
  throw Error("Unverified V4 world snapshot");
 for(const key of FIELDS)
  if(d[key]===null||d[key]===undefined||!Number.isSafeInteger(Number(d[key])))
   throw Error("Invalid V4 snapshot value "+key);
 if(d.world_hp<0||d.world_hp>1000000||
    d.heal_hp<0||d.kill_hp<0||d.decay_hp<0||d.world_version<0||
    ["heal_battles","kill_battles","battle_windows","decay_pulses","chaos_events"].some(k=>d[k]<0)||
    d.battle_windows<d.heal_battles+d.kill_battles||
    d.net_hp!==d.heal_hp-d.kill_hp-d.decay_hp+d.chaos_hp||
    (d.world_status==="FINAL"&&
      (d.winner===null||(d.world_hp===0&&d.winner!=="KILL")||
       (d.world_hp>0&&d.winner!=="SAVE")))||
    (d.world_status==="ACTIVE"&&(d.winner!==null||d.world_hp===0)))
  throw Error("V4 share impact does not balance");
 return d;
}

export function v4ShareStory(d){
 validateV4Share(d);
 if(d.world_status==="FINAL"&&d.winner==="SAVE")
  return {key:"world-won",headline:["THE INTERNET","SURVIVED_"],
   detail:["THE CHICKEN","LOST THE WAR_"],tone:"heal"};
 if(d.world_status==="FINAL"&&d.winner==="KILL")
  return {key:"world-lost",headline:["THE INTERNET","IS OFFLINE_"],
   detail:["THE CHICKEN","ATE THE NET_"],tone:"kill"};
 if(d.net_hp===0&&d.battle_windows>0&&d.heal_hp===0&&d.kill_hp===0&&
    d.decay_pulses===0&&d.chaos_events===0)
  return {key:"war-stalemate",headline:["THE BATTLE","STALLED_"],
   detail:["NO NET DAMAGE","WAS SETTLED_"],tone:"neutral"};
 return shareStory(d);
}

// The existing raster art accepts this algebraically equivalent projection.
// SAVE/KILL boxes represent positive/negative NET SETTLED BATTLE IMPACT,
// not direct per-player power. The original V4 marker stays in stored snapshots.
export function v4ToArtFields(d){
 validateV4Share(d);
 return {...d,source:"SERVER_LEDGER"};
}
