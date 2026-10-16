import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const origins=[
 ["HUMAN","human"],
 ["BOT_CHICKEN","bot-chicken"],
 ["CHICKEN_MUTANT","chicken-mutant"],
 ["EGG_GLITCH","egg-glitch"]
];

test("World 001 onboarding and preview use four shared lightweight pixel sprites",async()=>{
 const onboarding=await readFile("public/onboarding.html","utf8");
 const preview=await readFile("public/avatars.html","utf8");
 for(const [origin,asset] of origins){
  const filename="avatar-world001-"+asset+".svg";
  assert.match(onboarding,new RegExp('data-origin="'+origin+'"[^>]*>[\\s\\S]*?'+filename));
  assert.match(preview,new RegExp('src="\\./assets/'+filename+'"'));
  const svg=await readFile("public/assets/"+filename,"utf8");
  assert.match(svg,/viewBox="0 0 96 112"/);
  assert.match(svg,/shape-rendering="crispEdges"/);
  assert.doesNotMatch(svg,/<script|<image|<foreignObject/i);
  assert.ok(svg.length<3000,"sprites must stay lightweight");
 }
 assert.doesNotMatch(onboarding,/data-origin="ALIEN"/);
});

test("chosen preview avatar survives sign-in and the Arena supports legacy origins",async()=>{
 const preview=await readFile("public/avatars.html","utf8");
 const auth=await readFile("public/auth.html","utf8");
 const onboarding=await readFile("public/onboarding.html","utf8");
 const arena=await readFile("public/arena.html","utf8");
 const js=await readFile("public/flow.js","utf8");
 assert.match(preview,/iid_world001_avatar_choice_v1/);
 assert.match(preview,/enter\.href="\.\/auth\.html\?avatar="/);
 assert.match(js,/const requestedAvatar=avatarCodes\.includes\(avatarFromUrl\)/);
 assert.match(js,/sessionStorage\.getItem\(avatarStoreKey\)/);
 assert.match(js,/const onboardingDest="\.\/onboarding\.html"/);
 assert.match(js,/\("arena-identity"\)\.textContent=\(originLabels\[p\.origin\]/);
 for(const [origin,asset] of origins)assert.match(js,new RegExp(origin+':"world001-'+asset+'"'));
 for(const origin of ["BOT","ALIEN","GLITCH"])assert.match(js,new RegExp(origin+':"'+origin.toLowerCase()+'"'));
 assert.match(js,/\$\("arena-origin-avatar"\)\.src/);
 for(const page of [auth,onboarding])assert.match(page,/src="\.\/flow\.js\?v=34"/);
 assert.match(arena,/src="\.\/flow\.js\?v=37"/);
 const css=await readFile("public/styles.css","utf8");
 const arenaCss=await readFile("public/arena.css","utf8");
 assert.match(css,/\.world001-characters .avatar-icon img\{[^}]*image-rendering:pixelated/);
 assert.match(arenaCss,/\.arena-origin-avatar\{[^}]*image-rendering:pixelated/);
});

