import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=resolve(root,'release/browser');
await mkdir(output,{recursive:true});
const bundle=await build({entryPoints:[resolve(root,'tests/browser/fixture.mjs')],bundle:true,write:false,format:'iife',alias:{obsidian:resolve(root,'tests/browser/obsidian.mjs')}});
const css=await readFile(resolve(root,'styles.css'),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.LTIG_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const fixtures=[],results=[];
const test=(name,run)=>fixtures.push({name,run});
const frames=page=>page.evaluate(()=>new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve))));
async function hover(page,selector){
  const r=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.left+12,y:r.top+Math.min(15,r.height/2)};});
  await page.mouse.move(r.x,r.y);await frames(page);
}
for(const mode of ['livePreview','source','reading']) test(`${mode}: delegates intact math, SVG, Markdown, and source path to host renderer`,async page=>{
  await page.evaluate(mode=>{
    globalThis.calls=[];globalThis.cleaned=0;
    globalThis.ltigRenderMarkdown=async(app,source,el,file,component)=>{
      globalThis.calls.push({source,file,loaded:component.loaded});
      component.register(()=>globalThis.cleaned++);
      // Representative output supplied by the host adapter, not a MathJax test.
      el.innerHTML=source.includes('approx')?'<p><strong>Math:</strong> <span class="math"><mjx-container>≈</mjx-container></span></p>':source.includes('<svg')?source:'<p><a class="internal-link" data-href="Testing Document" href="Testing Document">Testing Document</a> <em>italic</em> <code>code:</code></p>';
    };
    const text='- **Math:** $\\approx$\n  - <svg width="20" height="20" viewBox="0 0 20 20"><path d="M1 1 H19 V19 Z" /></svg>\n    - [[Testing Document]] *italic* `code:`';
    if(mode==='reading') ltigTest.addSurface({id:'list',text,file:'Folder/Embedded.md',embed:true,html:'<ul><li>math<ul><li>svg<ul><li>link</li></ul></li></ul></li></ul>'});
    else ltigTest.setupEditor(text,mode);
  },mode);
  await frames(page);
  await hover(page,mode==='reading'?'#list ul ul ul li':'#editor .cm-line:last-child');
  await page.waitForFunction(()=>globalThis.calls.length===3);
  const calls=await page.evaluate(()=>globalThis.calls);
  assert(calls.every(c=>c.loaded&&c.file===(mode==='reading'?'Folder/Embedded.md':'Fixture.md')));
  assert.equal(calls[0].source,'**Math:** $\\approx$');
  assert(calls[1].source.startsWith('<svg'));
  assert.equal(calls[2].source,'[[Testing Document]] *italic* `code:`');
  assert.equal(await page.locator('.ltig-breadcrumb-label svg').count(),1);
  assert.equal(await page.locator('.ltig-breadcrumb-label mjx-container').count(),1);
  assert.equal(await page.locator('.ltig-breadcrumb-label strong').innerText(),'Math:');
  assert.equal(await page.locator('.ltig-breadcrumb-label a.internal-link').innerText(),'Testing Document');
  await page.locator('.ltig-breadcrumb-label a.internal-link').click();
  assert.deepEqual((await page.evaluate(()=>ltigTest.navigations)).at(-1),['Testing Document',mode==='reading'?'Folder/Embedded.md':'Fixture.md',false]);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.ltig-breadcrumb-popover').count(),0);
  assert.equal(await page.evaluate(()=>globalThis.cleaned),3);
});

test('late Markdown completion cannot revive a dismissed popup or retain render resources',async page=>{
  await page.evaluate(()=>{
    globalThis.pending=[];globalThis.cleaned=0;
    globalThis.ltigRenderMarkdown=async(_app,source,el,_file,component)=>{
      component.register(()=>globalThis.cleaned++);
      await new Promise(resolve=>globalThis.pending.push(resolve));
      el.textContent=source;
      // Obsidian's Component.unload is a no-op the second time. A late
      // registration must therefore be cleaned immediately by our render scope.
      component.register(()=>globalThis.cleaned++);
    };
    ltigTest.setupEditor('- parent\n  - child');
  });
  await frames(page);await hover(page,'#editor .cm-line:last-child');
  assert.equal(await page.evaluate(()=>globalThis.pending.length),2);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>globalThis.cleaned),2);
  await page.evaluate(()=>globalThis.pending.splice(0).forEach(resolve=>resolve()));
  await frames(page);
  assert.equal(await page.evaluate(()=>globalThis.cleaned),4);
  assert.equal(await page.locator('.ltig-breadcrumb-popover').count(),0);
  await page.evaluate(()=>{globalThis.ltigRenderMarkdown=undefined;});
  await page.mouse.move(1080,10);await hover(page,'#editor .cm-line:last-child');
  assert.equal(await page.locator('.ltig-breadcrumb-popover').count(),1);
});

test('a failed Markdown postprocessor leaves a dismissible, navigable text fallback',async page=>{
  await page.evaluate(()=>{
    globalThis.cleaned=0;
    globalThis.ltigRenderMarkdown=async(_app,_source,_el,_file,component)=>{
      component.register(()=>globalThis.cleaned++);
      throw new Error('A postprocessor failed');
    };
    ltigTest.setupEditor('- **Parent:**\n  - Child:');
  });
  await frames(page);await hover(page,'#editor .cm-line:last-child');
  assert.deepEqual(await page.locator('.ltig-breadcrumb-label').allTextContents(),['Parent:','Child:']);
  await page.locator('.ltig-breadcrumb-row').first().click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.ltig-breadcrumb-popover').count(),0);
  assert.equal(await page.evaluate(()=>globalThis.cleaned),2);
});

test('DOM fallback preserves rendered formatting, SVG, math, and literal punctuation without child duplication',async page=>{
  await page.evaluate(()=>ltigTest.addSurface({id:'list',embed:true,html:'<ul><li><strong>Parent:</strong> *literal* &amp; <svg width="20" height="20"><path d="M1 1 H19" /></svg><span class="math"><mjx-container>≈</mjx-container></span><ul><li>child</li></ul></li></ul>'}));
  await frames(page);await hover(page,'#list ul ul li');
  const label=page.locator('.ltig-breadcrumb-label').first();
  assert.equal(await label.locator('strong').innerText(),'Parent:');
  assert.equal(await label.locator('svg').count(),1);
  assert.equal(await label.locator('mjx-container').count(),1);
  assert((await label.textContent()).includes('*literal* &'));
  assert(!(await label.textContent()).includes('child'));
  assert.equal(await label.locator('ul').count(),0);
});

test('async wrapped rich labels redraw guides without overlapping the parent label',async page=>{
  await page.evaluate(()=>{
    globalThis.pending=[];
    globalThis.ltigRenderMarkdown=async(_app,source,el)=>{
      if(source==='Head') await new Promise(resolve=>globalThis.pending.push(resolve));
      el.innerHTML=source==='Head'?'<p><strong>'+('Wrapped heading: '.repeat(22))+'</strong></p>':'<p>'+source+'</p>';
    };
    ltigTest.setupEditor('Head\n- child\n  - leaf');
  });
  await frames(page);await hover(page,'#editor .cm-line:last-child');
  await page.evaluate(()=>globalThis.pending.forEach(resolve=>resolve()));
  await frames(page);await frames(page);
  const geometry=await page.locator('.ltig-breadcrumb-content').evaluate(content=>{
    const label=content.querySelector('.ltig-breadcrumb-label').getBoundingClientRect();
    const path=content.querySelector('.ltig-breadcrumb-guide-path')?.getAttribute('d');
    return {bottom:label.bottom-content.getBoundingClientRect().top,height:label.height,paths:[...content.querySelectorAll('path')].map(p=>p.getAttribute('d')),path};
  });
  assert(geometry.height>60);
  assert(geometry.paths.length>0&&geometry.paths.every(d=>!d.includes('NaN')));
  assert(Number(geometry.path.split(' ')[2])>=geometry.bottom-0.1, 'first spine must begin below the entire parent label');
});

// A controllable persistence adapter exercises failures and delayed storage.
// The optional upstream-manager driver uses Style Settings 1.0.9 itself.
async function colors(page){await page.evaluate(()=>{
  const values={},disk={};
  globalThis.colorStore={values,disk,getSetting:(_section,id)=>values['list-tree-indentation-guides@@'+id],async setSettings(update){
    if(this.fail==='sync') throw new Error('Save failed');
    await new Promise(resolve=>{if(this.delayed)this.resolve=resolve;else resolve();});
    if(this.fail) throw new Error('Save failed');
    Object.assign(values,update);Object.assign(disk,update);
    const style=document.getElementById('saved-colors');
    style.textContent=Object.entries(values).map(([key,value])=>{const [,id,theme]=key.split('@@');return `body.theme-${theme}{--${id}:${value};}`;}).join('\n');
  }};
  globalThis.colors=new ltigTest.StyleSettingsColors(()=>globalThis.colorStore);
  globalThis.mountColors=()=>{
    document.getElementById('settings')?.remove();
    const settings=document.body.createDiv({attr:{id:'settings'}});
    for(const id of ['ltig-breadcrumb-main-color','ltig-guide-color','other-plugin-color']){
      const row=settings.createDiv({cls:'setting-item',attr:{'data-id':id}});
      row.createDiv({cls:'setting-item-name',text:id});
      const control=row.createDiv({cls:'setting-item-control'});
      control.createDiv({cls:'themed-color-wrapper',text:'Upstream picker'});
    }
    globalThis.colors.enhance(document);
  };
  globalThis.mountColors();
});}
const colorRow='[data-id="ltig-breadcrumb-main-color"]';
const openColor=(page,theme='dark')=>page.locator(colorRow+` [aria-label$="(${theme}) picker"]`).click();
test('color Save persists the correct themed key, updates computed CSS, closes and survives reopening',async page=>{
  await colors(page);await openColor(page);
  assert.equal(await page.getByLabel('Hex color',{exact:true}).inputValue(),'#7aa2f7');
  await page.getByLabel('Hex color',{exact:true}).fill('#13163C');await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.ltig-color-dialog'));
  assert.equal(await page.evaluate(()=>globalThis.colorStore.disk['list-tree-indentation-guides@@ltig-breadcrumb-main-color@@dark']),'#13163c');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--ltig-breadcrumb-main-color').trim()),'#13163c');
  await page.evaluate(()=>globalThis.mountColors());await openColor(page);
  assert.equal(await page.getByLabel('Hex color',{exact:true}).inputValue(),'#13163c');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await openColor(page,'light');
  assert.equal(await page.getByLabel('Hex color',{exact:true}).inputValue(),'#4c78cc');
  assert.equal(await page.locator('[data-id="other-plugin-color"] .ltig-style-color-controls').count(),0);
});
test('color dialog awaits persistence and does not save twice',async page=>{
  await colors(page);await openColor(page);
  await page.evaluate(()=>globalThis.colorStore.delayed=true);
  await page.getByLabel('Hex color',{exact:true}).fill('#abcdef');await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal(await page.locator('.ltig-color-dialog[open]').count(),1);
  assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>globalThis.colorStore.disk),{});
  await page.evaluate(()=>globalThis.colorStore.resolve());
  await page.waitForFunction(()=>!document.querySelector('.ltig-color-dialog'));
});
test('saving repairs only malformed plugin colors and preserves valid saved values',async page=>{
  await colors(page);
  await page.evaluate(()=>Object.assign(globalThis.colorStore.values,{
    'list-tree-indentation-guides@@ltig-guide-color@@dark':'#NaNNaNNaN',
    'list-tree-indentation-guides@@ltig-breadcrumb-main-color@@light':'rgba(12, 34, 56, 0.5)',
    'another-plugin@@color@@dark':'#abcdef'
  }));
  await openColor(page);await page.getByLabel('Hex color',{exact:true}).fill('#abcd');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.ltig-color-dialog'));
  const values=await page.evaluate(()=>globalThis.colorStore.values);
  assert.equal(values['list-tree-indentation-guides@@ltig-guide-color@@dark'],'#888888');
  assert.equal(values['list-tree-indentation-guides@@ltig-breadcrumb-main-color@@dark'],'#aabbccdd');
  assert.equal(values['list-tree-indentation-guides@@ltig-breadcrumb-main-color@@light'],'rgba(12, 34, 56, 0.5)');
  assert.equal(values['another-plugin@@color@@dark'],'#abcdef');
  await openColor(page,'light');
  assert.equal(await page.getByLabel('Hex color',{exact:true}).inputValue(),'#0c223880');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
});
test('invalid colors remain editable; Default, Cancel, Escape and unload have explicit behavior',async page=>{
  await colors(page);await openColor(page);
  await page.getByLabel('Hex color',{exact:true}).fill('#NaNNaNNaN');await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal(await page.locator('.ltig-color-dialog[open]').count(),1);
  assert.deepEqual(await page.evaluate(()=>globalThis.colorStore.disk),{});
  await page.getByRole('button',{name:'Default',exact:true}).click();
  assert.equal(await page.getByLabel('Hex color',{exact:true}).inputValue(),'#7aa2f7');
  await page.getByLabel('Hex color',{exact:true}).fill('#ffffff');await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('.ltig-color-dialog'));
  assert.deepEqual(await page.evaluate(()=>globalThis.colorStore.disk),{});
  await openColor(page);await page.evaluate(()=>globalThis.colors.stop());await frames(page);
  assert.equal(await page.locator('.ltig-color-dialog').count(),0);
  assert.equal(await page.locator('.ltig-style-color-original').count(),0);
});
for(const failure of ['async','sync'])test(`${failure} save failure displays an error and allows retry`,async page=>{
  await colors(page);await openColor(page);
  await page.evaluate(failure=>{
    globalThis.colorStore.fail=failure;
    if(failure==='sync'){
      const original=globalThis.colorStore.setSettings.bind(globalThis.colorStore);
      globalThis.colorStore.setSettings=update=>{if(globalThis.colorStore.fail)throw new Error('Save failed');return original(update);};
    }
    globalThis.expectedErrors=1;
  },failure);
  await page.getByLabel('Hex color',{exact:true}).fill('#123abc');await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.ltig-color-dialog-status').textContent.startsWith('Could not save'));
  assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isEnabled(),true);
  await page.evaluate(()=>globalThis.colorStore.fail=false);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.ltig-color-dialog'));
});
try{
 for(const{name,run}of fixtures){
  const page=await browser.newPage({viewport:{width:1100,height:900}});page.setDefaultTimeout(6000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.setContent(`<style>body{margin:20px;background:#24272b;color:#ddd;font:20px/1.6 Arial;--text-muted:#888;--text-normal:#ddd;--background-primary:#24272b;--background-modifier-border:#555}.markdown-rendered{box-sizing:border-box;width:740px;padding:28px 65px;font-size:24px;line-height:2}.markdown-rendered li{margin:10px 0}.markdown-rendered ul{padding-left:44px}button{font:inherit}${css}</style><style id="saved-colors"></style><body class="theme-dark"></body>`);
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.evaluate(()=>ltigTest.setSettings({breadcrumbFieldActivation:true,breadcrumbNavigateBeforeTimeout:false}));
   await run(page);assert.deepEqual(errors,[]);
   results.push({name,passed:true});
  }catch(error){results.push({name,passed:false,error:error.message,console:errors});}
  finally{await page.close();}
  console.log(`${results.at(-1).passed?'PASS':'FAIL'} ${name}`);
 }
 await writeFile(resolve(output,'content-colors-2.0.2.json'),JSON.stringify({browser:browser.version(),host:'Chromium; Obsidian MarkdownRenderer output is supplied by an adapter. Not Obsidian desktop.',results},null,2));
 for(const fail of results.filter(r=>!r.passed))console.log(JSON.stringify(fail));
 assert(results.every(r=>r.passed),'Content/color regression scenarios failed');
}finally{await browser.close();}
