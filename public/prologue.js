// World_001 narrative only. No authentication, gameplay, API calls or battle effects.
export const PROLOGUE_SCENES=Object.freeze([
 {line:"Once upon a time, the internet was peaceful.",aside:""},
 {line:"Then one chicken got hungry.",aside:"Nobody knows where it came from."},
 {line:"It ate the internet.",aside:"Yep. The actual internet."},
 {line:"You could stop this.",aside:"But let's be honest... feeding the chicken sounds fun."}
]);

export function initPrologue({
 doc=globalThis.document, locationObj=globalThis.location,
 storage=globalThis.localStorage
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

 let index=0,finished=false;
 const frame=$("prologue-frame"),line=$("prologue-line"),aside=$("prologue-aside");
 const count=$("prologue-count"),next=$("prologue-next"),back=$("prologue-back");
 const skip=$("prologue-skip"),storyBack=$("prologue-story-back");
 const controls=doc.querySelector(".prologue-controls"),ending=$("prologue-final");
 const dots=[...doc.querySelectorAll("[data-progress]")];
 const render=step=>{
  index=step;
  frame.dataset.scene=String(step);
  line.textContent=PROLOGUE_SCENES[step].line;
  aside.textContent=PROLOGUE_SCENES[step].aside;
  count.textContent="SCENE "+String(step+1).padStart(2,"0")+" / 04";
  next.textContent=step===3?"MAKE YOUR CHOICE →":"NEXT SCENE →";
  back.disabled=step===0;
  dots.forEach((dot,i)=>{
   dot.classList.toggle("current",i===step);
   dot.classList.toggle("done",i<step);
  });
  // Scene changes are manual: the story never advances while a player reads.
 };
 const showEnding=()=>{
  if(finished)return;
  finished=true;
  controls.hidden=true;
  ending.hidden=false;
  $("prologue-save").focus();
 };
 next.addEventListener("click",()=>{
  if(finished)return;
  if(index===3)showEnding();
  else render(index+1);
 });
 back.addEventListener("click",()=>{
  if(!finished&&index>0)render(index-1);
 });
 skip.addEventListener("click",()=>{
  if(finished)return;
  render(3);
  showEnding();
 });
 storyBack.addEventListener("click",()=>{
  if(!finished)return;
  finished=false;
  ending.hidden=true;
  controls.hidden=false;
  render(3);
  next.focus();
 });
 for(const id of ["prologue-save","prologue-kill"])$(id).addEventListener("click",markSeen);
 render(0);
 return {getCurrentScene:()=>index};
}
if(typeof document!=="undefined"&&document.body?.dataset.page==="prologue")initPrologue();
