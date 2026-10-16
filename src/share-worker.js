import {validateV4Share,v4ToArtFields,v4ShareStory,V4_SHARE_LABELS} from "../public/v4-share-data.js";
import {serveV4Summary} from "./v4-summary.js";
import {shareStory,SHARE_LABELS} from "../public/share-story.js";
import {serveWarMomentum} from "./war-momentum.js";
/* Share link OG renderer. Existing static site routes remain unchanged. */
const SITE="https://internetisdying.wwwxolf.workers.dev";
const DB="https://wywrahaqpocueddxmjjq.supabase.co";
const KEY="sb_publishable_F8_CrtwDngDwWJ_Pda8oUw_-vMMOlYh";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const W=600,H=750;
const C={bg:[8,19,34],panel:[17,30,49],border:[80,112,151],mute:[171,196,222],
white:[245,243,236],green:[115,227,167],pink:[255,98,126],gold:[247,210,120],blue:[71,176,215]};
export const healthStage=hp=>hp===0?"DEAD":hp<=250000?"NEAR DEATH":hp<=500000?"CRITICAL":hp<=750000?"STABLE":"RECOVERING";
export const worldHeadline=d=>shareStory(d).headline.join(" ");
function verify(d){
 if(!d||d.source!=="SERVER_LEDGER"||
    !Number.isFinite(Date.parse(d.snapshot_at))||!Number.isFinite(Date.parse(d.from)))
    throw Error("Unverified report");
 for(const k of ["world_hp","heal_hp","kill_hp","decay_hp","chaos_hp","net_hp",
   "heal_battles","kill_battles","decay_pulses","chaos_events"]){
  if(d[k]===undefined||d[k]===null||!Number.isSafeInteger(Number(d[k])))
    throw Error("Invalid "+k);
 }
 if(d.world_hp<0||d.world_hp>1000000||
   d.heal_hp<0||d.kill_hp<0||d.decay_hp<0||
   d.net_hp!==d.heal_hp-d.kill_hp-d.decay_hp+d.chaos_hp)
    throw Error("Invalid impact");
 return d;
}
async function readCard(id,fetcher=fetch){
 const response=await fetcher(DB+"/rest/v1/rpc/iid_public_share_card",{
  method:"POST",headers:{"apikey":KEY,"content-type":"application/json"},
  body:JSON.stringify({p_id:id}),signal:AbortSignal.timeout(5500)
 });
 if(!response.ok)throw Error("Snapshot service unavailable");
 const data=await response.json();return data?verify(data):null;
}
async function readV4Card(id,fetcher=fetch){
 const response=await fetcher(DB+"/rest/v1/rpc/iid_v4_public_share_card",{
  method:"POST",headers:{"apikey":KEY,"content-type":"application/json"},
  body:JSON.stringify({p_id:id}),signal:AbortSignal.timeout(5500)
 });
 if(!response.ok)throw Error("V4 snapshot service unavailable");
 const data=await response.json();
 return data?validateV4Share(data):null;
}
const font={
A:["01110","10001","10001","11111","10001","10001","10001"],
B:["11110","10001","10001","11110","10001","10001","11110"],
C:["01111","10000","10000","10000","10000","10000","01111"],
D:["11110","10001","10001","10001","10001","10001","11110"],
E:["11111","10000","10000","11110","10000","10000","11111"],
F:["11111","10000","10000","11110","10000","10000","10000"],
G:["01111","10000","10000","10111","10001","10001","01111"],
H:["10001","10001","10001","11111","10001","10001","10001"],
I:["11111","00100","00100","00100","00100","00100","11111"],
J:["00111","00010","00010","00010","10010","10010","01100"],
K:["10001","10010","10100","11000","10100","10010","10001"],
L:["10000","10000","10000","10000","10000","10000","11111"],
M:["10001","11011","10101","10101","10001","10001","10001"],
N:["10001","11001","10101","10011","10001","10001","10001"],
O:["01110","10001","10001","10001","10001","10001","01110"],
P:["11110","10001","10001","11110","10000","10000","10000"],
Q:["01110","10001","10001","10001","10101","10010","01101"],
R:["11110","10001","10001","11110","10100","10010","10001"],
S:["01111","10000","10000","01110","00001","00001","11110"],
T:["11111","00100","00100","00100","00100","00100","00100"],
U:["10001","10001","10001","10001","10001","10001","01110"],
V:["10001","10001","10001","10001","10001","01010","00100"],
W:["10001","10001","10001","10101","10101","10101","01010"],
X:["10001","10001","01010","00100","01010","10001","10001"],
Y:["10001","10001","01010","00100","00100","00100","00100"],
Z:["11111","00001","00010","00100","01000","10000","11111"],
0:["01110","10001","10011","10101","11001","10001","01110"],
1:["00100","01100","00100","00100","00100","00100","01110"],
2:["01110","10001","00001","00010","00100","01000","11111"],
3:["11110","00001","00001","01110","00001","00001","11110"],
4:["00010","00110","01010","10010","11111","00010","00010"],
5:["11111","10000","10000","11110","00001","00001","11110"],
6:["01111","10000","10000","11110","10001","10001","01110"],
7:["11111","00001","00010","00100","01000","01000","01000"],
8:["01110","10001","10001","01110","10001","10001","01110"],
9:["01110","10001","10001","01111","00001","00001","11110"],
" ":["00000","00000","00000","00000","00000","00000","00000"],
"-":["00000","00000","00000","11111","00000","00000","00000"],
"+":["00000","00100","00100","11111","00100","00100","00000"],
".":["00000","00000","00000","00000","00000","00110","00110"],
":":["00000","00110","00110","00000","00110","00110","00000"],
"/":["00001","00001","00010","00100","01000","10000","10000"],
"_":["00000","00000","00000","00000","00000","00000","11111"],
",":["00000","00000","00000","00000","00110","00100","01000"]
};
function painter(){
 const bytes=new Uint8Array((1+W*4)*H);
 function rect(x,y,w,h,c){
  for(let j=Math.max(0,y|0);j<Math.min(H,(y+h)|0);j++)
   for(let i=Math.max(0,x|0);i<Math.min(W,(x+w)|0);i++){
    const p=j*(1+W*4)+1+i*4;
    bytes[p]=c[0];bytes[p+1]=c[1];bytes[p+2]=c[2];bytes[p+3]=255;
   }
 }
 function txt(s,x,y,k=2,c=C.white){
  for(let n=0;n<String(s).length;n++){
   const g=font[String(s)[n].toUpperCase()]||font[" "];
   for(let j=0;j<7;j++)for(let i=0;i<5;i++)if(g[j][i]==="1")rect(x+n*k*6+i*k,y+j*k,k,k,c);
  }
 }
 function panel(x,y,w,h){
  rect(x,y,w,h,C.border);rect(x+3,y+3,w-6,h-6,C.panel);
  for(const [a,b] of [[x,y],[x+w-7,y],[x,y+h-7],[x+w-7,y+h-7]])rect(a,b,7,7,C.bg);
 }
 return {bytes,rect,txt,panel};
}
function crc(bytes){
 let c=0xffffffff;
 for(const n of bytes){c^=n;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}
 return (c^0xffffffff)>>>0;
}
function chunk(name,payload){
 const b=new Uint8Array(payload.length+12),view=new DataView(b.buffer);
 view.setUint32(0,payload.length);
 for(let i=0;i<4;i++)b[i+4]=name.charCodeAt(i);
 b.set(payload,8);view.setUint32(b.length-4,crc(b.subarray(4,b.length-4)));
 return b;
}
function fmt(n){return Math.abs(n).toLocaleString("en-US");}
function signed(n){return (n>0?"+":n<0?"-":"")+fmt(n);}
export async function makePNG(d,options={}){
 verify(d);
 const labels=options.labels||SHARE_LABELS;
 const story=options.story||shareStory(d);
 const p=painter(),{rect,txt,panel,bytes}=p;
 rect(0,0,W,H,C.bg);
 for(let y=8;y<H;y+=14)for(let x=8;x<W;x+=14)rect(x,y,2,2,[21,48,71]);
 panel(15,12,570,48);
 txt("WORLD_001 // CHICKEN EATS THE INTERNET",30,29,2,C.mute);
 txt(options.eyebrow||"WHILE YOU WERE GONE",31,80,2,C.mute);
 const tint=story.tone==="heal"?C.green:story.tone==="neutral"?C.gold:C.pink;
 txt(story.headline[0],28,116,Math.min(5,Math.floor(345/(6*story.headline[0].length))),C.pink);
 txt(story.headline[1],28,168,Math.min(4,Math.floor(350/(6*story.headline[1].length))),C.white);
 // Pixel globe under attack. Both art and copy are frozen to this snapshot.
 for(let y=-61;y<61;y+=5)for(let x=-61;x<61;x+=5){
  if(x*x+y*y<61*61){
   const land=(x>-42&&x<8&&y>-36&&y<20)||(x>9&&x<44&&y>4&&y<41);
   rect(487+x,207+y,5,5,land?C.green:C.blue);
  }
 }
 rect(471,195,8,31,C.pink);rect(459,205,32,6,C.pink);
 // World_001 chicken: comb, white pixel body, eye, golden beak, wing and feet.
 rect(410,119,16,24,C.pink);rect(430,109,16,27,C.pink);
 rect(449,122,16,22,C.pink);rect(404,143,77,16,C.white);
 rect(392,155,95,24,C.white);rect(390,179,84,27,C.white);
 rect(389,207,53,23,C.white);rect(421,174,31,23,C.mute);
 rect(443,153,9,10,C.bg);rect(446,155,3,3,C.pink);
 rect(478,175,27,12,C.gold);rect(479,187,16,10,C.gold);
 rect(401,225,7,19,C.gold);rect(427,225,7,19,C.gold);
 rect(390,243,27,6,C.gold);rect(421,243,27,6,C.gold);
 for(let i=0;i<15;i++)rect(384+(i*53)%185,112+(i*61)%164,6+(i%3)*3,3,i%2?C.pink:C.mute);
 txt(story.detail[0],30,289,Math.min(3,Math.floor(350/(6*story.detail[0].length))),tint);
 txt(story.detail[1],30,320,Math.min(3,Math.floor(350/(6*story.detail[1].length))),tint);
 const cards=[[labels.heal,"+"+fmt(d.heal_hp)+" HP",C.green,18,365],
 [labels.kill,"-"+fmt(d.kill_hp)+" HP",C.pink,308,365],
 [labels.decay,"-"+fmt(d.decay_hp)+" HP",C.pink,18,457],
 [labels.chaos,signed(d.chaos_hp)+" HP",C.gold,308,457]];
 for(const [label,number,color,x,y] of cards){
  panel(x,y,274,81);txt(label,x+12,y+13,Math.min(2,Math.floor(245/(6*label.length))),C.mute);
  txt(number,x+12,y+43,number.length>16?2:3,color);
 }
 panel(18,553,564,155);
 txt(labels.net,31,570,2,C.mute);
 txt(signed(d.net_hp)+" HP",31,609,3,d.net_hp<0?C.pink:C.gold);
 txt(labels.health,323,570,2,C.mute);
 rect(321,597,249,36,C.border);rect(325,601,241,28,C.bg);
 const lit=Math.round(d.world_hp/50000);
 for(let i=0;i<20;i++)rect(331+i*11,607,8,16,i<lit?C.pink:C.panel);
 txt(healthStage(d.world_hp),323,650,2,C.pink);
 rect(20,723,558,3,C.border);
 txt(options.footer||"SERVER VERIFIED",29,735,1,C.mute);
 txt("THE INTERNET IS DYING",363,735,1,C.white);
 const compressed=new Uint8Array(await new Response(
  new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
 const ihdr=new Uint8Array(13),dv=new DataView(ihdr.buffer);
 dv.setUint32(0,W);dv.setUint32(4,H);ihdr[8]=8;ihdr[9]=6;
 const chunks=[chunk("IHDR",ihdr),chunk("IDAT",compressed),chunk("IEND",new Uint8Array())];
 const sig=Uint8Array.of(137,80,78,71,13,10,26,10);
 const total=sig.length+chunks.reduce((v,b)=>v+b.length,0),out=new Uint8Array(total);
 out.set(sig);let offset=sig.length;
 for(const part of chunks){out.set(part,offset);offset+=part.length;}
 return out;
}
function page(id,d,isV4=false){
 const prefix=isV4?"/v4/share/":"/share/";
 const image=SITE+prefix+id+"/image.png",link=SITE+prefix+id;
 const story=isV4?v4ShareStory(d):shareStory(d);
 const labels=isV4?V4_SHARE_LABELS:SHARE_LABELS;
 const title="CHICKEN EATS THE INTERNET — "+story.headline.join(" ");
 const desc=labels.heal+" +"+fmt(d.heal_hp)+" HP | "+labels.kill+" -"+fmt(d.kill_hp)+
  " HP | "+healthStage(d.world_hp)+". Will you SAVE it or KILL it?";
 return ['<!doctype html><html lang="en"><head><meta charset="utf-8">',
 '<meta name="viewport" content="width=device-width,initial-scale=1">',
 '<title>',title,'</title><meta name="description" content="',desc,'">',
 '<meta property="og:type" content="website"><meta property="og:site_name" content="THE INTERNET IS DYING">',
 '<meta property="og:title" content="',title,'"><meta property="og:description" content="',desc,'">',
 '<meta property="og:url" content="',link,'"><meta property="og:image" content="',image,'">',
 '<meta property="og:image:secure_url" content="',image,'">',
 '<meta property="og:image:type" content="image/png"><meta property="og:image:width" content="600">',
 '<meta property="og:image:height" content="750"><meta name="twitter:card" content="summary_large_image">',
 '<meta name="twitter:image" content="',image,'"><meta name="robots" content="noindex">',
 '<style>body{background:#081322;color:#f4f1e9;font:20px monospace;text-align:center;padding:15px}a{color:#7be1aa}img{max-width:min(94vw,380px)}</style>',
 '</head><body><main><img src="',image,'" alt="World 001 Chicken Eats the Internet verified pixel report">',
 '<h1>THE INTERNET IS DYING</h1><p>Will you SAVE it or KILL it?</p>',
 '<a href="',SITE,'/">JOIN THE CHAOS</a></main>',
 '<script>setTimeout(()=>location.replace("',SITE,'/"),1200)</script></body></html>'
 ].join("");
}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==="/api/v4-summary")return serveV4Summary(request,ctx);
  if(url.pathname==="/api/war-momentum"){
   return serveWarMomentum(request,ctx);
  }
  const v4match=url.pathname.match(/^\/v4\/share\/([a-f0-9-]{36})(\/image\.png)?\/?$/i);
  const legacyMatch=url.pathname.match(/^\/share\/([a-f0-9-]{36})(\/image\.png)?\/?$/i);
  const match=v4match||legacyMatch,isV4=!!v4match;
  if(!match||!UUID.test(match[1])){
   return env.ASSETS?env.ASSETS.fetch(request):new Response("Not found",{status:404});
  }
  if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405});
  let d;
  try{d=isV4?await readV4Card(match[1]):await readCard(match[1]);}
  catch{return new Response("Share currently unavailable",{status:503,headers:{"Cache-Control":"no-store"}});}
  if(!d)return new Response("Unknown share",{status:404});
  const headers={"Cache-Control":"public,max-age=300","X-Content-Type-Options":"nosniff"};
  if(match[2]){
   try{
    const art=isV4?v4ToArtFields(d):d;
    const img=await makePNG(art,isV4?{
     labels:V4_SHARE_LABELS,story:v4ShareStory(d),
     eyebrow:"LAST 24H SETTLED EVENTS",footer:"V4 VERIFIED WORLD HP"
    }:{});
    return new Response(request.method==="HEAD"?null:img,{
     headers:{...headers,"Content-Type":"image/png","Content-Length":String(img.length)}});
   }catch{return new Response("Image unavailable",{status:503});}
  }
  return new Response(request.method==="HEAD"?null:page(match[1],d,isV4),{
   headers:{...headers,"Content-Type":"text/html; charset=utf-8",
   "Referrer-Policy":"no-referrer",
   "Content-Security-Policy":"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'"}});
 }
};

