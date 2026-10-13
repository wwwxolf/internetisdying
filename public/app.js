/* THE INTERNET IS DYING — UI V2 local-only demo engine.
 * Random weights and critical multipliers are intentionally unchanged from V1:
 * 60% 0-500, 30% 501-2000, 9% 2001-10000, 1% 10001-25000;
 * 95% x1, 4% x2, 1% x3. No real votes, no backend, no payments.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const MAX_HP=1000000, START_HP=500000;
  const STATE_KEY="iid-demo-v2-state", PROFILE_KEY="iid-demo-profile";
  const ORIGINS=["HUMAN","BOT","ALIEN","GLITCH"];
  let hp=START_HP, lastDay=null, player=null, origin="HUMAN", pendingAction=null;
  const dialog=$("join-dialog");
  const fmt=n=>Math.max(0,Math.round(n)).toLocaleString("en-US");
  const utcDay=()=>new Date().toISOString().slice(0,10);
  function load(){
    try{
      const state=JSON.parse(localStorage.getItem(STATE_KEY)||"null");
      if(state && Number.isFinite(state.hp) && state.hp>=0 && state.hp<=MAX_HP)hp=Math.round(state.hp);
      if(state && typeof state.lastDay==="string" && /^\d{4}-\d{2}-\d{2}$/.test(state.lastDay))lastDay=state.lastDay;
      if(!state) {
        const legacy=localStorage.getItem("iid-demo-last-action");
        if(legacy && /^\d{4}-\d{2}-\d{2}$/.test(legacy))lastDay=legacy;
      }
      const saved=JSON.parse(localStorage.getItem(PROFILE_KEY)||"null");
      if(saved && /^[a-zA-Z0-9_]{3,18}$/.test(saved.nickname) && ORIGINS.includes(saved.origin)){
        player={nickname:saved.nickname,origin:saved.origin};
        origin=player.origin;
      }
    }catch(error){/* Browsers with blocked localStorage can still play a temporary demo. */}
  }
  function persist(){
    try{
      localStorage.setItem(STATE_KEY,JSON.stringify({hp,lastDay}));
      if(player)localStorage.setItem(PROFILE_KEY,JSON.stringify(player));
    }catch(error){/* Storage permission not required for a local preview. */}
  }
  function statusFor(n){
    if(n<=0)return {name:"DEAD",color:"#8a8f9d",stage:"dead",message:"THE INTERNET IS DEAD."};
    if(n<=250000)return {name:"NEAR DEATH",color:"#bf3654",stage:"danger",message:"DEATH IS GETTING CLOSER."};
    if(n<=500000)return {name:"CRITICAL",color:"#ff657d",stage:"critical",message:"THE INTERNET IS HALF DEAD."};
    if(n<=750000)return {name:"STABLE",color:"#d8c66b",stage:"stable",message:"THERE IS STILL HOPE."};
    return {name:"RECOVERING",color:"#72dfa6",stage:"recovering",message:"THE INTERNET IS HEALING."};
  }
  function render(){
    const pct=hp/MAX_HP*100, st=statusFor(hp);
    $("hp-label").textContent=fmt(hp);
    $("hp-fill").style.width=pct+"%";
    document.documentElement.style.setProperty("--hp-color",st.color);
    $("hp-progress").setAttribute("aria-valuenow",String(Math.round(pct)));
    $("hp-progress").setAttribute("aria-valuetext",pct.toFixed(2)+" percent remaining");
    $("hp-percent").textContent=pct.toFixed(1)+"% LIFE REMAINING";
    $("state-label").textContent="● "+st.name;
    $("heart-zone").dataset.stage=st.stage;
    $("story-title").textContent=st.message;
    if(player){
      $("player-caption").textContent=player.origin+" / "+player.nickname+" — LOCAL DEMO";
    }else{
      $("player-caption").textContent="CHOOSE YOUR IDENTITY. ROLL YOUR POWER. MAKE HISTORY.";
    }
  }
  // Local preview only: random values must move server-side before real voting.
  const randomInt=(min,max)=>min+Math.floor(Math.random()*(max-min+1));
  function rollPower(){
    const rarity=Math.random(),critical=Math.random();
    const base=rarity<.60?randomInt(0,500):rarity<.90?randomInt(501,2000):rarity<.99?randomInt(2001,10000):randomInt(10001,25000);
    const multiplier=critical<.01?3:critical<.05?2:1;
    return {base,multiplier,total:base*multiplier};
  }
  function showResult(title,message){
    $("result-title").textContent=title;
    $("result-text").textContent=message;
    $("result").hidden=false;
    $("result").scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function updateAvatars(){
    document.querySelectorAll("[data-origin]").forEach(button=>{
      button.setAttribute("aria-pressed",String(button.dataset.origin===origin));
    });
  }
  function openIdentity(){
    if(player){origin=player.origin;$("nickname").value=player.nickname;}
    updateAvatars();
    if(!dialog.open)dialog.showModal();
  }
  function act(action){
    if(action!=="HEAL" && action!=="KILL")return;
    if(!player){pendingAction=action;openIdentity();return;}
    if(lastDay===utcDay()){
      showResult("NEXT TURN TOMORROW_", "You already tried an action today (UTC). Use RESET DEMO to replay this local test. No global vote was sent.");
      return;
    }
    const roll=rollPower(),before=hp;
    hp=Math.max(0,Math.min(MAX_HP,hp+(action==="HEAL"?roll.total:-roll.total)));
    const applied=Math.abs(hp-before);
    lastDay=utcDay();
    persist();render();
    const heading=roll.multiplier===3?"SUPER CRITICAL ×3!":roll.multiplier===2?"CRITICAL ×2!":action+" ACTIVATED!";
    const suffix=applied!==roll.total?" (effective "+fmt(applied)+" HP after limit)":".";
    showResult(heading,player.origin+" "+player.nickname+" used "+action+": "+(action==="HEAL"?"+":"−")+fmt(roll.total)+" HP (base "+fmt(roll.base)+" ×"+roll.multiplier+")"+suffix+" LOCAL DEMO ONLY — no server vote.");
  }
  function reset(){
    hp=START_HP;lastDay=null;pendingAction=null;
    try{localStorage.removeItem("iid-demo-last-action");}catch(error){}
    persist();render();
    $("result").hidden=true;
    $("result-title").textContent="";
    $("result-text").textContent="";
    showResult("DEMO RESET!", "Local HP restored to 500,000. Today's local action unlocked. Your nickname is kept. No live data changed.");
  }
  function tick(){
    const remaining=86400000-(Date.now()%86400000);
    const secs=Math.ceil(remaining/1000);
    const parts=[Math.floor(secs/3600),Math.floor(secs%3600/60),secs%60];
    $("timer").textContent=parts.map(part=>String(part).padStart(2,"0")).join(":");
  }
  load();render();tick();
  setInterval(tick,1000);
  document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>act(button.dataset.action)));
  $("join-btn").addEventListener("click",()=>{pendingAction=null;openIdentity();});
  $("close-dialog").addEventListener("click",()=>{pendingAction=null;dialog.close();});
  $("reset-demo").addEventListener("click",reset);
  dialog.addEventListener("cancel",()=>{pendingAction=null;});
  document.querySelectorAll("[data-origin]").forEach(button=>button.addEventListener("click",()=>{
    origin=button.dataset.origin;updateAvatars();
  }));
  $("identity-form").addEventListener("submit",event=>{
    event.preventDefault();
    const nickname=$("nickname").value.trim();
    if(!/^[a-zA-Z0-9_]{3,18}$/.test(nickname)){
      $("nickname").setCustomValidity("Use 3–18 letters, digits, or underscores.");
      $("nickname").reportValidity();return;
    }
    $("nickname").setCustomValidity("");
    player={nickname,origin};persist();render();dialog.close();
    const next=pendingAction;pendingAction=null;
    if(next)act(next);
    else showResult("WELCOME, "+nickname.toUpperCase()+"!", "Your "+origin+" identity is saved on this device. Choose HEAL or KILL to try the local demo.");
  });
  $("nickname").addEventListener("input",()=>$("nickname").setCustomValidity(""));
})();
