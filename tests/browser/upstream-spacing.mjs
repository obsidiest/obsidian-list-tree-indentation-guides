import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {parse} from 'yaml';
import {loadHostMarkdown} from './host-markdown.mjs';

// Optional integration: real Style Settings persistence/CSS generation and
// Obsidian's isolated renderer. Storage and workspace events are adapted;
// this does not open the desktop app or the actual Style Settings UI.
const root=fileURLToPath(new URL('../../',import.meta.url));
const upstream=process.env.LTIG_STYLE_SETTINGS_SOURCE,chroma=process.env.LTIG_CHROMA_JS;
const assets=process.env.LTIG_OBSIDIAN_ASSETS,minimal=process.env.LTIG_MINIMAL_CSS;
if(!upstream||!chroma||!assets||!minimal)throw new Error('Set the integration paths documented in docs/validation-2.0.4.md.');
const css=await readFile(resolve(root,'styles.css'),'utf8');
const config=parse(css.match(/\/\* @settings([\s\S]*?)\*\//)[1]);
const managerBundle=await build({stdin:{contents:`import { CSSSettingsManager } from ${JSON.stringify(resolve(upstream,'src/SettingsManager.ts'))};globalThis.CSSSettingsManager=CSSSettingsManager;`,resolveDir:root},bundle:true,format:'iife',write:false,alias:{'chroma-js':resolve(chroma),obsidian:resolve(root,'tests/browser/obsidian.mjs')},plugins:[{name:'unused-dialogs',setup(b){b.onResolve({filter:/^\.\/(ExportModal|ImportModal)$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export class ExportModal{};export class ImportModal{};'}));}}]});
const fixture=await build({entryPoints:[resolve(root,'tests/browser/fixture.mjs')],bundle:true,format:'iife',write:false,alias:{obsidian:resolve(root,'tests/browser/obsidian.mjs')}});
const styles=[await readFile(resolve(assets,'app.css'),'utf8'),await readFile(minimal,'utf8'),css,
  'body{overflow:auto;padding:20px}.cm-editor{height:700px}'];
const browser=await chromium.launch({executablePath:process.env.LTIG_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const frames=page=>page.evaluate(()=>new Promise(r=>window.requestAnimationFrame(()=>window.requestAnimationFrame(r))));
const key='list-tree-indentation-guides@@ltig-breadcrumb-paragraph-spacing';
const toggle='list-tree-indentation-guides@@ltig-breadcrumb-custom-paragraph-spacing';
const metrics=page=>page.locator('.ltig-breadcrumb-label').evaluate(label=>{
  const [a,b]=label.querySelectorAll('p');
  return{gap:b.getBoundingClientRect().top-a.getBoundingClientRect().bottom,font:parseFloat(getComputedStyle(label).fontSize),value:getComputedStyle(label).getPropertyValue('--ltig-breadcrumb-paragraph-spacing').trim()};
});
const results=[];
try{
  for(const mode of ['livePreview','source','reading'])for(const shape of ['plain','wrapped','nested-wrapper','margin-reset']){
    const name=`${mode}/${shape}`,page=await browser.newPage({viewport:{width:1100,height:1000}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    try{
      await loadHostMarkdown(page,assets);
      await page.setContent('<body class="theme-dark css-settings-manager"></body>');
      for(const content of styles)await page.addStyleTag({content});
      await page.addScriptTag({content:fixture.outputFiles[0].text});
      await page.addScriptTag({content:managerBundle.outputFiles[0].text});
      await page.evaluate(({config,mode,shape})=>{
        localStorage.clear();
        globalThis.settingsPlugin={saveData:async value=>localStorage.setItem('settings',JSON.stringify(value)),loadData:async()=>JSON.parse(localStorage.getItem('settings')||'{}'),app:{workspace:{trigger:()=>{}}}};
        globalThis.manager=new globalThis.CSSSettingsManager(globalThis.settingsPlugin);globalThis.manager.setConfig([config]);
        globalThis.ltigRenderMarkdown=async(_app,text,el)=>{
          await globalThis.ltigHostRender(text,el);
          // Explicit adversarial postprocessors; these shapes are not claimed
          // to be Obsidian's ordinary output or the user's exact environment.
          if(shape==='wrapped')for(const paragraph of [...el.querySelectorAll(':scope > p')]){
            const wrapper=document.createElement('div');wrapper.className='el-p';paragraph.before(wrapper);wrapper.append(paragraph);
          }
          if(shape==='nested-wrapper'){
            const wrapper=document.createElement('div');wrapper.append(...el.childNodes);el.append(wrapper);
          }
          if(shape==='margin-reset')for(const paragraph of el.querySelectorAll('p'))paragraph.style.setProperty('margin-block','0','important');
        };
        const text='- First paragraph.\n\n  Second paragraph.';
        ltigTest.setSettings({breadcrumbFieldActivation:true});
        if(mode==='reading')ltigTest.addSurface({id:'list',text,html:'<ul><li><p>First paragraph.</p><p>Second paragraph.</p></li></ul>'});
        else ltigTest.setupEditor(text,mode);
      },{config,mode,shape});
      await frames(page);
      const box=await page.locator(mode==='reading'?'#list li':'.cm-formatting-list').boundingBox();
      await page.mouse.move(box.x+3,box.y+Math.min(10,box.height/2));await frames(page);
      const automatic=await metrics(page);
      for(const value of [0,1.375,4]){
        await page.evaluate(({key,toggle,value})=>globalThis.manager.setSettings({[toggle]:true,[key]:value}),{key,toggle,value});
        await frames(page);
        const actual=await metrics(page);
        assert.equal(actual.value,`${value}em`);
        assert(Math.abs(actual.gap-actual.font*value)<.1,JSON.stringify({name,value,actual}));
        assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem('settings'))[key],key),value);
      }
      await page.evaluate(async config=>{
        globalThis.manager.cleanup();globalThis.manager=new globalThis.CSSSettingsManager(globalThis.settingsPlugin);
        await globalThis.manager.load();globalThis.manager.setConfig([config]);globalThis.manager.initClasses();
      },config);
      await frames(page);
      const reloaded=await metrics(page);
      assert(Math.abs(reloaded.gap-reloaded.font*4)<.1,JSON.stringify({name,reloaded}));
      await page.evaluate(toggle=>globalThis.manager.setSettings({[toggle]:false}),toggle);await frames(page);
      assert(Math.abs((await metrics(page)).gap-automatic.gap)<.1,'disabling the toggle must restore automatic spacing');
      assert.deepEqual(errors,[]);results.push({name,passed:true});
    }catch(error){results.push({name,passed:false,error:error.message});}
    finally{await page.close();}
    console.log(`${results.at(-1).passed?'PASS':'FAIL'} ${name}`);
  }
  await mkdir(resolve(root,'release/browser'),{recursive:true});
  await writeFile(resolve(root,'release/browser/upstream-spacing-2.0.4.json'),JSON.stringify({styleSettings:'1.0.9, 4ebec6ae0131a9d5e8307bb5e26d59db5ba2e81c',theme:'Minimal 9.1.4, 93321bdc23fc879966e1e3aa0cfeda77012f540f',host:'Obsidian 1.14.4 isolated renderer/CSS; no desktop lifecycle or actual settings UI',storage:'localStorage adapter; not Obsidian disk save',browser:browser.version(),results},null,2));
  for(const failure of results.filter(result=>!result.passed))console.log(failure);
  assert(results.every(result=>result.passed),'Upstream spacing integration failed');
}finally{await browser.close();}
