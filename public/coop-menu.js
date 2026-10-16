/* THE COOP MENU_ — presentation-only Arena drawer.
 * Moves existing DOM sections intact: never changes gameplay, RPCs or timers.
 * Closed by default; automatically closes when an active Tap Battle appears.
 */
const VIEWS=Object.freeze({
 report:{node:"world-return",selector:null},
 fame:{node:"hall-of-fame",selector:null},
 stats:{selector:".arena-test-tools"},
 schedule:{selector:".battle-windows"},
 fighter:{node:"arena-dev-mode",selector:null}
});
export function initCoopMenu({doc=document,win=window}={}){
 const $=id=>doc.getElementById(id);
 const arena=$("arena-content"),drawer=$("coop-menu-drawer"),tab=$("coop-menu-toggle"),
  backdrop=$("coop-menu-backdrop"),closeButton=$("coop-menu-close");
 if(!arena||!drawer||!tab||!backdrop||!closeButton)return null;
 const panes=Object.fromEntries(Object.keys(VIEWS).map(k=>[k,$("coop-pane-"+k)]));
 const nav=[...drawer.querySelectorAll("[data-coop-view]")];
 const world=$("world-return"),battle=$("tap-battle");
 const focusables=()=>[...drawer.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]
  .filter(el=>!el.closest('[hidden]')&&!el.hidden);
 let opened=false,current="report",previousFocus=null,observer=null;
 // Use the actual sections, preserving their listeners, IDs, RPC ownership,
 // existing hidden state and all HTML. Never clone content or duplicate IDs.
 const place=(key,source)=>{
  const node=source||($(VIEWS[key].node)||doc.querySelector(VIEWS[key].selector));
  if(node&&panes[key])panes[key].append(node);
 };
 place("report");
 place("fame");
 place("stats");
 place("schedule");
 place("fighter");
 const signout=$("signout");
 if(signout)$("coop-account-actions")?.append(signout);
 const reportDismiss=$("world-return-dismiss");
 // In the drawer, X means close panel, not permanently hide the server report.
 reportDismiss?.addEventListener("click",event=>{
  event.stopImmediatePropagation?.();
  close();
 },true);
 const battleLive=()=>Boolean(battle&&!battle.hidden);
 const battleState=()=>{
  const active=battleLive();
  doc.body.classList.toggle("coop-battle-live",active);
  tab.disabled=active;
  if(active&&opened)close(false);
 };
 const focusTarget=()=>{
  const active=nav.find(b=>b.dataset.coopView===current);
  return active||closeButton;
 };
 function select(view,focusReportShare=false){
  if(!panes[view])return;
  current=view;
  Object.entries(panes).forEach(([id,pane])=>{pane.hidden=id!==view;});
  nav.forEach(b=>{
   const active=b.dataset.coopView===view&&!focusReportShare;
   b.setAttribute("aria-pressed",String(active));
   b.classList.toggle("coop-nav-selected",active);
  });
  $("coop-menu-current").textContent=({
   report:"WORLD REPORT_",fame:"HALL OF FAME_",stats:"MY STATS_",
   schedule:"BATTLE SCHEDULE_",fighter:"MY FIGHTER_"
  })[view];
  if(opened){
   $("coop-menu-scroll").scrollTop=0;
   if(focusReportShare){
    const share=$("world-return-share");
    if(share&&!share.disabled&&!share.hidden&&!world?.hidden){share.focus();return;}
   }
   focusTarget().focus();
  }
 }
 function open(view="report",share=false){
  if(battleLive())return;
  if(!opened){
   previousFocus=doc.activeElement;opened=true;
   backdrop.hidden=false;drawer.hidden=false;drawer.inert=false;
   drawer.setAttribute("aria-hidden","false");
   doc.body.classList.add("coop-menu-open");
   tab.setAttribute("aria-expanded","true");
  }
  select(view,share);
 }
 function close(restoreFocus=true){
  if(!opened)return;
  opened=false;
  drawer.hidden=true;drawer.inert=true;
  drawer.setAttribute("aria-hidden","true");
  backdrop.hidden=true;
  doc.body.classList.remove("coop-menu-open");
  tab.setAttribute("aria-expanded","false");
  if(restoreFocus&&!battleLive()){
   (previousFocus?.isConnected&&typeof previousFocus.focus==="function"?previousFocus:tab).focus();
  }
 }
 tab.addEventListener("click",()=>opened?close():open("report"));
 closeButton.addEventListener("click",()=>close());
 backdrop.addEventListener("click",()=>close());
 nav.forEach(b=>b.addEventListener("click",()=>select(b.dataset.coopView)));
 const quickShare=$("coop-share-cta");
 quickShare?.addEventListener("click",()=>open("report",true));
 quickShare&&(quickShare.hidden=false);
 // Tab trapping is restricted to the open dialog. Dialog is inert when closed.
 drawer.addEventListener("keydown",e=>{
  if(e.key!=="Tab")return;
  const list=focusables();if(!list.length){e.preventDefault();closeButton.focus();return;}
  const first=list[0],last=list[list.length-1];
  if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}
 });
 doc.addEventListener("keydown",e=>{if(e.key==="Escape"&&opened)close();});
 if(battle&&typeof MutationObserver!=="undefined"){
  observer=new MutationObserver(battleState);
  observer.observe(battle,{attributes:true,attributeFilter:["hidden"]});
 }
 battleState();
 drawer.inert=true;drawer.hidden=true;backdrop.hidden=true;
 tab.hidden=false;tab.setAttribute("aria-expanded","false");
 return {open,close,select,isOpen:()=>opened,dispose:()=>{observer?.disconnect();close(false);}};
}
if(typeof document!=="undefined"){
 // The menu is initialized without awaiting authentication or any game API.
 // Both V2 and V4 can continue to find their original section IDs.
 if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",()=>initCoopMenu(),{once:true});
 }else initCoopMenu();
}
