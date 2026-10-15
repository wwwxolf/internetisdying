// World_001 narrative only. No authentication, gameplay, API calls or battle effects.
export const PROLOGUE_SCENES=Object.freeze([
 {line:"Once upon a time, the internet was peaceful.",aside:""},
 {line:"Then one chicken got hungry.",aside:"Nobody knows where it came from."},
 {line:"It ate the internet.",aside:"Yep. The actual internet."},
 {line:"You could stop this.",aside:"But let's be honest... feeding the chicken sounds fun."}
]);

export function initPrologue({
 doc=globalThis.document, locationObj=globalThis.location,
 storage=globalThis.localStorage, schedule=globalThis.setTimeout,
 cancel=globalThis.clearTimeout
}={}){
 const $=id=>doc.getElementById(id);
 const key="iid_world001_prologue_seen_v1";
 const replay=new URLSearchParams(locationObj.search||"").get("replay")==="1";
 const readSeen=()=>{try{return storage?.getItem(key)==="1";}catch{return false;}};
 const markSeen=()=>{try{storage?.setItem(key,"1");}catch{/* Private browsing: still allow onboarding. */}};
 if(!replay&&readSeen()){
  locationObj.replace(new URL("./auth.html",locationObj.href).href);
  return {skippedForReturningVisitor:true};
 }
 let index=0,handle=null,finished=false;
 const frame=$("prologue-frame"),line=$("prologue-line"),aside=$("prologue-aside");
 const count=$("prologue-count"),next=$("prologue-next"),skip=$("prologue-skip");
 const controls=doc.querySelector(".prologue-controls"),ending=$("prologue-final");
 const dots=[...doc.querySelectorAll("[data-progress]")];
 const stop=()=>{if(handle!==null){cancel(handle);handle=null;}};
 const showEnding=()=>{
  stop();if(finished)return;finished=true;
  controls.hidden=true;ending.hidden=false;
  $("prologue-save").focus();
 };
 const render=step=>{
  stop();index=step;
  frame.dataset.scene=String(step);
  line.textContent=PROLOGUE_SCENES[step].line;
  aside.textContent=PROLOGUE_SCENES[step].aside;
  count.textContent="SCENE "+String(step+1).padStart(2,"0")+" / 04";
  next.textContent=step===3?"MAKE YOUR CHOICE →":"NEXT SCENE →";
  dots.forEach((dot,i)=>{
   dot.classList.toggle("current",i===step);
   dot.classList.toggle("done",i<step);
  });
  // After the fourth scene, wait for an explicit decision.
  if(step<3){
   handle=schedule(()=>{
    if(doc.visibilityState!=="hidden"&&!finished)render(step+1);
    else if(!finished)handle=schedule(()=>{if(!finished)render(step+1)},2800);
   },2900);
  }
 };
 next.addEventListener("click",()=>{if(finished)return;if(index===3)showEnding();else render(index+1);});
 skip.addEventListener("click",()=>{if(finished)return;render(3);showEnding();});
 for(const id of ["prologue-save","prologue-kill"])$(id).addEventListener("click",markSeen);
 doc.addEventListener("visibilitychange",()=>{if(doc.visibilityState==="hidden")stop();});
 render(0);
 return {getCurrentScene:()=>index,stop};
}
if(typeof document!=="undefined"&&document.body?.dataset.page==="prologue")initPrologue();
