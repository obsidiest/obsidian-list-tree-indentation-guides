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
const earlier=Array.from({length:9},(_,i)=>`Earlier[^earlier${i}].`).join(' ');
const definitions=Array.from({length:9},(_,i)=>`[^earlier${i}]: Earlier note ${i}.`).join('\n')+'\n[^11]: Eleven.\n[^2]: Two.\n[^13]: Thirteen.\n[^12]: Twelve.';
const source=earlier+'\n\n- Testing paragraph[^11], sentence[^2].\n\n  Another paragraph.\n  - test[^13]\n    - book[^12]\n\n'+definitions;
const labels=page=>page.locator('.ltig-breadcrumb-label sup.footnote-ref').allTextContents();
async function hover(page,selector){const box=await page.locator(selector).last().boundingBox();await page.mouse.move(box.x+3,box.y+Math.min(10,box.height/2));await frames(page);}

for(const mode of ['livePreview','source'])test(`${mode}: retain the screenshot's nonsequential identifiers across ancestor rows`,async page=>{
  await page.evaluate(({source,mode})=>{ltigTest.setSettings({breadcrumbFieldActivation:true});ltigTest.setupEditor(source,mode);},{source,mode});
  await frames(page);await hover(page,'.cm-formatting-list');
  assert.deepEqual(await labels(page),['[^11]','[^2]','[^13]','[^12]']);
  assert.equal(await page.locator('.ltig-breadcrumb-label .footnotes').count(),0);
  if(mode==='livePreview')await page.screenshot({path:resolve(output,'breadcrumb-footnote-identifiers.png')});
  await page.locator('.ltig-breadcrumb-label a[data-footref="13"]').click();
  assert.deepEqual((await page.evaluate(()=>ltigTest.navigations)).at(-1),['#[^13]','Fixture.md',false]);
});

test('editor: named labels retain case and repeated references retain their identifier',async page=>{
  await page.evaluate(()=>{
    ltigTest.setSettings({breadcrumbFieldActivation:true});
    ltigTest.setupEditor('- First[^MiXeD], repeated[^mixed], numeric[^02].\n\n[^MiXeD]: A note.\n[^02]: Another note.','livePreview');
  });
  await frames(page);await hover(page,'.cm-formatting-list');
  assert.deepEqual(await labels(page),['[^MiXeD]','[^mixed]','[^02]']);
});

for(const mode of ['reading','livePreview'])test(`${mode} rendered surface: reuse displayed labels and repeated-reference suffixes`,async page=>{
  await page.evaluate(mode=>{
    ltigTest.setSettings({breadcrumbFieldActivation:true});
    // Deliberately differs from a source-order recount: the displayed host
    // labels are authoritative, including a repeat split across list items.
    const ref=(id,text)=>`<sup class="footnote-ref"><a class="footnote-link" data-footref="${id}">${text}</a></sup>`;
    ltigTest.addSurface({id:'list',mode,embed:true,file:'Folder/Embedded.md',
      text:'- Parent[^11].\n  - Child[^11], second[^2].\n\n[^11]: Eleven.\n[^2]: Two.',
      html:`<ul><li>Parent${ref('11','[8]')}.<ul><li id="leaf">Child${ref('11','[8-1]')}, second${ref('2','[9]')}.</li></ul></li></ul>`});
  },mode);
  await frames(page);await hover(page,'#leaf');
  assert.deepEqual(await labels(page),['[8]','[8-1]','[9]']);
  await page.locator('.ltig-breadcrumb-label a[data-footref="2"]').click();
  assert.deepEqual((await page.evaluate(()=>ltigTest.navigations)).at(-1),['#[^2]','Folder/Embedded.md',false]);
});

test('rendered surface: inline notes retain the host label alongside named references',async page=>{
  await page.evaluate(()=>{
    ltigTest.setSettings({breadcrumbFieldActivation:true});
    ltigTest.addSurface({id:'list',text:'- Named[^11], inline^[Inline note].\n\n[^11]: Eleven.',
      html:'<ul><li>Named<sup class="footnote-ref"><a class="footnote-link" data-footref="11">[6]</a></sup>, inline<sup class="footnote-ref"><a class="footnote-link" data-footref="[inline6" href="#fn-7">[7]</a></sup>.</li></ul>'});
  });
  await frames(page);await hover(page,'#list li');
  assert.deepEqual(await labels(page),['[6]','[7]']);
});

try{
  for(const {name,run} of tests){
    const page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(5000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      if(process.env.LTIG_OBSIDIAN_ASSETS)await loadHostMarkdown(page,process.env.LTIG_OBSIDIAN_ASSETS);
      await page.setContent(`<style>body{margin:20px;font:20px/1.5 Arial;--text-muted:#888;--p-spacing:20px}.cm-editor{height:850px!important}.markdown-rendered{padding:20px;width:800px}li{margin-block:10px}${css}</style><body></body>`);
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.evaluate(()=>{
        globalThis.ltigRenderMarkdown=async(_app,source,el)=>{
          if(globalThis.ltigHostMarkdown){el.innerHTML=globalThis.ltigHostMarkdown(source);return;}
          // Representative isolated renderer; optional mode uses the actual
          // Obsidian 1.14.4 parser above. Neither runs Obsidian desktop.
          const own=source.split(/\n(?=\[\^[^\]]+\]:)/)[0],numbers=new Map(),counts=new Map();let next=1;
          el.innerHTML=own.split(/\n\s*\n/).map(p=>'<p>'+p.replace(/\[\^([^\]]+)\]|\^\[([^\]]+)\]/g,(_match,id)=>{
            const key=id?.toLowerCase();if(key&&!numbers.has(key))numbers.set(key,next++);
            const number=key?numbers.get(key):next++,repeat=counts.get(key)||0;
            if(key)counts.set(key,repeat+1);
            return `<sup class="footnote-ref"><a class="footnote-link" href="#fn-${number}"${id?` data-footref="${id}"`:''}>[${number}${key&&repeat?'-'+repeat:''}]</a></sup>`;
          })+'</p>').join('');
        };
      });
      await run(page);assert.deepEqual(errors,[]);results.push({name,passed:true});
    }catch(error){results.push({name,passed:false,error:error.message});}
    finally{await page.close();}
    console.log(`${results.at(-1).passed?'PASS':'FAIL'} ${name}`);
  }
  await writeFile(resolve(output,process.env.LTIG_OBSIDIAN_ASSETS?'footnotes-host-1.14.4.json':'footnotes-2.0.4.json'),JSON.stringify({host:process.env.LTIG_OBSIDIAN_ASSETS?'Obsidian 1.14.4 parser/HTML transforms in Chromium; not Obsidian desktop':'Chromium and CodeMirror with a representative renderer; not Obsidian desktop',results},null,2));
  for(const failure of results.filter(r=>!r.passed))console.log(JSON.stringify(failure));
  assert(results.every(r=>r.passed),'Breadcrumb footnote regressions failed');
}finally{await browser.close();}
