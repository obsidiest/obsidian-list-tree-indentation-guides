import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Optional integration with a locally extracted, official Obsidian 1.14.4
// archive. No proprietary application assets are committed to this repository.
// The original parser/HTML transforms run unchanged; application startup is
// omitted because this is a browser fixture, not the Obsidian desktop app.
export async function loadHostMarkdown(page, directory) {
  await page.route('http://ltig-fixture.test/**', route => route.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));
  await page.goto('http://ltig-fixture.test/');
  const html = await readFile(resolve(directory, 'index.html'), 'utf8');
  for (const [,file] of html.matchAll(/src="([^"]+)"/g)) {
    if (file === 'app.js') continue;
    await page.addScriptTag({content:await readFile(resolve(directory,file),'utf8')});
  }
  let app = await readFile(resolve(directory,'app.js'),'utf8');
  const boundary = '!function(){y(this,void 0,void 0,(function(){var e,t,n,i,r,o,a,s,l,c,u,h,p,d;return';
  const offset = app.lastIndexOf(boundary);
  if (offset < 0) throw new Error('Expected Obsidian 1.14.4 startup boundary');
  app = app.slice(0,offset) + 'globalThis.ltigHostMarkdown=(source)=>fm(cm(source));})()})();';
  await page.addScriptTag({content:app});
  if (!(await page.evaluate(()=>typeof globalThis.ltigHostMarkdown === 'function')))
    throw new Error('Obsidian parser did not initialize');
}
