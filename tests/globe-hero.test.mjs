import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Landing offers one active world and four distinct locked worlds without fake timing",async()=>{
 const html=await readFile("public/multiverse.html","utf8");
 assert.equal((html.match(/class="world-active"/g)||[]).length,1);
 assert.equal((html.match(/class="world-locked"/g)||[]).length,4);
 assert.match(html,/id="join-btn" href="\.\/prologue\.html"/);
 assert.match(html,/ACTIVE NOW/);assert.match(html,/30-DAY WORLD/);
 assert.match(html,/World rotation is coming soon/);
 assert.doesNotMatch(html,/id="countdown"|aria-valuenow="50"|DESIGN DEMO/);
 const assets=[...html.matchAll(/src="\.\/assets\/(world-[a-z]+\.svg)"/g)].map(m=>m[1]);
 assert.equal(new Set(assets).size,5);
 for(const asset of assets){const svg=await readFile("public/assets/"+asset,"utf8");assert.match(svg,/shape-rendering="crispEdges"/);assert.ok(svg.length<20000);assert.doesNotMatch(svg,/<script|<image/);}
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
test("Landing pulse remains intact while Arena shows the pecking globe; HP scans remain correct",async()=>{
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
 assert.match(arena,/src="\.\/assets\/world001-pecking-globe\.svg"/);
 assert.match(arena,/class="world-core-signal"/);
 assert.doesNotMatch(arena,/class="pixel-heart"/);
});

