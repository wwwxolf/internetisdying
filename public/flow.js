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
let sb=null;
if(ready){
 try{const m=await import("https://esm.sh/@supabase/supabase-js@2?bundle");sb=m.createClient(conf.supabaseUrl,conf.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});}
 catch(e){show("Could not load authentication library. Check your internet connection.","error");}
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
 $("join-btn").addEventListener("click",async()=>{
  const btn=$("join-btn");btn.disabled=true;
  try{const u=await user();if(u)await route(u);else next("./auth.html");}
  catch(e){show("Couldn't check your profile. Please try again.","error");btn.disabled=false;}
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
  show("REGISTRATION IS NOT ACTIVE YET. A dedicated Supabase project is required. No emails are being collected.","warning");return;
 }
 try{const u=await user();if(u){await route(u);return;}show("Sign in with Google or email.");}
 catch(e){show("Sign-in setup error: "+e.message,"error");}
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
 const key="iid-arena-demo-v3:"+id;let hp=500000,last=null;
 try{const saved=JSON.parse(localStorage.getItem(key)||"null");if(saved&&Number.isInteger(saved.hp)&&saved.hp>=0&&saved.hp<=1000000)hp=saved.hp;if(saved&&typeof saved.last==="string")last=saved.last;}catch(e){}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify({hp,last}));}catch(e){}};
 const render=()=>{
  const pct=hp/10000;
  const color=hp<=0?"#8a8f9d":hp<=250000?"#bf3654":hp<=500000?"#ff657d":hp<=750000?"#d8c66b":"#72dfa6";
  const status=hp<=0?"DEAD":hp<=250000?"NEAR DEATH":hp<=500000?"CRITICAL":hp<=750000?"STABLE":"RECOVERING";
  $("arena-hp").textContent=format(hp);
  $("arena-fill").style.width=pct+"%";
  $("arena-fill").style.background="repeating-linear-gradient(90deg,"+color+" 0 16px,transparent 16px 19px)";
  $("arena-status").textContent="● "+status;$("arena-status").style.color=color;
  $("arena-percent").textContent=pct.toFixed(1)+"% LIFE REMAINING";
  $("arena-progress").setAttribute("aria-valuenow",String(Math.round(pct)));
  $("heart-zone").dataset.stage=hp<=0?"dead":hp<=250000?"danger":"critical";
 };
 const result=(heading,text)=>{
  $("arena-result-title").textContent=heading;$("arena-result-text").textContent=text;
  $("arena-result").hidden=false;$("arena-result").scrollIntoView({behavior:"smooth",block:"nearest"});
 };
 const rand=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
 const roll=()=>{
  const r=Math.random(),c=Math.random();
  const base=r<.60?rand(0,500):r<.90?rand(501,2000):r<.99?rand(2001,10000):rand(10001,25000);
  const multiplier=c<.01?3:c<.05?2:1;
  return {base,multiplier,total:base*multiplier};
 };
 document.querySelectorAll("[data-arena-action]").forEach(btn=>btn.addEventListener("click",()=>{
  if(last===utcDay()){result("NEXT TURN TOMORROW_","Already used today's local demo action. Use RESET LOCAL DEMO to try again. No global vote was made.");return;}
  const action=btn.dataset.arenaAction,r=roll(),before=hp;
  hp=Math.max(0,Math.min(1000000,hp+(action==="HEAL"?r.total:-r.total)));
  last=utcDay();save();render();
  const heading=r.multiplier===3?"SUPER CRITICAL ×3!":r.multiplier===2?"CRITICAL ×2!":action+" ACTIVATED!";
  result(heading,p.nickname+" "+action+": "+(action==="HEAL"?"+":"−")+format(r.total)+" HP (base "+format(r.base)+" ×"+r.multiplier+"). Applied "+format(Math.abs(hp-before))+" HP. LOCAL DEMO ONLY.");
 }));
 $("arena-reset").addEventListener("click",()=>{hp=500000;last=null;save();render();result("LOCAL DEMO RESET_","HP restored to 500,000. No actual global data changed.");});
 render();
}
})();
