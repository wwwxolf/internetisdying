import {renderBreakingCard,worldStage} from "./breaking-share-card.js";
import {validateV4Share,v4ToArtFields,v4ShareStory,V4_SHARE_LABELS} from "./v4-share-data.js";

export const V4_SITE="https://internetisdying.wwwxolf.workers.dev";
export async function renderV4Card(snapshot){
 validateV4Share(snapshot);
 return renderBreakingCard(v4ToArtFields(snapshot),{
  labels:V4_SHARE_LABELS,story:v4ShareStory(snapshot),
  eyebrow:"LAST 24H // SETTLED WORLD EVENTS",
  footer:"V4 VERIFIED // WORLD HP"
 });
}
export function v4ShareCaption(snapshot,link){
 validateV4Share(snapshot);
 if(!/^https:\/\/internetisdying\.wwwxolf\.workers\.dev\/v4\/share\/[a-f0-9-]{36}$/i.test(link))
  throw Error("Invalid V4 share link");
 return "🐔 THE CHICKEN IS EATING THE INTERNET.\n\n"+
  v4ShareStory(snapshot).headline.join(" ")+"\n"+
  "A REAL WORLD_001 BATTLE SNAPSHOT.\n\n"+
  "Will you PATCH it or PECK it?\n"+link;
}
export function v4Filename(snapshot){
 validateV4Share(snapshot);
 return "chicken-eats-the-internet-v4-"+new Date(snapshot.snapshot_at).toISOString().replace(/[:.]/g,"-")+".png";
}
export {validateV4Share,v4ShareStory,worldStage};
