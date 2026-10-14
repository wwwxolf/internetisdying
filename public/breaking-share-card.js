/* BREAKING INTERNET — fixed pixel design, fresh authenticated world ledger snapshot.
   A shared PNG is a frozen snapshot; the invite URL opens the live game. */
export const GAME_URL="https://internetisdying.wwwxolf.workers.dev/";
export const IMAGE_WIDTH=1080,IMAGE_HEIGHT=1350,MAX_WORLD_HP=1000000;

export function worldStage(hp){
  const v=Number(hp);
  if(!Number.isFinite(v)||v<0||v>MAX_WORLD_HP)throw Error("Invalid world health");
  return v===0?"DEAD":v<=250000?"NEAR DEATH":v<=500000?"CRITICAL":
    v<=750000?"STABLE":"RECOVERING";
}
export function headlineFor(data){
  if(data.net_hp>0)return ["THE INTERNET","FOUGHT BACK_"];
  if(data.net_hp<0)return ["THE INTERNET","TOOK A HIT_"];
  if(Number(data.heal_battles)+Number(data.kill_battles)+Number(data.decay_pulses)+Number(data.chaos_events)>0)
    return ["THE INTERNET","HELD THE LINE_"];
  return ["THE INTERNET","STAYED QUIET_"];
}
export function validateSnapshot(data){
  if(!data||data.source!=="SERVER_LEDGER"||!Number.isFinite(Date.parse(data.snapshot_at))||
     !Number.isFinite(Date.parse(data.from)))throw Error("Unverified world snapshot");
  const keys=["world_hp","heal_hp","kill_hp","decay_hp","chaos_hp","net_hp",
    "heal_battles","kill_battles","decay_pulses","chaos_events"];
  for(const k of keys)if(!Number.isSafeInteger(Number(data[k])))throw Error("Invalid server data: "+k);
  const hp=Number(data.world_hp);
  worldStage(hp);
  if(["heal_hp","kill_hp","decay_hp"].some(k=>Number(data[k])<0))
    throw Error("Invalid applied impact");
  if(Number(data.net_hp)!==Number(data.heal_hp)-Number(data.kill_hp)-Number(data.decay_hp)+Number(data.chaos_hp))
    throw Error("Server impact total does not balance");
  return data;
}
const C={bg:"#081322",panel:"#101e31",panel2:"#15283e",border:"#4b7191",muted:"#b1cce2",
  white:"#f4f1e9",green:"#76e4ad",pink:"#ff617f",gold:"#f3d17b",blue:"#80badb"};
const fmt=n=>Math.abs(Number(n)).toLocaleString("en-US");
const sign=(v,zero=false)=>(v>0?"+":v<0?"-":zero?"":"")+fmt(v)+" HP";
const px=(ctx,x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function frame(ctx,x,y,w,h,fill=C.panel){
 px(ctx,x,y,w,h,C.border);px(ctx,x+5,y+5,w-10,h-10,fill);
 // Pixel clipped corners, not rounded cards.
 px(ctx,x,y,14,14,C.bg);px(ctx,x+w-14,y,14,14,C.bg);
 px(ctx,x,y+h-14,14,14,C.bg);px(ctx,x+w-14,y+h-14,14,14,C.bg);
 px(ctx,x+14,y+14,5,5,C.blue);px(ctx,x+w-19,y+h-19,5,5,C.blue);
}
function pixelText(ctx,label,x,y,size=24,color=C.white,align="left"){
 ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline="alphabetic";
 ctx.font=size+'px "Press Start 2P",monospace';
 ctx.fillText(String(label),x,y);
}
function fitText(ctx,label,x,y,maxWidth,size,color,minSize=15){
  let fontsize=size;
  while(fontsize>minSize){
    ctx.font=fontsize+'px "Press Start 2P",monospace';
    if(ctx.measureText(String(label)).width<=maxWidth)break;
    fontsize-=1;
  }
  pixelText(ctx,label,x,y,fontsize,color);
}
function symbol(ctx,kind,x,y,color){
  px(ctx,x,y,76,76,C.bg);px(ctx,x+4,y+4,68,68,C.border);px(ctx,x+9,y+9,58,58,C.panel);
  if(kind==="save"){
    px(ctx,x+31,y+19,14,40,color);px(ctx,x+18,y+32,40,14,color);
  }else if(kind==="kill"){
    px(ctx,x+20,y+18,36,35,color);px(ctx,x+14,y+28,10,20,color);
    px(ctx,x+52,y+28,10,20,color);px(ctx,x+28,y+33,7,8,C.bg);
    px(ctx,x+42,y+33,7,8,C.bg);px(ctx,x+26,y+52,24,8,color);
  }else if(kind==="decay"){
    px(ctx,x+18,y+15,40,7,color);px(ctx,x+18,y+54,40,7,color);
    px(ctx,x+25,y+22,26,7,color);px(ctx,x+32,y+30,12,22,color);
    px(ctx,x+25,y+47,26,7,color);
  }else{
    px(ctx,x+33,y+14,13,19,color);px(ctx,x+24,y+26,31,20,color);
    px(ctx,x+19,y+42,40,16,color);px(ctx,x+34,y+43,11,15,C.bg);
  }
}
function stat(ctx,x,y,w,h,label,value,color,kind){
 frame(ctx,x,y,w,h);
 symbol(ctx,kind,x+22,y+37,color);
 pixelText(ctx,label,x+120,y+67,22,C.muted);
 fitText(ctx,value,x+120,y+130,w-142,38,color,17);
}
function healthBar(ctx,hp,x,y,w,h){
 px(ctx,x,y,w,h,C.border);px(ctx,x+5,y+5,w-10,h-10,C.bg);
 const steps=20,innerW=w-24,gap=5,seg=(innerW-(steps-1)*gap)/steps;
 const lit=Math.round(steps*hp/MAX_WORLD_HP);
 for(let i=0;i<steps;i++)px(ctx,x+12+i*(seg+gap),y+13,seg,h-26,
    i<lit?C.pink:"#1b3046");
}
async function imageOrNull(url) {
 try{
  const image=new Image();
  image.decoding="async";
  const promise=new Promise((resolve,reject)=>{image.onload=()=>resolve(image);image.onerror=reject;});
  image.src=url;return await promise;
 }catch{return null;}
}
function dateUTC(d){
 return new Date(d).toISOString().replace("T"," ").slice(0,16)+" UTC";
}
export async function renderBreakingCard(data){
 validateSnapshot(data);
 if(document.fonts?.load) {
  try{await document.fonts.load('32px "Press Start 2P"');}catch{/* system pixel fallback */}
 }
 const canvas=document.createElement("canvas");
 canvas.width=IMAGE_WIDTH;canvas.height=IMAGE_HEIGHT;
 const ctx=canvas.getContext("2d",{alpha:false});
 if(!ctx)throw Error("Canvas rendering unavailable");
 ctx.imageSmoothingEnabled=false;
 px(ctx,0,0,IMAGE_WIDTH,IMAGE_HEIGHT,C.bg);
 // Subtle grid: no costly gradients or image noise.
 for(let y=10;y<IMAGE_HEIGHT;y+=17)
   for(let x=12;x<IMAGE_WIDTH;x+=17)px(ctx,x,y,3,3,"#17344e");
 frame(ctx,30,28,1020,66,C.bg);
 pixelText(ctx,"WORLD_001 // INTERNET CHAOS",55,71,23,C.muted);
 for(let i=0;i<3;i++)px(ctx,950+i*25,52,17,17,i===2?C.pink:"#2c5276");
 pixelText(ctx,"WHILE YOU WERE GONE...",65,174,24,C.muted);
 pixelText(ctx,"BREAKING",62,280,59,C.pink);
 pixelText(ctx,"INTERNET_",62,359,53,C.white);
 const lines=headlineFor(data);
 fitText(ctx,lines[0],65,494,625,40,data.net_hp>=0?C.green:C.pink,22);
 fitText(ctx,lines[1],65,549,625,40,data.net_hp>=0?C.green:C.pink,22);
 // Reuse the game's real pixel planet asset, not a generic emoji or external image.
 const planet=await imageOrNull("./assets/dying-internet-core.svg");
 if(planet)ctx.drawImage(planet,712,170,280,280);
 else{
   px(ctx,762,227,160,160,C.blue);px(ctx,792,258,100,102,C.bg);
   px(ctx,820,287,50,46,C.green);
 }
 px(ctx,712,423,255,7,C.pink);px(ctx,765,452,172,6,C.blue);
 pixelText(ctx,"SERVER SNAPSHOT",62,619,17,C.gold);
 pixelText(ctx,dateUTC(data.snapshot_at),350,619,17,C.muted);

 stat(ctx,35,660,497,158,"WORLD SAVE","+"+fmt(data.heal_hp)+" HP",C.green,"save");
 stat(ctx,548,660,497,158,"WORLD KILL","-"+fmt(data.kill_hp)+" HP",C.pink,"kill");
 stat(ctx,35,838,497,158,"WORLD DECAY","-"+fmt(data.decay_hp)+" HP",C.pink,"decay");
 stat(ctx,548,838,497,158,"DAILY CHAOS",sign(data.chaos_hp),C.gold,"chaos");

 frame(ctx,35,1017,1010,229,C.panel2);
 pixelText(ctx,"NET WORLD CHANGE",62,1070,22,C.muted);
 const netColor=data.net_hp>0?C.green:data.net_hp<0?C.pink:C.gold;
 fitText(ctx,sign(data.net_hp,true),62,1168,480,48,netColor,22);
 px(ctx,546,1041,5,178,C.border);
 pixelText(ctx,"WORLD HEALTH",576,1070,22,C.muted);
 healthBar(ctx,Number(data.world_hp),575,1095,443,55);
 pixelText(ctx,"● "+worldStage(data.world_hp),578,1195,24,C.pink);

 px(ctx,35,1280,1010,5,C.border);
 pixelText(ctx,"SERVER VERIFIED // SNAPSHOT",43,1321,16,C.muted);
 pixelText(ctx,"THE INTERNET IS DYING_",1030,1321,16,C.white,"right");
 return new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):reject(Error("PNG generation failed")),"image/png");
 });
}
export function filenameFor(data){
 return "breaking-internet-"+new Date(data.snapshot_at).toISOString().replace(/[:.]/g,"-")+".png";
}
export function shareCaption(data,inviteUrl=GAME_URL){
 validateSnapshot(data);
 // One short global invite across native image shares, WA links and copy fallback.
 // The PNG already shows the current world stats; avoid repeating them here.
 return "🚨 THE INTERNET IS DYING.\n\n"+
   "Will you SAVE it or KILL it? 💀\n\n"+
   "🌐 JOIN THE CHAOS:\n"+inviteUrl;
}
