/* V4 share UI: new immutable 24h event snapshot on every click.
   It must never fetch V2 presence reports or fall back to legacy sharing. */
export function initV4ShareUI({sb}){
 const $=id=>document.getElementById(id);
 const btn=$('world-return-share'),modal=$('share-card-modal');
 if(!btn||!modal)return;
 const preview=$('share-card-preview'),feedback=$('share-card-feedback');
 const download=$('share-card-download'),whatsapp=$('share-card-whatsapp');
 let busy=false,shareFile=null,shareUrl=null,shareLink=null,shareData=null,shareLib=null;
 const message=s=>{$('world-return-status').textContent=s;};
 const reset=()=>{
  if(shareUrl){URL.revokeObjectURL(shareUrl);shareUrl=null;}
  shareFile=null;shareData=null;shareLink=null;preview.removeAttribute('src');
 };
 const close=()=>{modal.hidden=true;reset();btn.focus();};
 const onKey=e=>{if(e.key==='Escape'&&!modal.hidden)close();};
 $('share-card-close').addEventListener('click',close);
 modal.addEventListener('click',e=>{if(e.target===modal)close();});
 document.addEventListener('keydown',onKey);
 btn.textContent='CREATE V4 PIXEL SHARE CARD ↗';
 btn.title='Immutable snapshot of the past 24 hours of settled World HP events.';
 btn.disabled=false;
 async function prepare(){
  if(busy||btn.disabled)return;
  busy=true;btn.disabled=true;message('CAPTURING VERIFIED V4 WORLD SNAPSHOT…');
  try{
   const {data,error}=await sb.rpc('iid_v4_publish_share_card');
   if(error)throw error;
   if(!data||!data.id||!data.snapshot||!/^[a-f0-9-]{36}$/i.test(data.id))
    throw Error('V4 share not available');
   shareLib??=await import('./v4-share-card.js?v=1');
   shareLib.validateV4Share(data.snapshot);
   const png=await shareLib.renderV4Card(data.snapshot);
   if(png.type!=='image/png')throw Error('PNG is unavailable');
   reset();
   shareData=data.snapshot;
   shareLink=shareLib.V4_SITE+'/v4/share/'+data.id;
   shareFile=new File([png],shareLib.v4Filename(shareData),{type:'image/png'});
   shareUrl=URL.createObjectURL(shareFile);
   preview.src=shareUrl;
   preview.alt='V4 CHICKEN EATS THE INTERNET — '+shareLib.v4ShareStory(shareData).headline.join(' ')+
    '. World health '+shareLib.worldStage(shareData.world_hp)+
    '. Verified settled snapshot at '+shareData.snapshot_at+'.';
   feedback.textContent='V4 SERVER VERIFIED • SNAPSHOT '+new Date(shareData.snapshot_at).toISOString();
   $('share-card-tip').textContent=
    'WHATSAPP: immutable verified 24-hour world report link. SAVE PNG: downloadable pixel art.';
   modal.hidden=false;
   $('share-card-close').focus();
   message('V4 PIXEL SHARE CARD READY • SERVER VERIFIED');
  }catch(e){
   reset();message('V4 SHARE UNAVAILABLE • RETRY');
   console.warn('V4 snapshot/share failed',e);
  }finally{busy=false;btn.disabled=false;}
 }
 btn.addEventListener('click',()=>{void prepare();});
 download.addEventListener('click',()=>{
  if(!shareUrl||!shareFile)return;
  const a=document.createElement('a');a.href=shareUrl;a.download=shareFile.name;
  document.body.append(a);a.click();a.remove();
  feedback.textContent='V4 PNG READY • ATTACH IT TO YOUR MESSAGE';
 });
 whatsapp.addEventListener('click',()=>{
  if(!shareLink||!shareData||!shareLib)return;
  window.open('https://wa.me/?text='+
   encodeURIComponent(shareLib.v4ShareCaption(shareData,shareLink)),
   '_blank','noopener,noreferrer');
  feedback.textContent='WHATSAPP SHARE OPENED • VERIFIED IMAGE LINK INCLUDED';
 });
 window.addEventListener('pagehide',()=>{
  reset();document.removeEventListener('keydown',onKey);
 },{once:true});
}
