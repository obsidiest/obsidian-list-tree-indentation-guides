import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "release/browser");
await mkdir(output, {recursive:true});
const bundle = await build({entryPoints:[resolve(root,"tests/browser/fixture.mjs")], bundle:true,write:false,format:"iife",
  alias:{obsidian:resolve(root,"tests/browser/obsidian.mjs")}});
const css = await readFile(resolve(root,"styles.css"),"utf8");
const browser = await chromium.launch({headless:true, executablePath:process.env.LTIG_CHROMIUM_PATH || undefined,
  args:["--no-sandbox","--disable-dev-shm-usage"]});
const results = [];
const fixtures = [];
const test = (name,run) => fixtures.push({name,run});
const frames = page => page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
const hostCSS = `body{margin:20px;background:#24272b;color:#ddd;font:24px/2 Arial;--text-muted:#888}
  .cm-editor{height:820px!important}.markdown-rendered{width:740px;padding:30px 65px;box-sizing:border-box}
  .markdown-rendered li{margin:10px 0}.markdown-rendered ul,.markdown-rendered ol{padding-inline-start:44px}
  .list-bullet{position:relative;display:inline-flex;justify-content:center;align-items:center}
  .list-bullet::before{content:'\\200B'}.list-bullet::after{content:'';position:absolute;width:.3em;height:.3em;border-radius:50%;background:#aaa}
  .task-list-item-checkbox{width:22px;height:22px;vertical-align:middle;margin:0}
  .cm-formatting-list-ol{display:inline-block;min-width:50px}
  .markdown-rendered .list-bullet{float:inline-start;margin-inline-start:-.8em}
  .markdown-rendered ul>li{list-style:none}.markdown-rendered .task-list-item>.list-bullet{display:none}
  .markdown-rendered .task-list-item-checkbox{margin-inline-start:-30px;margin-inline-end:8px}`;

async function hoverLine(page, index) {
  const p = await page.locator("#editor .cm-line").nth(index).evaluate(el => {
    const r=el.getBoundingClientRect();return {x:r.left+150,y:r.top+15};
  });
  await page.mouse.move(p.x,p.y);await frames(page);
}
async function bounds(page) {
  return page.evaluate(() => {
    const parent=document.querySelector("#editor .cm-line");
    const marker=parent.querySelector(".task-list-item-checkbox, .list-bullet, .cm-formatting-list");
    // Independent visual bound: widget input, bullet ::after, or numeral range.
    const box=parent.querySelector("input");
    const bullet=parent.querySelector(".list-bullet");
    let r;
    if (box) r=box.getBoundingClientRect();
    else if (bullet) {
      const b=bullet.getBoundingClientRect(),h=parseFloat(getComputedStyle(bullet,"::after").height);
      r={top:b.top+(b.height-h)/2,bottom:b.top+(b.height+h)/2};
    } else { const range=document.createRange();range.selectNodeContents(marker);r=range.getClientRects()[0]; }
    const svg=document.querySelector(".ltig-editor-overlay");
    const path=Array.from(svg.querySelectorAll(".ltig-thread-path")).at(-1);
    const start=Number(path.getAttribute("d").split(" ")[2])+svg.getBoundingClientRect().top;
    return {top:r.top,bottom:r.bottom,start,capTop:start-parseFloat(getComputedStyle(path).strokeWidth)/2,
      rowBottom:parent.getBoundingClientRect().bottom};
  });
}
for (const mode of ["livePreview","source"]) for (const marker of ["-","1.","- [ ]"]) for (const wrapped of [false,true]) {
  test(`${mode} ${marker}: 110% reaches a ${wrapped?"wrapped":"short"} parent's visible marker`, async page => {
    await page.evaluate(({mode,marker,wrapped}) => {
      ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false});
      document.body.style.setProperty("--ltig-thread-connector-height","110%");
      ltigTest.setupMarkerEditor(`${marker} ${wrapped?"Wrapped parent text ".repeat(9):"Parent"}\n    - child`, mode);
    },{mode,marker,wrapped});
    await frames(page);await hoverLine(page,1);
    const b=await bounds(page);
    assert(b.capTop >= b.bottom-.1 && b.capTop <= b.bottom+4.1,JSON.stringify(b));
    return b;
  });
}
for (const all of [false,true]) {
  test(`110% ${all?"all branches":"active item"}: a distant child cannot pull the stroke above its parent`, async page => {
    await page.evaluate(all => {
      ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false,allBranchesOfActiveOrphanListThreading:all});
      document.body.style.setProperty("--ltig-thread-connector-height","110%");
      ltigTest.setupMarkerEditor("- Parent\n    - First child\n    - " + "Wrapped sibling text ".repeat(18) + "\n    - Last child");
    },all);
    await frames(page);await hoverLine(page,3);
    const b=await bounds(page);
    assert(b.capTop >= b.bottom-.1 && b.capTop <= b.bottom+4.1,JSON.stringify(b));
    return b;
  });
}
for (const surface of ["reading","embed","breadcrumb"]) for (const kind of ["bullet","number","checkbox"]) {
  test(`${surface} ${kind}: wrapped-parent thread reaches its marker without crossing it`, async page => {
    await page.evaluate(({surface,kind}) => {
      ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:surface==="breadcrumb",breadcrumbThreading:true,
        breadcrumbFieldActivation:true,breadcrumbNavigateBeforeTimeout:false});
      document.body.style.setProperty("--ltig-thread-connector-height","110%");
      document.body.style.setProperty("--ltig-breadcrumb-thread-connector-height","110%");
      const parent="Wrapped parent ".repeat(12),tag=kind==="number"?"ol":"ul";
      const marker=kind==="bullet"?'<span class="list-bullet"></span>':kind==="checkbox"?
        '<span class="list-bullet"></span><input class="task-list-item-checkbox" type="checkbox">':'';
      ltigTest.addSurface({id:"list",embed:surface==="embed",
        html:`<${tag}><li class="${kind==="checkbox"?"task-list-item":""}" id="parent">${marker}${parent}<ul><li><span class="list-bullet"></span><span id="child">Child</span></li></ul></li></${tag}>`,
        text:`${kind==="number"?"1.":kind==="checkbox"?"- [ ]":"-"} ${parent}\n    - Child`});
    },{surface,kind});
    await frames(page);
    const p=await page.locator("#child").evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.left+10,y:(r.top+r.bottom)/2};});
    await page.mouse.move(p.x,p.y);await frames(page);
    const b=await page.evaluate(surface=>{
      const popup=surface==="breadcrumb";
      const svg=popup?document.querySelector(".ltig-breadcrumb-popover svg"):ltigTest.overlay("list");
      const path=Array.from(svg.querySelectorAll(popup?".ltig-breadcrumb-thread-path":".ltig-thread-path")).at(-1);
      let marker;
      if(popup){const range=document.createRange();range.selectNodeContents(document.querySelector(".ltig-breadcrumb-list-marker"));marker=range.getClientRects()[0];}
      else {
        const parent=document.getElementById("parent"),box=parent.querySelector("input"),bullet=parent.querySelector(":scope > .list-bullet");
        if(box) marker=box.getBoundingClientRect();
        else if(bullet){const r=bullet.getBoundingClientRect(),h=parseFloat(getComputedStyle(bullet,"::after").height);marker={bottom:r.top+(r.height+h)/2};}
        else {const range=document.createRange();range.selectNodeContents(parent.firstChild);marker=range.getClientRects()[0];}
      }
      const [x,y]=path.getAttribute("d").split(" ").slice(1,3).map(Number),matrix=svg.getScreenCTM();
      const cap=new DOMPoint(x,y-parseFloat(getComputedStyle(path).strokeWidth)/2).matrixTransform(matrix);
      return {capTop:cap.y,markerBottom:marker.bottom};
    },surface);
    assert(b.capTop>=b.markerBottom-.1 && b.capTop<=b.markerBottom+4.1,JSON.stringify(b));
    return b;
  });
}
test("height, stroke cap, and vertical offset remain independent at large percentages", async page => {
  await page.evaluate(()=>{
    ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false});
    document.body.style.setProperty("--ltig-thread-thickness","12px");
    document.body.style.setProperty("--ltig-thread-vertical-offset","7px");
    ltigTest.setupMarkerEditor("12. Parent\n    - First child\n    - "+"Long sibling ".repeat(20)+"\n    - Last child");
  });
  await frames(page);await hoverLine(page,3);
  const samples=[];
  for(const height of [0,50,100,103,110,150,725.25]){
    await page.evaluate(height=>document.body.style.setProperty("--ltig-thread-connector-height",`${height}%`),height);
    await frames(page);const b=await bounds(page);samples.push({height,...b});
    assert(b.capTop>=b.bottom-.1,JSON.stringify(b));
  }
  assert(samples[0].start>samples[1].start && samples[1].start>samples[2].start);
  assert(samples[3].start<samples[2].start,"values above 100 can still reduce the clearance gap");
  for(let i=1;i<samples.length;i++) assert(samples[i].start<=samples[i-1].start);
  return samples;
});

try {
  for (const {name,run} of fixtures) {
    const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error") errors.push(m.text());});
    try {
      await page.setContent(`<style>${hostCSS}${css}</style><body class="theme-dark"></body>`);
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      const measurements=await run(page);assert.deepEqual(errors,[]);
      results.push({name,passed:true,measurements});
    } catch(error) {results.push({name,passed:false,error:error.message,console:errors});}
    await page.screenshot({path:resolve(output,`height-${results.length}.png`)});
    await page.close();console.log(`${results.at(-1).passed?"PASS":"FAIL"} ${name}`);
  }
  const report={browser:browser.version(),host:"Chromium with real plugin modules and CodeMirror; not Obsidian desktop",results};
  await writeFile(resolve(output,process.argv.includes("--diagnose")?"thread-height-diagnostic.json":"thread-height-2.0.1.json"),JSON.stringify(report,null,2));
  for(const r of results.filter(r=>!r.passed)) console.log(JSON.stringify(r));
  if(!process.argv.includes("--diagnose")) assert(results.every(r=>r.passed),"Thread height scenarios failed");
} finally {await browser.close();}
