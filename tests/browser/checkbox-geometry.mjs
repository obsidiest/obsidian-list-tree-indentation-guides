import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "release/browser");
await mkdir(output, {recursive:true});
const bundle = await build({entryPoints:[resolve(root,"tests/browser/fixture.mjs")],bundle:true,write:false,format:"iife",
  alias:{obsidian:resolve(root,"tests/browser/obsidian.mjs")}});
const css = await readFile(resolve(root,"styles.css"),"utf8");
const browser = await chromium.launch({headless:true,executablePath:process.env.LTIG_CHROMIUM_PATH || undefined,
  args:["--no-sandbox","--disable-dev-shm-usage"]});
const frames = page => page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
const hostCSS = `body{margin:20px;background:#24272b;color:#ddd;font:24px/2 Arial;--text-muted:#888}
  .cm-editor{height:800px!important}.markdown-rendered{width:740px;padding:30px 65px;box-sizing:border-box}
  .markdown-rendered li{margin:10px 0}.markdown-rendered ul,.markdown-rendered ol{padding-inline-start:48px}
  .list-bullet{position:relative;display:inline-flex;justify-content:center;align-items:center}
  .list-bullet::before{content:'\\200B'}.list-bullet::after{content:'';position:absolute;width:.3em;height:.3em;border-radius:50%;background:#aaa}
  .task-list-item-checkbox{width:22px;height:22px;vertical-align:middle;margin:0 5px 0 2px}
  .cm-formatting-list{padding-inline-start:6px}.cm-formatting-list-ol{display:inline-block}
  .markdown-rendered .list-bullet{float:inline-start;margin-inline-start:-.8em}
  .markdown-rendered ul>li{list-style:none}.markdown-rendered .task-list-item>.list-bullet{display:none}
  .markdown-rendered ul .task-list-item-checkbox{margin-inline-start:-30px}
  .markdown-rendered ol .task-list-item-checkbox{margin-inline-start:2px}`;
const results = [], fixtures = [];
const test = (name,run) => fixtures.push({name,run});
async function hoverLine(page,index) {
  const p=await page.locator("#editor .cm-line").nth(index).evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.left+250,y:r.top+15};});
  await page.mouse.move(p.x,p.y);await frames(page);
}
// Independent DOM measurements: never call the production marker helper.
async function editorMetrics(page) {
  return page.evaluate(()=>{
    const svg=document.querySelector(".ltig-editor-overlay"),matrix=svg.getScreenCTM();
    const paths=Array.from(svg.querySelectorAll("path")).map(p=>{
      const d=p.getAttribute("d"),n=d.split(" ");
      const start=new DOMPoint(+n[1],+n[2]).matrixTransform(matrix);
      const endXs=[...d.matchAll(/H (-?[\d.]+)/g)].map(m=>new DOMPoint(+m[1],0).matrixTransform(matrix).x);
      return{cls:p.getAttribute("class"),x:start.x,y:start.y,endXs,d,stroke:parseFloat(getComputedStyle(p).strokeWidth)};
    });
    const rows=Array.from(document.querySelectorAll("#editor .cm-line")).map(row=>{
      const ordinal=row.querySelector(".fixture-ordinal"),input=row.querySelector("input"),bullet=row.querySelector(".list-bullet");
      const r=input?.getBoundingClientRect();let primary;
      if(ordinal){const range=document.createRange();range.selectNodeContents(ordinal);primary=range.getBoundingClientRect();}
      else if(input) primary=r;
      else if(bullet){const box=bullet.getBoundingClientRect(),size=parseFloat(getComputedStyle(bullet,"::after").width);
        primary={left:box.left+(box.width-size)/2,right:box.left+(box.width+size)/2,top:box.top+(box.height-size)/2,bottom:box.top+(box.height+size)/2};}
      else {const range=document.createRange();range.selectNodeContents(row.querySelector(".cm-formatting-list"));primary=range.getBoundingClientRect();}
      return {left:Math.min(primary.left,r?.left??Infinity),right:Math.max(primary.right,r?.right??-Infinity),
        center:(primary.left+primary.right)/2,bottom:Math.max(primary.bottom,r?.bottom??-Infinity)};
    });
    return{paths,rows};
  });
}
for(const token of ["1.","12."]) test(`${token} checkbox: static and thread stop before the ordinal`,async page=>{
  await page.evaluate(token=>{ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false});ltigTest.setupMarkerEditor(`- Parent\n    ${token} [ ] Child`);},token);
  await frames(page);await hoverLine(page,1);
  const m=await editorMetrics(page),child=m.rows[1];
  const paths=m.paths.filter(p=>p.cls.includes("thread-path")||p.cls.includes("guide-path"));
  const ends=paths.flatMap(p=>p.endXs).filter(x=>x>m.rows[0].left);
  assert(ends.length>=2,JSON.stringify(m));
  assert(ends.every(x=>x<child.left),JSON.stringify(m));return m;
});
for(const parent of ["-","- [ ]","1. [ ]"]) for(const all of [false,true])
test(`${parent} parent: ${all?"all branches":"active"} checkbox children stay below their parent's marker`,async page=>{
  await page.evaluate(({parent,all})=>{ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false,allBranchesOfActiveOrphanListThreading:all});
    ltigTest.setupMarkerEditor(`${parent} Parent\n    - [ ] Child\n    12. [ ] Another child`);},{parent,all});
  await frames(page);await hoverLine(page,1);const first=await editorMetrics(page);
  await hoverLine(page,2);const second=await editorMetrics(page);
  const a=first.paths.filter(p=>p.cls.includes("thread-path")).at(-1),b=second.paths.filter(p=>p.cls.includes("thread-path")).at(-1);
  assert(Math.abs(a.x-first.rows[0].center)<.2 && Math.abs(b.x-second.rows[0].center)<.2,JSON.stringify({first,second}));
  assert(a.y-a.stroke/2>=first.rows[0].bottom-.1 && b.y-b.stroke/2>=second.rows[0].bottom-.1);
  return{first,second};
});
test("ordered task in an embed: the native number is outside both connectors",async page=>{
  await page.evaluate(()=>{ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false});
    ltigTest.addSurface({id:"list",embed:true,html:'<ul><li><span class="list-bullet"></span>Parent<ol start="12"><li id="task" class="task-list-item"><input type="checkbox" class="task-list-item-checkbox">Child</li></ol></li></ul>',text:'- Parent\n\n    12. [ ] Child'});});
  await frames(page);const p=await page.locator("#task").boundingBox();await page.mouse.move(p.x+70,p.y+15);await frames(page);
  const m=await page.evaluate(()=>{
    const row=document.getElementById("task"),box=row.getBoundingClientRect(),svg=ltigTest.overlay("list"),matrix=svg.getScreenCTM();
    // Chromium's outside decimal marker is right-aligned just before the li's
    // content edge. Measure its glyph independently in the same font.
    const probe=document.createElement("span");probe.textContent="12.";probe.style.font=getComputedStyle(row).font;
    document.body.append(probe);const width=probe.getBoundingClientRect().width;probe.remove();
    return {numberRight:box.left,numberLeft:box.left-width,
      paths:Array.from(svg.querySelectorAll("path")).map(p=>({d:p.getAttribute("d"),ends:[...p.getAttribute("d").matchAll(/H (-?[\d.]+)/g)].map(m=>new DOMPoint(+m[1],0).matrixTransform(matrix).x)}))};
  });
  const ends=m.paths.flatMap(p=>p.ends).filter(x=>x>90);
  assert(ends.length>=2 && ends.every(x=>x<m.numberLeft),JSON.stringify(m));return m;
});
test("Source: numbered task syntax retains numeral clearance and parent attachment",async page=>{
  await page.evaluate(()=>{ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false});
    ltigTest.setupMarkerEditor('1. [ ] Parent\n    1. [ ] Child',"source");});
  await frames(page);await hoverLine(page,1);const m=await editorMetrics(page);
  const p=m.paths.filter(p=>p.cls.includes("thread-path")).at(-1);
  assert(Math.abs(p.x-m.rows[0].center)<.2 && p.endXs.every(x=>x<m.rows[1].left),JSON.stringify(m));return m;
});
test("RTL: numbered checkbox endpoints and parent attachment mirror together",async page=>{
  await page.evaluate(()=>{ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false});
    document.body.style.direction="rtl";ltigTest.setupMarkerEditor('1. [ ] Parent\n    1. [ ] Child');});
  await frames(page);await hoverLine(page,1);const m=await editorMetrics(page);
  const p=m.paths.filter(p=>p.cls.includes("thread-path")).at(-1);
  assert(Math.abs(p.x-m.rows[0].center)<.2 && p.endXs.every(x=>x>m.rows[1].right),JSON.stringify(m));return m;
});
test("gap defaults to 6.5, saved values win, and changing gap does not move the parent attachment",async page=>{
  await page.evaluate(()=>{ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false});ltigTest.setupMarkerEditor('- [ ] Parent\n    1. [ ] Child');});
  await frames(page);await hoverLine(page,1);
  const defaults=await page.evaluate(()=>({main:getComputedStyle(document.body).getPropertyValue('--ltig-thread-marker-gap').trim(),
    breadcrumb:getComputedStyle(document.body).getPropertyValue('--ltig-breadcrumb-thread-marker-gap').trim()}));
  assert.equal(defaults.main,"6.5px");assert.equal(defaults.breadcrumb,"4px");
  const samples=[];
  for(const gap of [6.5,4,12.5]){
    await page.evaluate(gap=>document.body.style.setProperty('--ltig-thread-marker-gap',`${gap}px`),gap);await frames(page);
    const m=await editorMetrics(page),p=m.paths.filter(p=>p.cls.includes("thread-path")).at(-1);
    assert(Math.abs(m.rows[1].left-p.endXs[0]-gap)<.1 && Math.abs(p.x-m.rows[0].center)<.1,JSON.stringify(m));samples.push({gap,...m});
  }
  await page.evaluate(()=>document.body.style.setProperty('--ltig-thread-connector-length','40px'));await frames(page);
  const longer=await editorMetrics(page),p=longer.paths.filter(p=>p.cls.includes("thread-path")).at(-1);
  assert(Math.abs(p.x-(longer.rows[0].center-12))<.1,"the horizontal reach control must still move the spine");
  return{defaults,samples,longer};
});
for(const rtl of [false,true]) test(`scaled embed ordered tasks: ${rtl?"RTL":"LTR"} native numeral clearance`,async page=>{
  await page.evaluate(rtl=>{ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false});document.body.style.direction=rtl?"rtl":"ltr";
    ltigTest.addSurface({id:"list",embed:true,html:'<ol><li><input type="checkbox" class="task-list-item-checkbox">Parent<ol><li id="task"><input type="checkbox" class="task-list-item-checkbox">Child</li></ol></li></ol>',text:'1. [ ] Parent\n    1. [ ] Child'});
    document.getElementById("list").style.transform="scale(.8)";ltigTest.rendered.refresh(document);
  },rtl);
  await frames(page);const r=await page.locator("#task").boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await frames(page);
  const m=await page.evaluate(rtl=>{
    const el=document.getElementById("task"),r=el.getBoundingClientRect(),svg=ltigTest.overlay("list");
    const probe=document.createElement("span");probe.textContent="1.";probe.style.font=getComputedStyle(el).font;document.body.append(probe);
    const width=probe.getBoundingClientRect().width*.8;probe.remove();
    const paths=Array.from(svg.querySelectorAll("path")).map(p=>({d:p.getAttribute("d"),
      ends:[...p.getAttribute("d").matchAll(/H (-?[\d.]+)/g)].map(m=>new DOMPoint(+m[1],0).matrixTransform(svg.getScreenCTM()).x)}));
    return{edge:rtl?r.right+width:r.left-width,paths};
  },rtl);
  const p=m.paths.at(-1);assert(p.ends.length && p.ends.every(x=>rtl?x>m.edge:x<m.edge),JSON.stringify(m));return m;
});
try {
  for(const {name,run} of fixtures){
    const page=await browser.newPage({viewport:{width:1100,height:950}}),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    try{await page.setContent(`<style>${hostCSS}${css}</style><body class="theme-dark"></body>`);
      await page.addScriptTag({content:bundle.outputFiles[0].text});const measurements=await run(page);assert.deepEqual(errors,[]);
      results.push({name,passed:true,measurements});
    }catch(e){results.push({name,passed:false,error:e.message,console:errors});}
    await page.screenshot({path:resolve(output,`checkbox-${results.length}.png`)});await page.close();
    console.log(`${results.at(-1).passed?"PASS":"FAIL"} ${name}`);
  }
  await writeFile(resolve(output,process.argv.includes("--diagnose")?"checkbox-diagnostic.json":"checkbox-2.0.1.json"),JSON.stringify({browser:browser.version(),host:"Chromium with plugin modules and CodeMirror; not Obsidian desktop",results},null,2));
  if(!process.argv.includes("--diagnose"))assert(results.every(r=>r.passed),JSON.stringify(results.filter(r=>!r.passed)));
}finally{await browser.close();}
