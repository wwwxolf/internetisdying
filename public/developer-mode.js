// Owner-only Developer Mode. UI is cosmetic gating; Supabase verifies OAuth session,
// developer allowlist, single-account safety and typed confirmation on EVERY reset.
export async function initDeveloperMode({sb,doc=document,win=window}){
 const $=id=>doc.getElementById(id);
 const panel=$("arena-dev-mode");
 if(!panel)return;
 let status;
 try{
  const response=await sb.rpc("iid_developer_status");
  if(response.error)throw response.error;
  status=response.data;
 }catch{
  panel.hidden=true;return;
 }
 if(status?.allowed!==true){panel.hidden=true;return;}
 panel.hidden=false;
 const word=$("dev-reset-confirm"),button=$("dev-reset-button"),message=$("dev-reset-message");
 const text="RESET WORLD_001";
 let busy=false;
 const render=()=>{button.disabled=busy||word.value.trim()!==text;};
 word.addEventListener("input",render);
 button.addEventListener("click",async()=>{
  if(busy||word.value.trim()!==text)return;
  busy=true;render();
  message.textContent="RESETTING TEST WORLD…";
  try{
   const {data,error}=await sb.rpc("iid_developer_reset",{p_confirm:text});
   if(error)throw error;
   if(data?.ok!==true||data.world_hp!==500000)throw Error("RESET_NOT_VERIFIED");
   message.textContent="RESET COMPLETE • WORLD 500,000 HP • RELOADING ARENA";
   // Reinitialize Arena, Hall of Fame, World Return and cached war momentum.
   if(typeof win.location?.reload==="function")win.location.reload();
  }catch(e){
   message.textContent="RESET REJECTED: "+(e?.message||"Unknown error");
  }finally{busy=false;render();}
 });
 render();
}
