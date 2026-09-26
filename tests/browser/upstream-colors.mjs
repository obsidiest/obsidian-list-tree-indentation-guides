import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { parse } from 'yaml';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
// Optional integration: the released Style Settings manager runs unmodified;
// only Obsidian storage/events and unused import/export modal classes are adapted.
const root=fileURLToPath(new URL('../../',import.meta.url));
const upstream=process.env.LTIG_STYLE_SETTINGS_SOURCE;
const chroma=process.env.LTIG_CHROMA_JS;
if(!upstream||!chroma)throw new Error('Set LTIG_STYLE_SETTINGS_SOURCE and LTIG_CHROMA_JS; see docs/validation-2.0.2.md.');
await mkdir(resolve(root,'release/browser'),{recursive:true});
const css=await readFile(root+'/styles.css','utf8');
const config=parse(css.match(/\/\* @settings([\s\S]*?)\*\//)[1]);
const bundle=await build({stdin:{contents:`import { CSSSettingsManager } from ${JSON.stringify(resolve(upstream,'src/SettingsManager.ts'))};import { StyleSettingsColors } from ${JSON.stringify(resolve(root,'src/style-settings-colors.ts'))};import ${JSON.stringify(resolve(root,'tests/browser/obsidian.mjs'))};globalThis.CSSSettingsManager=CSSSettingsManager;globalThis.StyleSettingsColors=StyleSettingsColors;`,resolveDir:root},bundle:true,format:'iife',write:false,alias:{'chroma-js':resolve(chroma),obsidian:root+'/tests/browser/obsidian.mjs'},plugins:[{name:'unused-upstream-dialogs',setup(b){b.onResolve({filter:/^\.\/(ExportModal|ImportModal)$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export class ExportModal{};export class ImportModal{};'}));}}]});
const browser=await chromium.launch({headless:true,executablePath:process.env.LTIG_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('http://ltig.test/**',route=>route.fulfill({body:'<html><body class="theme-dark css-settings-manager"></body></html>',contentType:'text/html'}));
await page.goto('http://ltig.test');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});
await page.evaluate(config=>{
 const plugin={saveData:async v=>{localStorage.setItem('settings',JSON.stringify(v));},loadData:async()=>JSON.parse(localStorage.getItem('settings')||'{}'),app:{workspace:{trigger:()=>{}}}};
 globalThis.manager=new globalThis.CSSSettingsManager(plugin);globalThis.manager.setConfig([config]);
 globalThis.colors=new globalThis.StyleSettingsColors(()=>globalThis.manager);
 globalThis.mount=()=>{
  document.getElementById('settings')?.remove();
  const row=document.body.createDiv({cls:'setting-item',attr:{'data-id':'ltig-breadcrumb-main-color',id:'settings'}});
  row.createDiv({cls:'setting-item-name',text:'Active list item color'});
  row.createDiv({cls:'setting-item-control'}).createDiv({cls:'themed-color-wrapper',text:'Pickr'});
  globalThis.colors.enhance(document);
 };
 globalThis.mount();
},config);
const results=[];
const broken=await page.evaluate(async()=>{
 globalThis.manager.settings['list-tree-indentation-guides@@ltig-breadcrumb-hover-color@@light']='#NaNNaNNaN';
 try { await globalThis.manager.setSettings({'list-tree-indentation-guides@@ltig-breadcrumb-main-color@@dark':'#13163c'}); return 'unexpected success'; }
 catch(error) { return error.message; }
});
console.log('CORRUPT SAVED COLOR BASELINE:',broken);
assert(broken.includes('unknown format'));


for(const [theme,hex]of[['dark','#13163c'],['light','#ab44ee']]){
 await page.getByLabel(`Active list item color (${theme}) picker`).click();
 await page.getByLabel('Hex color',{exact:true}).fill(hex);await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('dialog'));
 assert.equal(await page.evaluate(({theme})=>JSON.parse(localStorage.getItem('settings'))[`list-tree-indentation-guides@@ltig-breadcrumb-main-color@@${theme}`],{theme}),hex);
 await page.evaluate(theme=>{document.body.classList.remove('theme-dark','theme-light');document.body.classList.add('theme-'+theme);globalThis.mount();},theme);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--ltig-breadcrumb-main-color').trim()),hex);
 await page.getByLabel(`Active list item color (${theme}) picker`).click();assert.equal(await page.getByLabel('Hex color',{exact:true}).inputValue(),hex);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 results.push(`${theme} persisted, applied, closed, reopened`);
}
assert.equal(await page.evaluate(()=>globalThis.manager.settings['list-tree-indentation-guides@@ltig-breadcrumb-hover-color@@light']),'#e7edf8');
results.push('malformed stored LTIG color recovered on Save');
assert.deepEqual(errors,[]);
console.log(results);
await writeFile(root+'/release/browser/upstream-colors-2.0.2.json',JSON.stringify({styleSettings:'1.0.9, 4ebec6ae0131a9d5e8307bb5e26d59db5ba2e81c',storage:'localStorage adapter; not Obsidian disk save',browser:browser.version(),results},null,2));
await browser.close();
