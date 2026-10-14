/* V3 account flow for THE INTERNET IS DYING.
   All arena rolls are LOCAL DEMOS, not real votes or purchases. */
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
 const {data,error}=await sb.from("iid_profiles").select("user_id,nickname,origin").eq("user_id",id).maybeSingle();
 if(error)throw error;
 return data;
}
async function route(u){next((await profile(u.id))?"./arena.html":"./onboarding.html");}

if(page==="landing"){
 $("join-btn").addEventListener("click",()=>{
  // Login page handles returning users; never block landing CTA on SDK/network.
  next("./auth.html");
 });
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
   const {error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:new URL("./onboarding.html",location.href).href}});
   if(error)throw error;
  }catch(e){show("Google sign-in error: "+e.message,"error");btn.disabled=false;}
 });
 $("email-form").addEventListener("submit",async ev=>{
  ev.preventDefault();if(!$("email").reportValidity())return;
  const btn=$("email-send");btn.disabled=true;show("Sending email...");
  try{
   const {error}=await sb.auth.signInWithOtp({email:$("email").value.trim(),options:{emailRedirectTo:new URL("./onboarding.html",location.href).href}});
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
  let origin="HUMAN";
  document.querySelectorAll("[data-origin]").forEach(btn=>btn.addEventListener("click",()=>{
   origin=btn.dataset.origin;
   document.querySelectorAll("[data-origin]").forEach(item=>item.setAttribute("aria-pressed",String(item.dataset.origin===origin)));
  }));
  form.addEventListener("submit",async ev=>{
   ev.preventDefault();
   const nickname=$("nickname").value.trim();
   if(!/^[A-Za-z0-9_]{3,18}$/.test(nickname)){show("Use 3–18 letters, numbers or underscores.","error");return;}
   const btn=$("create-profile");btn.disabled=true;show("Saving identity...");
   try{
    const {error}=await sb.from("iid_profiles").insert({user_id:u.id,nickname,origin});
    if(error){
     if(error.code==="23505"){
      if(await profile(u.id)){next("./arena.html");return;}
      throw Error("Nickname already taken. Try another.");
     }
     throw error;
    }
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
  $("arena-identity").textContent=p.origin+" / "+p.nickname;
  show("SIGNED IN • HEAL/KILL BELOW ARE LOCAL DEMOS, NOT GLOBAL VOTES.","success");
  $("signout").addEventListener("click",async()=>{
   $("signout").disabled=true;
   const {error}=await sb.auth.signOut();
   if(error){show("Sign-out error: "+error.message,"error");$("signout").disabled=false;}
   else next("./index.html");
  });
  demo(u.id,p);
 }catch(e){show("Could not open Arena: "+e.message,"error");}
}
function demo(id,p){
 // UI-only V5.1 mini-game; authenticated identity and profile logic stay unchanged.
 import("./tap-battle.js?v=1").then(({initTapBattle})=>{
  initTapBattle({userId:id,profile:p});
 }).catch(error=>{
  show("TAP BATTLE COULD NOT LOAD: "+(error?.message||"Unknown error")+". Refresh the Arena.","error");
 });
}
})();
