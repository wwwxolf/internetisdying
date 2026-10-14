/* Six fixed UTC battle windows. Usage is authoritative from iid_battle_status,
 * never browser storage. The client clock is adjusted from server_now.
 * The server independently enforces one action per four-hour UTC window.
 */
export const WINDOWS_UTC=Object.freeze([
 ["00.00","03.59"],["04.00","07.59"],["08.00","11.59"],
 ["12.00","15.59"],["16.00","19.59"],["20.00","23.59"]
]);
const HOUR=3600000;
export function utcDay(ms){
 if(!Number.isFinite(ms))throw Error("Invalid timestamp");
 return new Date(ms).toISOString().slice(0,10);
}
export function activeSlot(ms){
 if(!Number.isFinite(ms))throw Error("Invalid timestamp");
 return Math.floor(new Date(ms).getUTCHours()/4);
}
export function evaluateWindows(state,ms){
 if(!state||!Array.isArray(state.window_used)||state.window_used.length!==6||
    state.window_used.some(v=>typeof v!=="boolean"))
  return {ready:false,reason:"UNVERIFIED WINDOW DATA",windows:[]};
 const date=utcDay(ms),slot=activeSlot(ms);
 if(state.window_day!==date||state.window_timezone!=="UTC")
  return {ready:false,reason:"SYNCING NEW UTC DAY",windows:[]};
 const midnightUtc=Date.parse(date+"T00:00:00Z");
 const windows=WINDOWS_UTC.map(([start,end],i)=>{
  const stateName=state.window_used[i]?"USED":i<slot?"MISSED":i===slot?"ACTIVE":"LOCKED";
  return {index:i,start,end,state:stateName,minutesLeft:
    i===slot?Math.max(0,Math.ceil((midnightUtc+(i+1)*4*HOUR-ms)/60000)):null};
 });
 const untilNext=Math.max(0,Math.ceil((midnightUtc+(slot+1)*4*HOUR-ms)/60000));
 return {ready:true,date,slot,windows,currentUsed:state.window_used[slot],
  minutesLeft:untilNext};
}
