/* Six fixed WIB (UTC+7) battle windows. Authoritative usage comes from
 * iid_battle_status, not localStorage or a client-submitted counter.
 * Clock is adjusted by server_now offset; server still gates every start.
 */
export const WINDOWS_WIB=Object.freeze([
 ["00.00","03.59"],["04.00","07.59"],["08.00","11.59"],
 ["12.00","15.59"],["16.00","19.59"],["20.00","23.59"]
]);
const HOUR=3600000, DAY=86400000, WIB=7*HOUR;
export function wibDay(ms){
 if(!Number.isFinite(ms))throw Error("Invalid timestamp");
 return new Date(ms+WIB).toISOString().slice(0,10);
}
export function activeSlot(ms){
 if(!Number.isFinite(ms))throw Error("Invalid timestamp");
 return Math.floor(new Date(ms+WIB).getUTCHours()/4);
}
export function evaluateWindows(state,ms){
 if(!state||!Array.isArray(state.window_used)||state.window_used.length!==6||
    state.window_used.some(v=>typeof v!=="boolean"))
  return {ready:false,reason:"UNVERIFIED WINDOW DATA",windows:[]};
 const date=wibDay(ms),slot=activeSlot(ms);
 if(state.window_day!==date||state.window_timezone!=="Asia/Jakarta"){
  return {ready:false,reason:"SYNCING NEW WIB DAY",windows:[]};
 }
 const midnightUtc=Date.parse(date+"T00:00:00Z")-WIB;
 const windows=WINDOWS_WIB.map(([start,end],i)=>{
  const stateName=state.window_used[i]?"USED":i<slot?"MISSED":i===slot?"ACTIVE":"LOCKED";
  return {index:i,start,end,state:stateName,minutesLeft:
    i===slot?Math.max(0,Math.ceil((midnightUtc+(i+1)*4*HOUR-ms)/60000)):null};
 });
 const untilNext=Math.max(0,Math.ceil((midnightUtc+(slot+1)*4*HOUR-ms)/60000));
 return {ready:true,date,slot,windows,currentUsed:state.window_used[slot],
   minutesLeft:untilNext};
}
