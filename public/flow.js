/* V3 account flow for THE INTERNET IS DYING.
   All arena rolls are LOCAL DEMOS, not real votes or purchases. */
import {COUNTRIES,COUNTRY_CODES} from "./countries.js";
import {FLAG_COLORS,renderCountryBadge} from "./identity-flag.js";
(async()=>{
"use strict";
const $=id=>document.getElementById(id);
const page=document.body.dataset.page||"landing";
const conf=window.IID_CONFIG||{};
const ready=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(conf.supabaseUrl||"")&&(conf.supabasePublishableKey||"").length>=16;
const next=name=>location.assign(new URL(name,location.href).href);
const show=(msg,type="note")=>{const node=$("flow-status")||$("landing-status");if(node){node.textContent=msg;node.dataset.kind=type;}};
const format=n=>Math.round(Math.max(0,n)).toLocaleString("en-US");
const utcDay=()=>new Date().toISOString().slice(0,10);
let sb=null, sdkLoadError=null;
if(ready && page!=="landing"){
 if(page!=="landing")show("Connecting to Google Sign-In...");
 try{
  // Use the official browser UMD SDK loaded by the HTML pages first.
  // The fallback is for browsers that block one CDN but permit another.
  let maker=window.supabase?.createClient;
  if(typeof maker!=="function"){
   const mod=await Promise.race([
    import("https://esm.sh/@supabase/supabase-js@2?bundle"),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error("Supabase SDK download timed out")),8000))
   ]);
   maker=mod.createClient;
  }
  if(typeof maker!=="function")throw new Error("Supabase SDK did not initialize");
  sb=maker(conf.supabaseUrl,conf.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 }catch(e){
  sdkLoadError=e.message||"unknown error";
  show("LOGIN FAILED TO LOAD: Browser blocked the sign-in library or connection. Try regular Chrome and refresh. Details: "+sdkLoadError,"error");
 }
}else if(page!=="landing"){
 show("LOGIN CONFIGURATION MISSING. Please refresh and contact support.","error");
}
async function user(){
 if(!sb)return null;
 const {data,error}=await sb.auth.getUser();
 if(error)return null;
 return data?.user||null;
}
async function profile(id){
 const {data,error}=await sb.from("iid_profiles").select("user_id,nickname,origin,country_code,custom_flag").eq("user_id",id).maybeSingle();
 if(error)throw error;
 return data;
}
const avatarCodes=["HUMAN","BOT_CHICKEN","CHICKEN_MUTANT","EGG_GLITCH"];
const avatarFromUrl=new URLSearchParams(location.search||"").get("avatar");
const requestedAvatar=avatarCodes.includes(avatarFromUrl)?avatarFromUrl:null;
const onboardingDest="./onboarding.html"+(requestedAvatar?"?avatar="+requestedAvatar:"");
async function route(u){next((await profile(u.id))?"./arena.html":onboardingDest);}

if(page==="landing"){
 // The native ENTER WORLD link opens the skippable prologue first.
 // Do not override its href: returning users bypass the intro on that page.
 const timer=$("timer");
 if(timer){
  const tick=()=>{
   const s=Math.ceil((86400000-Date.now()%86400000)/1000);
   timer.textContent=[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,"0")).join(":");
  };
  tick();setInterval(tick,1000);
 }
 return;
}
if(page==="auth"){
 const controls=$("auth-controls");
 controls.hidden=false;
 if(!sb){
  $("google-login").disabled=true;$("email-send").disabled=true;
  show("GOOGLE LOGIN UNAVAILABLE: "+(sdkLoadError||"Authentication SDK unavailable")+". Open in Chrome and refresh.","error");return;
 }
 const googleReady=conf.googleAuthReady===true;
 const emailReady=conf.emailAuthReady===true;
 $("google-login").disabled=!googleReady;
 $("email-send").disabled=!emailReady;
 $("email").disabled=!emailReady;
 if(!googleReady&&!emailReady){
  show("DATABASE CONNECTED. SIGN-IN NOT READY: configure Auth redirect URLs, production email delivery and Google OAuth, then enable providers. No emails are being collected yet.","warning");return;
 }
 show(googleReady&&!emailReady?"GOOGLE SIGN-IN IS READY TO TEST. Email sign-in is not available yet.":"Choose your available sign-in method.","note");
 // Register click handlers BEFORE checking the current user: a slow network
 // must never leave an apparently enabled button with no click listener.
 $("google-login").addEventListener("click",async()=>{
  const btn=$("google-login");btn.disabled=true;show("Redirecting to Google...");
  try{
   const {error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:new URL(onboardingDest,location.href).href}});
   if(error)throw error;
  }catch(e){show("Google sign-in error: "+e.message,"error");btn.disabled=false;}
 });
 $("email-form").addEventListener("submit",async ev=>{
  ev.preventDefault();if(!$("email").reportValidity())return;
  const btn=$("email-send");btn.disabled=true;show("Sending email...");
  try{
   const {error}=await sb.auth.signInWithOtp({email:$("email").value.trim(),options:{emailRedirectTo:new URL(onboardingDest,location.href).href}});
   if(error)throw error;
   $("otp-form").hidden=false;show("Check your inbox for a code or sign-in link.","success");
  }catch(e){show("Email sign-in error: "+e.message,"error");}
  finally{btn.disabled=false;}
 });
 $("otp-form").addEventListener("submit",async ev=>{
  ev.preventDefault();
  const token=$("otp").value.trim();
  if(!/^[0-9]{6}$/.test(token)){show("Enter a six-digit code.","error");return;}
  show("Verifying code...");
  try{
   const {data,error}=await sb.auth.verifyOtp({email:$("email").value.trim(),token,type:"email"});
   if(error)throw error;
   if(!data?.user)throw Error("No user returned.");
   await route(data.user);
  }catch(e){show("Verification error: "+e.message,"error");}
 });
 // Background session detection must not block button interaction.
 void (async()=>{
  try{const u=await user();if(u)await route(u);}
  catch(e){show("Session check failed. You can still try Google Sign-In.","warning");}
 })();
 return;
}
if(page==="onboarding"){
 if(!sb){show("Account setup unavailable until Supabase is configured.","warning");return;}
 try{
  const u=await user();if(!u){next("./auth.html");return;}
  if(await profile(u.id)){next("./arena.html");return;}
  const form=$("profile-form");form.hidden=false;show("Verified account. Create your one-time identity.","success");
  const originButtons=[...document.querySelectorAll("[data-origin]")];
  const avatarStoreKey="iid_world001_avatar_choice_v1";
  let savedChoice=null;
  try{savedChoice=sessionStorage.getItem(avatarStoreKey);}catch{/* Private browsing fallback: select manually. */}
  let origin=avatarCodes.includes(requestedAvatar)?requestedAvatar:(avatarCodes.includes(savedChoice)?savedChoice:"HUMAN");
  const selectOrigin=(choice)=>{
   origin=choice;
   originButtons.forEach(item=>item.setAttribute("aria-pressed",String(item.dataset.origin===choice)));
   try{sessionStorage.setItem(avatarStoreKey,choice);}catch{}
  };
  originButtons.forEach(btn=>btn.addEventListener("click",()=>selectOrigin(btn.dataset.origin)));
  selectOrigin(origin);
  const search=$("country-search"), countryCode=$("country-code"), results=$("country-results"), selected=$("country-selected");
  const flagPanel=$("custom-flag-panel"), grid=$("flag-grid"), palette=$("flag-palette");
  const colors=FLAG_COLORS, pixels=Array(96).fill(0);
  let paintColor=1;
  colors.forEach((color,i)=>{const swatch=document.createElement("button");swatch.type="button";swatch.className="flag-swatch";swatch.style.setProperty("--swatch",color);swatch.setAttribute("aria-label",`Color ${i+1}`);swatch.setAttribute("aria-pressed",String(i===paintColor));swatch.addEventListener("click",()=>{paintColor=i;palette.querySelectorAll("button").forEach((button,n)=>button.setAttribute("aria-pressed",String(n===i)));});palette.append(swatch);});
  const renderGrid=()=>{grid.replaceChildren();pixels.forEach((value,i)=>{const cell=document.createElement("button");cell.type="button";cell.className="flag-pixel";cell.style.setProperty("--pixel",colors[value]);cell.setAttribute("role","gridcell");cell.setAttribute("aria-label",`Pixel ${i+1}`);cell.addEventListener("click",()=>{pixels[i]=paintColor;cell.style.setProperty("--pixel",colors[paintColor]);});grid.append(cell);});};
  renderGrid();
  const packFlag=()=>Array.from({length:48},(_,i)=>((pixels[i*2]<<2)|pixels[i*2+1]).toString(16).toUpperCase()).join("");
  const renderCountries=(query="")=>{
   const matches=COUNTRIES.filter(c=>(c.name+" "+c.code).toLowerCase().includes(query.trim().toLowerCase())).slice(0,30);
   results.replaceChildren();
   matches.forEach(c=>{const option=document.createElement("button");option.type="button";option.className="country-option";option.setAttribute("role","option");option.innerHTML=`<img alt="" src="https://flagcdn.com/w40/${c.alpha2.toLowerCase()}.png"><span>${c.name}</span><b>${c.code}</b>`;option.addEventListener("click",()=>{countryCode.value=c.code;search.value=c.name;selected.innerHTML=`<img alt="" src="https://flagcdn.com/w40/${c.alpha2.toLowerCase()}.png"><b>${c.code}</b> selected`;results.hidden=true;search.setAttribute("aria-expanded","false");flagPanel.hidden=true;});results.append(option);});
   const other=document.createElement("button");other.type="button";other.className="country-option";other.setAttribute("role","option");other.innerHTML="<span>OTHERS</span><b>OTH</b>";other.addEventListener("click",()=>{countryCode.value="OTH";search.value="OTHERS";selected.textContent="OTH selected · Create your custom flag below.";results.hidden=true;search.setAttribute("aria-expanded","false");flagPanel.hidden=false;});results.append(other);
  };
  search.addEventListener("input",()=>{countryCode.value="";renderCountries(search.value);results.hidden=false;search.setAttribute("aria-expanded","true");});
  search.addEventListener("focus",()=>{renderCountries(search.value);results.hidden=false;search.setAttribute("aria-expanded","true");});
  form.addEventListener("submit",async ev=>{
   ev.preventDefault();
   const nickname=$("nickname").value.trim();
   if(!/^[A-Za-z0-9_]{3,18}$/.test(nickname)){show("Use 3–18 letters, numbers or underscores.","error");return;}
   const code=countryCode.value;
   if(!COUNTRY_CODES.has(code)&&code!=="OTH"){show("Choose a country or territory from the list.","error");search.focus();return;}
   const customFlag=code==="OTH"?packFlag():null;
   if(code==="OTH"&&!/^[0-9A-F]{48}$/.test(customFlag)){show("Custom flag is invalid. Please edit the grid again.","error");return;}
   const btn=$("create-profile");btn.disabled=true;show("Saving identity...");
   try{
    const {error}=await sb.from("iid_profiles").insert({user_id:u.id,nickname,origin,country_code:code,custom_flag:customFlag});
    if(error){
     if(error.code==="23505"){
      if(await profile(u.id)){next("./arena.html");return;}
      throw Error("Nickname already taken. Try another.");
     }
     throw error;
    }
    try{sessionStorage.removeItem(avatarStoreKey);}catch{}
    next("./arena.html");
   }catch(e){show("Could not save identity: "+e.message,"error");btn.disabled=false;}
  });
 }catch(e){show("Account setup error: "+e.message,"error");}
 return;
}
if(page==="arena"){
 if(!sb){show("Arena requires a verified game account. Authentication is not yet configured.","warning");return;}
 try{
  const u=await user();if(!u){next("./auth.html");return;}
  const p=await profile(u.id);if(!p){next("./onboarding.html");return;}
  $("arena-content").hidden=false;
  const originLabels={HUMAN:"HUMAN",BOT_CHICKEN:"BOT CHICKEN",CHICKEN_MUTANT:"CHICKEN MUTANT",EGG_GLITCH:"EGG GLITCH",BOT:"BOT",ALIEN:"ALIEN",GLITCH:"GLITCH"};
  $("arena-identity").textContent=(originLabels[p.origin]||p.origin)+" / "+p.nickname;
  renderCountryBadge($("arena-country"),p);
  // Character sprites are cosmetic until avatar abilities are designed.
  // Legacy profile origins are still supported without changing stored history.
  const originSprite={HUMAN:"world001-human",BOT_CHICKEN:"world001-bot-chicken",CHICKEN_MUTANT:"world001-chicken-mutant",EGG_GLITCH:"world001-egg-glitch",BOT:"bot",ALIEN:"alien",GLITCH:"glitch"};
  $("arena-origin-avatar").src="./assets/avatar-"+(originSprite[p.origin]||"world001-human")+".svg";
  const demoMode=document.body.dataset.battleMode==="demo";
  show(demoMode?"LOCAL DEMO • NO GLOBAL VOTES":"CONNECTING TO GLOBAL BATTLE ENGINE…","success");
  $("signout").addEventListener("click",async()=>{
   $("signout").disabled=true;
   const {error}=await sb.auth.signOut();
   if(error){show("Sign-out error: "+error.message,"error");$("signout").disabled=false;}
   else next("./index.html");
  });
  if(demoMode)demo(u.id,p);
  else {
   const {initGlobalBattle}=await import("./global-battle.js?v=13");
   await initGlobalBattle({sb});
   // Private controls initialize only after verified Google login and profile.
   void import("./developer-mode.js?v=1")
     .then(({initDeveloperMode})=>initDeveloperMode({sb}))
     .catch(()=>{});
   // Verified return brief is independent from Tap Battle and NEXT CHAOS.
   void import("./world-return.js?v=8")
     .then(({initWorldReturn})=>initWorldReturn({sb,nickname:p.nickname}))
     .catch(err=>console.warn("WORLD RETURN LOAD FAILED",err));
   // Read-only Hall of Fame is isolated from battle gameplay, auth and timers.
   void import("./hall-of-fame.js?v=4")
     .then(({initHallOfFame})=>initHallOfFame({sb}))
     .catch(err=>console.warn("HALL OF FAME LOAD FAILED",err));
   // NEXT CHAOS reads server-only votes; failure never blocks the battle arena.
   void import("./daily-chaos.js?v=4").then(({initDailyChaos})=>initDailyChaos({sb})).catch(e=>show("DAILY CHAOS PREVIEW COULD NOT LOAD: "+e.message,"warning"));
  }
 }catch(e){show("Could not open Arena: "+e.message,"error");}
}
function demo(id,p){
 // UI-only V5.1 mini-game; authenticated identity and profile logic stay unchanged.
 import("./tap-battle.js?v=3").then(({initTapBattle})=>{
  initTapBattle({userId:id,profile:p});
 }).catch(error=>{
  show("TAP BATTLE COULD NOT LOAD: "+(error?.message||"Unknown error")+". Refresh the Arena.","error");
 });
}
})();
