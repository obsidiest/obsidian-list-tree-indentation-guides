import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "release/browser");
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: [resolve(root, "tests/browser/fixture.mjs")], bundle: true,
  write: false, format: "iife",
  alias: { obsidian: resolve(root, "tests/browser/obsidian.mjs") },
});
const css = await readFile(resolve(root, "styles.css"), "utf8");
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.LTIG_CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
const fixtures = [];
const test = (name, run) => fixtures.push({ name, run });
const frames = (page) => page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
async function hover(page, selector) {
  const point = await page.locator(selector).evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el.firstChild ?? el);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 6, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(point.x, point.y); await frames(page);
}
async function surface(page, options = {}) {
  await page.evaluate(options => ltigTest.addSurface({ id: "list", embed: true,
    html: "<p>Head:</p><ul><li>parent<ul><li>child</li></ul></li></ul>",
    text: "Head:\n- parent\n  - child", ...options }), options);
  await frames(page);
}

test("wrapped breadcrumb head clears its last text line", async page => {
  await page.evaluate(() => ltigTest.setupEditor("Long head: ".repeat(18) + "\n- parent\n  - child"));
  await frames(page); await hover(page, "#editor .cm-line:last-child");
  const bounds = await page.evaluate(() => {
    const p = document.querySelector(".ltig-breadcrumb-popover"), c = p.querySelector(".ltig-breadcrumb-content");
    return { bottom: p.querySelector(".ltig-breadcrumb-label").getBoundingClientRect().bottom - c.getBoundingClientRect().top,
      start: Number(p.querySelector(".ltig-breadcrumb-guide-path").getAttribute("d").split(" ")[2]) };
  });
  assert(bounds.start >= bounds.bottom - 0.01, JSON.stringify(bounds));
});
test("long live embed permits outer and inner wheel scrolling without content writes", async page => {
  await page.addStyleTag({ content: ".markdown-preview-view{height:100%;overflow-y:auto;scrollbar-gutter:stable}.inline-embed>.markdown-embed-content{height:fit-content;max-height:4000px;overflow:auto}.markdown-embed .markdown-preview-view{padding:0}" });
  await page.evaluate(() => { ltigTest.setSettings({ listHoverBreadcrumb: false }); ltigTest.setupEmbedEditor(); });
  await frames(page); await page.waitForTimeout(100);
  const initial = await page.evaluate(() => {
    globalThis.embedMutations = 0;
    new MutationObserver(records => globalThis.embedMutations += records.length).observe(document.querySelector("#widget-list"), {subtree:true, childList:true, attributes:true});
    return { height:ltigTest.editor().scrollDOM.scrollHeight, text:ltigTest.editor().state.doc.toString() };
  });
  // Inside a scrollable embed, wheel events correctly move its own scroller.
  await page.mouse.move(450,220); await page.mouse.wheel(0,420);
  await page.waitForTimeout(150); await frames(page);
  assert(await page.locator(".markdown-embed-content").evaluate(el => el.scrollTop) > 100);
  // The outer editor gutter scrolls the outer document. No wheel interception.
  await page.mouse.move(28,220); await page.mouse.wheel(0,420);
  await page.waitForTimeout(150); await frames(page);
  const after = await page.evaluate(() => ({ top:ltigTest.editor().scrollDOM.scrollTop, height:ltigTest.editor().scrollDOM.scrollHeight,
    mutations:globalThis.embedMutations, text:ltigTest.editor().state.doc.toString() }));
  assert(after.top > 100, JSON.stringify({...after,text:undefined}));
  assert.equal(after.text, initial.text);
  assert.equal(after.height, initial.height);
  assert.equal(after.mutations, 0, `idle embed writes: ${after.mutations}`);
});

test("threaded breadcrumb opens for a marked editor item with host SVG semantics", async page => {
  await page.evaluate(() => { ltigTest.setSettings({ breadcrumbThreading: true }); ltigTest.setupEditor("Head:\n1. parent\n   - child"); });
  await frames(page); await hover(page, "#editor .cm-line:last-child");
  assert.equal(await page.locator(".ltig-breadcrumb-thread-path").count(), 2);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
});
test("embed threads render with host SVG semantics", async page => {
  await page.evaluate(() => ltigTest.setSettings({ enableListThreading: true, listHoverBreadcrumb: false }));
  await surface(page); await hover(page, "#list ul ul li");
  assert.equal(await page.evaluate(() => ltigTest.overlay("list").querySelectorAll(".ltig-thread-path").length), 2);
});

test("hidden bullet placeholders do not displace checkbox guide endpoints", async page => {
  await page.addStyleTag({content: ".task-list-item > .list-bullet{display:none}.task-list-item-checkbox{width:24px;height:24px;margin-left:-36px;margin-right:16px}"});
  await surface(page, { html: '<ul><li class="task-list-item"><span class="list-bullet"></span><input type="checkbox" class="task-list-item-checkbox">Task<ul><li>Child</li></ul></li></ul>', text: null });
  const result = await page.evaluate(() => {
    const box = document.querySelector("#list input").getBoundingClientRect();
    const host = document.getElementById("list").getBoundingClientRect();
    const d = ltigTest.geometry("list").paths[0].d;
    return {left:box.left, end:Number(d.match(/H ([-.\d]+)/)[1])+host.left};
  });
  assert(result.end <= result.left - 3, JSON.stringify(result));
});
test("an embed-only list item anchors at its first line, not the embed midpoint", async page => {
  await surface(page, { html:'<ul><li><div class="internal-embed"><div class="markdown-rendered" id="nested"><ol><li>Nested one<ul><li>Nested child</li></ul></li></ol></div></div></li><li>After</li></ul>', text:null });
  const result = await page.evaluate(() => {
    const g=ltigTest.geometry("list");
    return {center:(g.items[0].marker.top+g.items[0].marker.bottom)/2, top:g.items[0].rect.top, firstLine:parseFloat(getComputedStyle(document.querySelector("#list > ul > li")).lineHeight), count:ltigTest.geometry("nested").paths.length};
  });
  assert(result.center <= result.top + result.firstLine, JSON.stringify(result));
  assert.equal(result.count, 2);
});

for (const mode of ["livePreview", "source", "reading"]) {
  test(`${mode} unmarked-head scope is independent of threading and respects both activation gates`, async page => {
    await page.evaluate(mode => {
      ltigTest.setSettings({enableListThreading:false, listThreadingFromNonListHead:false, breadcrumbThreadUnmarked:false,
        breadcrumbFieldActivation:false, breadcrumbMarkerActivation:true});
      if (mode === "reading") ltigTest.addSurface({id:"list", html:"<p>Head:</p><ol><li>Item</li></ol>",text:"Head:\n1. Item",embed:true});
      else ltigTest.setupEditor("Head:\n1. Item", mode);
    }, mode);
    await frames(page);
    const selector = mode === "reading" ? "#list > p" : "#editor .cm-line:first-child";
    const move = async gutter => {
      const p = await page.locator(selector).evaluate((el, gutter) => {
        const range = document.createRange(); range.selectNodeContents(el);
        const r=range.getClientRects()[0]; return {x:r.left + (gutter ? -15 : 12), y:(r.top+r.bottom)/2};
      },gutter);
      await page.mouse.move(p.x,p.y); await frames(page);
    };
    await move(false); assert.equal(await page.locator(".ltig-breadcrumb-popover").count(),0);
    await move(true); assert.equal(await page.locator(".ltig-breadcrumb-row").count(),1);
    await page.keyboard.press("Escape");
    await page.evaluate(() => ltigTest.setSettings({breadcrumbUnmarkedHeadActivation:false}));
    await move(false); await move(true); assert.equal(await page.locator(".ltig-breadcrumb-popover").count(),0);
    await page.evaluate(() => ltigTest.setSettings({breadcrumbUnmarkedHeadActivation:true,breadcrumbFieldActivation:true}));
    await move(false); assert.equal(await page.locator(".ltig-breadcrumb-popover").count(),1);
    await page.keyboard.press("Escape");
    await page.evaluate(() => ltigTest.setSettings({breadcrumbFieldActivation:false,breadcrumbMarkerActivation:false}));
    await move(true); await move(false); assert.equal(await page.locator(".ltig-breadcrumb-popover").count(),0);
  });
}
for (const mode of ["livePreview", "source", "reading"]) {
  test(`${mode} static unmarked heads are opt-in for ordered and unordered lists`, async page => {
    await page.evaluate(mode => {
      ltigTest.setSettings({listHoverBreadcrumb:false});
      const text="Ordered head:\n1. Item\n\nUnordered head:\n- Item";
      if (mode === "reading") ltigTest.addSurface({id:"list",html:"<p>Ordered head:</p><ol><li>Item</li></ol><p>Unordered head:</p><ul><li>Item</li></ul>",text,embed:true});
      else ltigTest.setupEditor(text,mode);
    },mode);
    const count=()=>page.locator(".ltig-head-guide-path").count();
    await frames(page); assert.equal(await count(),0);
    await page.evaluate(()=>ltigTest.setSettings({unmarkedListHeadStaticGuides:true}));
    await frames(page); assert.equal(await count(),2);
    await page.evaluate(()=>ltigTest.setSettings({connectSeparateListBlocks:true}));
    await frames(page); assert.equal(await count(),2);
    await page.evaluate(()=>ltigTest.setSettings({enableListStaticTreeIndentationGuides:false}));
    await frames(page); assert.equal(await count(),0);
  });
}

for (const marker of ["1.", "-"]) {
  test(`110 percent clears a wrapped ${marker} parent in the editor`, async page => {
    await page.evaluate(marker => {
      ltigTest.setSettings({enableListThreading:true,listHoverBreadcrumb:false});
      document.body.style.setProperty("--ltig-thread-connector-height","110%");
      ltigTest.setupEditor(`${marker} ${"Wrapped parent ".repeat(9)}\n    - child`);
    },marker);
    await frames(page); await hover(page,"#editor .cm-line:last-child");
    const result=await page.evaluate(()=>{
      const parent=document.querySelector("#editor .cm-line");
      const r=parent.querySelector(".cm-formatting-list").getBoundingClientRect();
      const svg=document.querySelector(".ltig-editor-overlay");
      const path=Array.from(svg.querySelectorAll(".ltig-thread-path")).at(-1);
      return {markerBottom:r.bottom,start:Number(path.getAttribute("d").split(" ")[2])+svg.getBoundingClientRect().top,
        rowBottom:parent.getBoundingClientRect().bottom, thickness:parseFloat(getComputedStyle(path).strokeWidth)};
    });
    assert(result.start-result.thickness/2 >= result.markerBottom,JSON.stringify(result));
    assert(result.start >= result.rowBottom-5, JSON.stringify(result));
  });
}

test("embed drawings follow surrounding layout changes and clip nested scrollports", async page => {
  await surface(page, {html:'<ul><li>Before<div class="internal-embed" style="height:140px;overflow:auto"><div class="markdown-rendered" id="nested"><ul><li>Nested parent<ul><li>Nested child</li></ul></li></ul></div></div></li></ul>',text:null});
  const initial=await page.evaluate(()=>{
    document.body.createDiv({attr:{id:"filler"},prepend:true});
    return {host:document.getElementById("list").getBoundingClientRect().top, layer:ltigTest.overlay("list").getBoundingClientRect().top};
  });
  await page.evaluate(()=>document.getElementById("filler").style.height="85px");
  await frames(page);
  const after=await page.evaluate(()=>{
    const host=document.getElementById("list");
    const nested=document.getElementById("nested");
    const layer=ltigTest.overlay("nested").getBoundingClientRect();
    const clip=nested.parentElement.getBoundingClientRect();
    return {host:host.getBoundingClientRect().top, layer:ltigTest.overlay("list").getBoundingClientRect().top,
      clipped:layer.top>=clip.top-.1 && layer.bottom<=clip.bottom+.1};
  });
  assert(Math.abs((after.host-initial.host)-(after.layer-initial.layer))<.1,JSON.stringify({initial,after}));
  assert(after.clipped,JSON.stringify(after));
});

for (const rtl of [false,true]) {
  test(`nested embeds keep visible bullet and checkbox clearance under scale (${rtl?"RTL":"LTR"})`, async page => {
    // Reproduce Obsidian's zero-width bullet box and hidden task placeholder.
    await page.addStyleTag({content:`.internal-embed{margin-inline-start:25px;border-inline-start:3px solid purple}
      .markdown-rendered{width:900px}.markdown-rendered .markdown-rendered{width:650px;padding:20px 60px}
      .markdown-rendered ul>li{list-style:none}.list-bullet{float:inline-start;margin-inline-start:-.8em;position:relative;display:inline-flex;justify-content:center;align-items:center}
      .list-bullet::before{content:'\\200B'}.list-bullet::after{content:'';position:absolute;width:.3em;height:.3em;border-radius:50%;background:#aaa}
      .task-list-item>.list-bullet{display:none}.task-list-item-checkbox{width:24px;height:24px;margin-inline-start:-36px;margin-inline-end:12px}
      .markdown-rendered ol{padding-inline-start:44px}`});
    await surface(page,{html:'<ul><li><span class="list-bullet"></span><div class="internal-embed"><div id="nested" class="markdown-rendered"><ol><li>Ideas:<ul><li><span class="list-bullet"></span>Subitem</li><li class="task-list-item"><span class="list-bullet"></span><input class="task-list-item-checkbox" type="checkbox">Task</li></ul></li></ol></div></div></li><li><span class="list-bullet"></span>After</li></ul>',text:null});
    await page.evaluate(rtl=>{
      const host=document.getElementById("list");
      host.style.transform="scale(.82)";host.style.transformOrigin="top left";
      host.style.direction=rtl?"rtl":"ltr";
      ltigTest.rendered.refresh(document);
    },rtl);
    await frames(page);
    const result=await page.evaluate(rtl=>{
      const g=ltigTest.geometry("nested"), svg=ltigTest.overlay("nested");
      const screen=svg.getScreenCTM();
      const connectors=g.paths.flatMap(p=>Array.from(p.d.matchAll(/M [-.\d]+ ([-.\d]+) H ([-.\d]+)/g),m=>new DOMPoint(Number(m[2]),Number(m[1])).matrixTransform(screen)));
      const clear=g.items.every(item=>connectors.some(p=>Math.abs(p.y-(item.marker.top+item.marker.bottom)/2)<.1 && (rtl?p.x>=item.marker.right+3:p.x<=item.marker.left-3)));
      const bullet=document.querySelector("#nested .list-bullet").getBoundingClientRect();
      return {clear,paths:g.paths.length,connectors:connectors.length,items:g.items.length,
        width:g.items[1].marker.width, bulletBoxWidth:bullet.width,
        hostOverlays:document.querySelectorAll(".internal-embed svg.ltig-rendered-overlay").length,
        layers:document.querySelectorAll(".ltig-embed-layer").length};
    },rtl);
    assert(result.clear,JSON.stringify(result));
    assert.equal(result.paths,2);assert.equal(result.connectors,3);assert.equal(result.items,3);
    assert(result.width>0);assert.equal(result.bulletBoxWidth,0);
    assert.equal(result.hostOverlays,0);assert.equal(result.layers,2);
    await page.screenshot({path:resolve(output,`nested-embed-${rtl?"rtl":"ltr"}.png`)});
  });
}

try {
  for (const { name, run } of fixtures) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    try {
      await page.setContent(`<style>body{margin:20px;background:#24272b;color:#ddd;font:20px/1.6 Arial;--text-muted:#888}.markdown-rendered{box-sizing:border-box;width:740px;padding:28px 65px;font-size:24px;line-height:2}.markdown-rendered li{margin:10px 0}.markdown-rendered ul{padding-left:44px}button{font:inherit}${css}</style><body class="theme-dark"></body>`);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(() => ltigTest.setSettings({ breadcrumbFieldActivation: true, breadcrumbNavigateBeforeTimeout: false }));
      await run(page); assert.deepEqual(errors, [], "No console or page errors");
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: error.message, console: errors });
    } finally { await page.close(); }
    console.log(`${results.at(-1).passed ? "PASS" : "FAIL"} ${name}`);
  }
  const report = { browser: browser.version(), host: "Chromium with real plugin modules and a minimal Obsidian adapter; not Obsidian desktop", results };
  await writeFile(resolve(output, process.argv.includes("--diagnose") ? "followup-diagnostic.json" : "followup-2.0.1.json"), JSON.stringify(report, null, 2));
  for (const failure of results.filter(r => !r.passed)) console.log(JSON.stringify(failure));
  if (!process.argv.includes("--diagnose")) assert(results.every(r => r.passed), "Regression scenarios failed");
} finally { await browser.close(); }
