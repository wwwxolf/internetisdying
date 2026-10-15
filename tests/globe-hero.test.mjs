import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Landing uses pixel globe and compact demo HP bar without numeric text",async()=>{
 const html=await readFile("public/index.html","utf8");
 assert.match(html,/src="\.\/assets\/dying-internet-core\.svg"/);
 assert.match(html,/class="heart-zone world-core-zone"/);
 assert.match(html,/class="world-core-signal"/);
 assert.doesNotMatch(html,/class="pixel-heart"/);
 assert.doesNotMatch(html,/id="hp-label"|id="hp-percent"|50\.0% LIFE REMAINING|500,000|\/ 1,000,000 HP/);
 assert.match(html,/aria-valuenow="50"/);
 assert.match(html,/LOCAL DEMO ONLY/);
 assert.match(html,/JOIN THE CHAOS/);
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
test("Only red core pulses, HP bar scans inside 50 percent; mobile and reduced motion",async()=>{
 const css=await readFile("public/styles.css","utf8");
 const arena=await readFile("public/arena.html","utf8");
 assert.match(css,/\.world-core-img\{[\s\S]*image-rendering:pixelated/);
 assert.match(css,/@media\(max-width:640px\)[\s\S]*\.world-core-visual/);
 assert.match(css,/@media\(max-width:380px\)[\s\S]*\.world-core-visual/);
 assert.match(css,/\.world-core-signal\{[\s\S]*animation:internet-core-pulse/);
 assert.doesNotMatch(css,/@keyframes internet-core-flicker/);
 assert.match(css,/\.hero \.hud-minimal \.hp-fill\{position:relative;overflow:hidden\}/);
 assert.match(css,/\.hero \.hud-minimal \.hp-fill::after\{/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*\.world-core-signal\{animation:none!important/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*\.hero \.hud-minimal \.hp-fill::after\{animation:none!important/);
 assert.match(arena,/class="heart-zone world-core-zone"/);
 assert.match(arena,/src="\.\/assets\/dying-internet-core\.svg"/);
 assert.match(arena,/class="world-core-signal"/);
 assert.doesNotMatch(arena,/class="pixel-heart"/);
});
