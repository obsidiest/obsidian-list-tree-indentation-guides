import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {loadHostMarkdown} from './host-markdown.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(root,'release/browser');await mkdir(output,{recursive:true});
const bundle=await build({entryPoints:[resolve(root,'tests/browser/fixture.mjs')],bundle:true,write:false,format:'iife',alias:{obsidian:resolve(root,'tests/browser/obsidian.mjs')}});
const css=await readFile(resolve(root,'styles.css'),'utf8');
const browser=await chromium.launch({executablePath:process.env.LTIG_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const frames=page=>page.evaluate(()=>new Promise(r=>window.requestAnimationFrame(()=>window.requestAnimationFrame(r))));
const tests=[],results=[];
const test=(name,run)=>tests.push({name,run});
async function hover(page,selector){const box=await page.locator(selector).last().boundingBox();await page.mouse.move(box.x+4,box.y+Math.min(12,box.height/2));await frames(page);}
async function paragraphGap(page){return page.locator('.ltig-breadcrumb-label').last().evaluate(label=>{
  const [first,second]=label.querySelectorAll(':scope > p');
  return{gap:second.getBoundingClientRect().top-first.getBoundingClientRect().bottom,font:Number.parseFloat(getComputedStyle(label).fontSize)};
});}
async function firstGuideBounds(page,last=false){return page.evaluate(last=>{
  const c=document.querySelector('.ltig-breadcrumb-content'),label=c.querySelector('.ltig-breadcrumb-label'),svg=c.querySelector('svg');
  const range=document.createRange();range.selectNodeContents(label);
  const textBottom=Math.max(...[...range.getClientRects()].filter(r=>r.height>0).map(r=>r.bottom));
  const paths=[...svg.querySelectorAll('.ltig-breadcrumb-guide-path')],path=last?paths.at(-1):paths[0],point=path.getPointAtLength(0);
  const start=new DOMPoint(point.x,point.y).matrixTransform(svg.getScreenCTM());
  return{textBottom,startY:start.y,path:path.getAttribute('d'),stroke:getComputedStyle(path).stroke};
},last);}
const source='1. First paragraph with its own text.\n\n   A second paragraph with a separate thought.';

for(const mode of ['livePreview','source'])test(`${mode}: authored blank lines survive a zero Reading-mode paragraph margin`,async page=>{
  await page.evaluate(({source,mode})=>{ltigTest.setSettings({breadcrumbFieldActivation:true});ltigTest.setupEditor(source,mode);},{source,mode});
  await frames(page);
  const sourceGap=await page.locator('#editor .cm-line').nth(1).evaluate(line=>({height:line.getBoundingClientRect().height,font:Number.parseFloat(getComputedStyle(line).fontSize)}));
  await hover(page,'.cm-formatting-list');
  const popup=await paragraphGap(page);
  assert(sourceGap.height>0);
  assert(Math.abs(popup.gap/popup.font-sourceGap.height/sourceGap.font)<.04,JSON.stringify({sourceGap,popup}));
});

for(const spacing of [0,36])test(`Reading: preserve the originating note's ${spacing}px paragraph spacing`,async page=>{
  await page.evaluate(({source,spacing})=>{
    ltigTest.setSettings({breadcrumbFieldActivation:true});
    ltigTest.addSurface({id:'list',text:source,html:'<ol><li><p>First paragraph with its own text.</p><p>A second paragraph with a separate thought.</p></li></ol>'});
    document.getElementById('list').style.setProperty('--p-spacing',spacing+'px');
  },{source,spacing});
  await frames(page);
  const gap=await page.locator('#list li').evaluate(li=>{const [a,b]=li.querySelectorAll('p');return b.getBoundingClientRect().top-a.getBoundingClientRect().bottom;});
  await hover(page,'#list li');
  const popup=await paragraphGap(page);
  assert.equal(gap,spacing);
  assert(Math.abs(popup.gap-gap)<.1,JSON.stringify({note:gap,popup}));
});

for(const mode of ['livePreview','source','reading'])test(`${mode}: custom paragraph spacing supports zero and precise values, then restores automatic spacing`,async page=>{
  await page.evaluate(({source,mode})=>{
    ltigTest.setSettings({breadcrumbFieldActivation:true});
    const text=source+'\n   1. Child';
    if(mode==='reading')ltigTest.addSurface({id:'list',text,html:'<ol><li><p>First paragraph with its own text.</p><p>A second paragraph with a separate thought.</p><ol><li id="leaf">Child</li></ol></li></ol>'});
    else ltigTest.setupEditor(text,mode);
  },{source,mode});
  await frames(page);await hover(page,mode==='reading'?'#leaf':'.cm-formatting-list');
  const metrics=()=>page.locator('.ltig-breadcrumb-label').first().evaluate(label=>{
    const [first,second]=label.querySelectorAll(':scope > p');
    return{gap:second.getBoundingClientRect().top-first.getBoundingClientRect().bottom,
      font:parseFloat(getComputedStyle(label).fontSize),start:getComputedStyle(first).marginBlockStart,end:getComputedStyle(second).marginBlockEnd};
  });
  const automatic=await metrics();
  for(const value of [0,1.375,4]){
    await page.evaluate(value=>{document.body.classList.add('ltig-breadcrumb-custom-paragraph-spacing');document.body.style.setProperty('--ltig-breadcrumb-paragraph-spacing',value+'em');},value);
    await frames(page);await frames(page);
    const custom=await metrics();
    assert(Math.abs(custom.gap-custom.font*value)<.1,JSON.stringify({value,custom}));
    assert.equal(custom.start,'0px');assert.equal(custom.end,'0px');
    // The first path is the root's own marker connector. The last branch
    // belongs to its child and must start below the multi-paragraph parent.
    const bounds=await firstGuideBounds(page,true);
    assert(bounds.startY>=bounds.textBottom-.1,JSON.stringify(bounds));
  }
  await page.evaluate(()=>document.body.classList.remove('ltig-breadcrumb-custom-paragraph-spacing'));
  await frames(page);
  assert(Math.abs((await metrics()).gap-automatic.gap)<.1);
});

for(const rtl of [false,true])test(`late wrapped-parent growth clears guides when total popup size is unchanged (${rtl?'RTL':'LTR'})`,async page=>{
  await page.evaluate(rtl=>{
    document.body.style.direction=rtl?'rtl':'ltr';
    ltigTest.setSettings({breadcrumbFieldActivation:true});
    ltigTest.addSurface({id:'list',text:'This is an unmarked head. '.repeat(8)+'\n1. Parent paragraph.\n   1. Leaf',html:'<p>Head</p><ol><li>Parent<ol><li id="leaf">Leaf</li></ol></li></ol>'});
  },rtl);
  await frames(page);await hover(page,'#leaf');
  // A postprocessor reserves space, then redistributes it between two rows.
  // Their combined height remains unchanged, so observing only the content
  // container cannot detect this reflow.
  await page.locator('.ltig-breadcrumb-label').nth(1).evaluate(label=>label.style.minHeight='600px');
  await frames(page);
  const measured=await page.evaluate(()=>{
    const c=document.querySelector('.ltig-breadcrumb-content'),labels=c.querySelectorAll('.ltig-breadcrumb-label');
    const totalBefore=c.getBoundingClientRect().height,parentBefore=labels[0].getBoundingClientRect().height;
    labels[0].querySelector('p').append(' A late renderer expands this long paragraph into more wrapped lines.'.repeat(12));
    const growth=labels[0].getBoundingClientRect().height-parentBefore;
    labels[1].style.minHeight=(600-growth)+'px';
    return{growth,totalBefore,totalAfter:c.getBoundingClientRect().height};
  });
  assert(measured.growth>80,JSON.stringify(measured));
  assert(Math.abs(measured.totalAfter-measured.totalBefore)<.1,JSON.stringify(measured));
  await frames(page);await frames(page);
  const bounds=await firstGuideBounds(page);
  assert.notEqual(bounds.stroke,'none','the guide must be painted, not only have path data');
  assert(bounds.startY>=bounds.textBottom-.1,JSON.stringify({...bounds,...measured}));
  // Scrolling must preserve the same relation in screen coordinates.
  await page.locator('.ltig-breadcrumb-tree').evaluate(tree=>tree.scrollTop=40);await frames(page);
  const scrolled=await firstGuideBounds(page);
  assert(scrolled.startY>=scrolled.textBottom-.1,JSON.stringify(scrolled));
  await page.screenshot({path:resolve(output,`breadcrumb-reflow-${rtl?'rtl':'ltr'}.png`)});
});

try{
 for(const {name,run} of tests){
  const page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   if(process.env.LTIG_OBSIDIAN_ASSETS)await loadHostMarkdown(page,process.env.LTIG_OBSIDIAN_ASSETS);
   // The zero setting is valid in Minimal's Reading-mode paragraph-spacing
   // control. Source and Live Preview still contain visible empty editor lines.
   await page.setContent(`<style>*{box-sizing:border-box}body{margin:20px;background:#24272b;color:#ddd;font:24px/1.6 Arial;--p-spacing:0px;--text-muted:#aaa}.markdown-rendered p{margin-block:var(--p-spacing)}.markdown-rendered>:first-child{margin-top:0}.markdown-rendered>:last-child{margin-bottom:0}#editor{height:700px}.markdown-rendered{padding:20px;width:800px}li{margin-block:8px}${css}</style><body></body>`);
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.evaluate(()=>{
    globalThis.ltigRenderMarkdown=async(_app,source,el)=>{
      if(globalThis.ltigHostMarkdown)el.innerHTML=globalThis.ltigHostMarkdown(source);
      else for(const text of source.split(/\n\s*\n/))el.createEl('p',{text});
    };
   });
   await run(page);assert.deepEqual(errors,[]);results.push({name,passed:true});
  }catch(error){results.push({name,passed:false,error:error.message});}
  finally{await page.close();}
  console.log(`${results.at(-1).passed?'PASS':'FAIL'} ${name}`);
 }
 const result={host:process.env.LTIG_OBSIDIAN_ASSETS?'Chromium with Obsidian 1.14.4 parser; host desktop and postprocessors omitted':'Chromium and CodeMirror with paragraph-only renderer adapter; not Obsidian desktop',results};
 await writeFile(resolve(output,process.env.LTIG_OBSIDIAN_ASSETS?'layout-host-1.14.4.json':'layout-2.0.3.json'),JSON.stringify(result,null,2));
 for(const failure of results.filter(r=>!r.passed))console.log(JSON.stringify(failure));
 assert(results.every(r=>r.passed),'Breadcrumb layout regressions failed');
}finally{await browser.close();}
