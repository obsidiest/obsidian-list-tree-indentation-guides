import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { loadHostMarkdown } from './host-markdown.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'release/browser');
await mkdir(output, { recursive: true });
const bundle = await build({ entryPoints: [resolve(root, 'tests/browser/fixture.mjs')], bundle: true,
  write: false, format: 'iife', alias: { obsidian: resolve(root, 'tests/browser/obsidian.mjs') } });
const css = await readFile(resolve(root, 'styles.css'), 'utf8');
const browser = await chromium.launch({ headless: true, executablePath: process.env.LTIG_CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const results = [], fixtures = [];
const test = (name, run) => fixtures.push({ name, run });
const frames = page => page.evaluate(() => new Promise(r => window.requestAnimationFrame(() => window.requestAnimationFrame(r))));
const count = page => page.locator('.ltig-breadcrumb-popover').count();
const paragraph = 'A long continuation paragraph without a marker. '.repeat(8);
const source = `- First paragraph.\n\n  ${paragraph}\n\n  Third paragraph.\n  - Child`;

for (const mode of ['livePreview', 'source']) for (const marker of [false, true]) {
  test(`${mode}, marker scope ${marker}: continuation text never becomes a marker`, async page => {
    await page.evaluate(({source, mode, marker}) => {
      ltigTest.setSettings({ breadcrumbFieldActivation: false, breadcrumbMarkerActivation: marker });
      ltigTest.setupEditor(source, mode);
    }, {source, mode, marker});
    await frames(page);
    const line = page.locator('#editor .cm-line').nth(2);
    const pos = await line.evaluate(el => {
      const r = document.createRange(); r.selectNodeContents(el);
      const b = r.getClientRects()[0]; return { x: b.left + 80, y: (b.top+b.bottom)/2 };
    });
    await page.mouse.move(pos.x, pos.y); await frames(page);
    assert.equal(await count(page), 0, 'continuation text opened a breadcrumb');
    // Scope disabled still permits the real marker itself.
    const actual = await page.locator('.cm-formatting-list').first().boundingBox();
    await page.mouse.move(actual.x+actual.width/2, actual.y+actual.height/2); await frames(page);
    assert.equal(await count(page), 1, 'real list marker must remain active');
  });
}
for (const mode of ['livePreview', 'source']) test(`${mode}: full item scope still covers continuation paragraphs`, async page => {
  await page.evaluate(({source,mode}) => { ltigTest.setSettings({breadcrumbFieldActivation:true}); ltigTest.setupEditor(source, mode); }, {source,mode});
  await frames(page);
  const box=await page.locator('#editor .cm-line').nth(2).boundingBox();
  await page.mouse.move(box.x+200,box.y+16);await frames(page);
  assert.equal(await count(page),1);
});
test('Reading-mode breadcrumb paragraphs retain the originating note margins', async page => {
  await page.evaluate(() => {
    globalThis.ltigRenderMarkdown = async (_app, _source, el) => { el.innerHTML='<p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p>'; };
    ltigTest.setSettings({breadcrumbFieldActivation:true});
    ltigTest.addSurface({id:'list',text:'- First paragraph\n\n  Second paragraph\n\n  Third paragraph',html:'<ul><li><p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p></li></ul>'});
    document.body.createDiv({cls:'markdown-rendered',attr:{id:'reference'}}).innerHTML='<p>First paragraph</p><p>Second paragraph</p><p>Third paragraph</p>';
  });
  await frames(page);
  const box=await page.locator('#list li').first().boundingBox();
  await page.mouse.move(box.x+120,box.y+15);await frames(page);
  const gaps=await page.evaluate(()=>{
    const gap=selector=>{const p=[...document.querySelectorAll(selector)];return p[1].getBoundingClientRect().top-p[0].getBoundingClientRect().bottom;};
    return {note:gap('#reference p'),breadcrumb:gap('.ltig-breadcrumb-label p')};
  });
  assert(gaps.note>10);
  assert(Math.abs(gaps.note-gaps.breadcrumb)<.2,JSON.stringify(gaps));
});
for (const rtl of [false,true]) test(`nested callout native bullet: connector uses the outer marker (${rtl?'RTL':'LTR'})`, async page => {
  await page.addStyleTag({content:'#callout-item::marker{color:rgb(255,0,255)}'});
  await page.evaluate(rtl=>{
    ltigTest.setSettings({listHoverBreadcrumb:false,enableListThreading:true});
    ltigTest.addSurface({id:'list',html:`<div class="callout"><div class="callout-title">Examples</div><div class="callout-content"><ul><li>Ordinary item</li><li id="callout-item"><div class="callout"><div class="callout-title"><span class="callout-icon"><svg width="24" height="24"></svg></span></div><div class="callout-content"><p>A quotation in the callout body.</p><p>Attribution</p></div></div></li></ul></div></div>`});
    document.getElementById('list').style.direction=rtl?'rtl':'ltr';ltigTest.rendered.refresh(document);
  },rtl);
  await frames(page);const box=await page.locator('#callout-item').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+25);await frames(page);
  const m=await page.evaluate(()=>{
    const li=document.getElementById('callout-item'), title=li.querySelector('.callout-title').getBoundingClientRect();
    const items=ltigTest.geometry('list').items;
    const paths=ltigTest.geometry('list').paths;
    return {previous:items[0].marker,marker:items[1].marker,title:title.toJSON(),paths};
  });
  const center=(m.marker.top+m.marker.bottom)/2;
  assert(center>=m.title.top&&center<=m.title.bottom,JSON.stringify(m));
    assert(Math.abs(m.previous.left-m.marker.left)<1,JSON.stringify(m));
  assert(m.paths.some(p=>p.cls.includes('thread-path')));
  // Inspect the actual painted native marker, which has no DOM rectangle.
  // This check does not use the plugin's marker estimate as its reference.
  const screenshot=await page.screenshot({path:resolve(output,`callout-${rtl?'rtl':'ltr'}.png`)});
  const painted=await page.evaluate(async image=>{
    const img=new Image();img.src='data:image/png;base64,'+image;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,img.width,img.height).data;
    let left=Infinity,right=0,top=Infinity,bottom=0;
    for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){
      const i=(y*img.width+x)*4;
      if(data[i]>200&&data[i+1]<60&&data[i+2]>200){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    }
    const svg=ltigTest.overlay('list'),matrix=svg.getScreenCTM();
    const ends=[...svg.querySelectorAll('path')].map(path=>{
      const point=path.getPointAtLength(path.getTotalLength());
      const end=new DOMPoint(point.x,point.y).matrixTransform(matrix);return{x:end.x,y:end.y};
    });
    return{left,right,top,bottom,ends};
  },screenshot.toString('base64'));
  assert(Number.isFinite(painted.left),'native marker was not painted');
  for(const end of painted.ends){
    assert(end.y>=painted.top-1&&end.y<=painted.bottom+1,JSON.stringify(painted));
    assert(rtl?end.x>painted.right:end.x<painted.left,JSON.stringify(painted));
  }
});

for (const mode of ['livePreview','source','reading']) test(`${mode}: footnotes keep source context and superscript links`,async page=>{
  const text='Earlier[^a].\n\n- First paragraph[^b].\n\n  Second paragraph.\n\n[^a]: A note.\n[^b]: B note.';
  await page.evaluate(({text,mode})=>{
    globalThis.ltigRenderMarkdown=async(_app,source,el)=>{
      globalThis.renderedSource=source;
      if(globalThis.ltigHostMarkdown) el.innerHTML=globalThis.ltigHostMarkdown(source);
      else el.innerHTML=source.includes('[^b]: B note.')
        ? '<p>First paragraph<sup class="footnote-ref"><a class="footnote-link" href="#fn-1" data-footref="b">[1]</a></sup>.</p><p>Second paragraph.</p><section class="footnotes">B note.</section>'
        : '<p>First paragraphb.</p><p>Second paragraph.</p>';
    };
    ltigTest.setSettings({breadcrumbFieldActivation:true});
    if(mode==='reading')ltigTest.addSurface({id:'list',file:'Folder/Note.md',text,html:'<ul><li>First paragraph<sup class="footnote-ref"><a class="footnote-link" data-footref="b">[2]</a></sup>.<p>Second paragraph.</p></li></ul>'});
    else ltigTest.setupEditor(text,mode);
  },{text,mode});
  await frames(page);
  const box=await page.locator(mode==='reading'?'#list li':'.cm-formatting-list').first().boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await frames(page);
  assert.equal(await page.locator('.ltig-breadcrumb-label sup.footnote-ref').count(),1);
  assert.equal(await page.locator('.ltig-breadcrumb-label sup.footnote-ref').innerText(),mode==='reading'?'[2]':'[^b]');
  assert.equal(await page.locator('.ltig-breadcrumb-label .footnotes').count(),0);
  await page.locator('.ltig-breadcrumb-label a.footnote-link').click();
  assert.deepEqual((await page.evaluate(()=>ltigTest.navigations)).at(-1),['#[^b]',mode==='reading'?'Folder/Note.md':'Fixture.md',false]);
});

try {
  for (const {name,run} of fixtures) {
    const page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(4000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try {
      if(process.env.LTIG_OBSIDIAN_ASSETS)await loadHostMarkdown(page,process.env.LTIG_OBSIDIAN_ASSETS);
      await page.setContent(`<style>body{margin:20px;background:#24272b;color:#ddd;font:24px/1.6 Arial;--text-muted:#888;--p-spacing:24px}.cm-editor{height:850px!important}.markdown-rendered{width:780px;padding:20px 60px;box-sizing:border-box}.markdown-rendered p{margin-block:var(--p-spacing)}li{margin-block:10px}ul{padding-inline-start:48px}.callout{overflow:hidden;margin:1em 0;padding:12px 24px;background:#35393e}.callout-title{display:flex;line-height:1.3}.callout-icon{display:flex}.callout-icon::after{content:'\u200b'}.callout-content{overflow-x:auto}${css}</style><body></body>`);
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      await run(page);assert.deepEqual(errors,[]);results.push({name,passed:true});
    } catch(error) {results.push({name,passed:false,error:error.message});}
    finally {await page.close();}
    console.log(`${results.at(-1).passed?'PASS':'FAIL'} ${name}`);
  }
  await writeFile(resolve(output,process.env.LTIG_OBSIDIAN_ASSETS?'structure-host-1.14.4.json':'structure-2.0.3.json'),JSON.stringify({host:process.env.LTIG_OBSIDIAN_ASSETS?'Obsidian 1.14.4 parser/HTML transforms in Chromium; desktop startup omitted':'Chromium and CodeMirror fixtures; not Obsidian desktop',results},null,2));
  for(const result of results.filter(r=>!r.passed))console.log(JSON.stringify(result));
  assert(results.every(r=>r.passed),'Breadcrumb structure regressions failed');
} finally {await browser.close();}
