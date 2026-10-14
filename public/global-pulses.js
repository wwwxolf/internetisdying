/* Global PULSES: public, read-only aggregate of server-verified, settled taps.
 * Does NOT count client tapping, pending battles, simulated taps or app visits.
 * Never replace network failures with a fabricated number.
 */
const totalNode=document.getElementById("global-pulses-total");
const statusNode=document.getElementById("global-pulses-status");
const conf=window.IID_CONFIG||{};
const url=String(conf.supabaseUrl||"");
const key=String(conf.supabasePublishableKey||"");
let busy=false;
async function updateGlobalPulses() {
  if(!totalNode||!statusNode||busy||document.hidden)return;
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)||key.length<16){
    statusNode.textContent="SERVER DATA UNAVAILABLE";
    return;
  }
  busy=true;
  try{
    const response=await fetch(url.replace(/\/$/,"")+"/rest/v1/rpc/iid_global_pulses",{
      method:"POST",
      headers:{"apikey":key,"content-type":"application/json","cache-control":"no-cache"},
      body:"{}",
      cache:"no-store",
      credentials:"omit"
    });
    if(!response.ok)throw Error("Server response "+response.status);
    const data=await response.json();
    if(!data||!Number.isSafeInteger(Number(data.total_pulses))||Number(data.total_pulses)<0)
      throw Error("Invalid pulse total");
    totalNode.textContent=Number(data.total_pulses).toLocaleString("en-US");
    statusNode.textContent=data.world_active===true
      ?"SERVER VERIFIED • COMPLETED BATTLES"
      :"SERVER VERIFIED • GLOBAL BATTLES PAUSED";
  }catch(err){
    // A previously verified value can remain visible, but never invent a zero.
    statusNode.textContent="SYNC UNAVAILABLE • RETRYING";
    console.warn("Global pulses sync unavailable:",err.message);
  }finally{busy=false;}
}
if(totalNode&&statusNode){
  void updateGlobalPulses();
  const poll=setInterval(()=>{void updateGlobalPulses();},60000);
  const onVisible=()=>{if(!document.hidden)void updateGlobalPulses();};
  document.addEventListener("visibilitychange",onVisible);
  window.addEventListener("pagehide",()=>{
    clearInterval(poll);
    document.removeEventListener("visibilitychange",onVisible);
  },{once:true});
}
