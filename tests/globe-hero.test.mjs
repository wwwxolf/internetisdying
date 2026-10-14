import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Landing features pixel globe instead of heart without changing HP demo",async()=>{
 const html=await readFile("public/index.html","utf8");
 assert.match(html,/src="\.\/assets\/dying-internet-core\.svg"/);
 assert.match(html,/class="heart-zone world-core-zone"/);
 assert.doesNotMatch(html,/class="pixel-heart"/);
 assert.match(html,/id="hp-label"/);
 assert.match(html,/JOIN THE CHAOS/);
 assert.match(html,/LOCAL DEMO ONLY/);
});
test("Pixel globe SVG embeds a compact self-contained PNG",async()=>{
 const svg=await readFile("public/assets/dying-internet-core.svg","utf8");
 const encoded=svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)?.[1];
 assert.ok(encoded,"Embedded PNG required");
 const png=Buffer.from(encoded,"base64");
 assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 assert.equal(png.readUInt32BE(16),96);
 assert.equal(png.readUInt32BE(20),96);
 assert.ok(png.byteLength < 10000,"Keep asset small for mobile");
 assert.match(svg,/image-rendering="pixelated"/);
});
test("Globe scales on mobile and respects reduced motion; Arena heart is unchanged",async()=>{
 const css=await readFile("public/styles.css","utf8");
 const arena=await readFile("public/arena.html","utf8");
 assert.match(css,/\.world-core-img\{[\s\S]*image-rendering:pixelated/);
 assert.match(css,/@media\(max-width:640px\)[\s\S]*\.world-core-img/);
 assert.match(css,/@media\(max-width:380px\)[\s\S]*\.world-core-img/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*\.world-core-img\{animation:none!important/);
 assert.match(arena,/class="pixel-heart"/);
});
