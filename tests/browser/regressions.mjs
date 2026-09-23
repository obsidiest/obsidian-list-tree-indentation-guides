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

test("editing with an open breadcrumb removes it and keeps the editor extension alive", async page => {
  await page.evaluate(() => ltigTest.setSettings({ breadcrumbThreading: true }));
  await page.evaluate(() => ltigTest.setupEditor("Head:\n- parent\n  - child"));
  await frames(page); await hover(page, "#editor .cm-line:last-child");
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 1);
  await page.evaluate(() => {
    const cm = ltigTest.editor(); cm.dispatch({ changes: { from: cm.state.doc.length, insert: "!" } });
  });
  await frames(page);
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
  await page.mouse.move(1080, 10); await hover(page, "#editor .cm-line:last-child");
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 1);
  assert.equal(await page.locator(".ltig-breadcrumb-thread-path").count(), 2);
  await page.mouse.click(1080, 10);
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
});
test("a clicked rendered breadcrumb still times out after the pointer leaves", async page => {
  await surface(page); await hover(page, "#list ul ul li");
  await page.locator(".ltig-breadcrumb-row").last().click();
  await page.mouse.move(1080, 10);
  await page.waitForFunction(() => !document.querySelector(".ltig-breadcrumb-popover"));
});
test("keyboard focus keeps the breadcrumb usable until Escape", async page => {
  await surface(page); await hover(page, "#list ul ul li");
  await page.mouse.move(1080, 10);
  // Reopen and focus synchronously before the short dismissal timer.
  await hover(page, "#list ul ul li");
  await page.locator(".ltig-breadcrumb-row").last().focus();
  await page.keyboard.press("ArrowUp");
  await frames(page);
  assert.equal(await page.locator(".ltig-breadcrumb-row:focus").getAttribute("data-index"), "1");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
});
test("reconfiguration and destruction dispose popovers without recursive updates", async page => {
  await page.evaluate(() => ltigTest.setupEditor("Head:\n- parent\n  - child"));
  await frames(page); await hover(page, "#editor .cm-line:last-child");
  await page.evaluate(() => ltigTest.reconfigureEditor()); await frames(page);
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
  assert.equal(await page.locator(".cm-line.ltig-breadcrumb-main-highlight").count(), 0);
  await page.mouse.move(1080, 10); await hover(page, "#editor .cm-line:last-child");
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 1);
  await page.evaluate(() => ltigTest.editor().destroy()); await frames(page);
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
});
test("replacing embed contents recreates the connected SVG", async page => {
  await surface(page);
  assert(await page.evaluate(() => ltigTest.overlay("list")?.querySelectorAll("path").length));
  await page.evaluate(() => {
    const host = document.getElementById("list");
    host.replaceChildren(...Array.from(host.children).filter(n => n.tagName !== "svg").map(n => n.cloneNode(true)));
  });
  await frames(page);
  assert.equal(await page.evaluate(() => ltigTest.overlay("list")?.isConnected), true);
  assert(await page.evaluate(() => ltigTest.overlay("list")?.querySelectorAll("path").length));
});
test("recycling an embed closes its stale breadcrumb and preserves literal DOM text", async page => {
  await surface(page); await hover(page, "#list ul ul li");
  await page.evaluate(() => document.getElementById("list").replaceChildren());
  await frames(page);
  assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
  await page.evaluate(() => {
    document.getElementById("list").innerHTML = "<ul><li>*literal* &amp;amp; :<ul><li>child</li></ul></li></ul>";
  });
  await frames(page); await hover(page, "#list ul ul li");
  assert.deepEqual(await page.locator(".ltig-breadcrumb-label").allTextContents(), ["*literal* &amp; :", "child"]);
});
test("a partially replaced list uses every visible row in DOM order", async page => {
  await page.evaluate(() => ltigTest.setSettings({ enableListThreading: true, breadcrumbThreading: true, breadcrumbThreadAll: true, allBranchesOfActiveListThreading: true }));
  await surface(page);
  await page.evaluate(() => {
    const list = document.querySelector("#list > ul");
    list.createEl("li", { text: "New first", prepend: true });
    list.createEl("li", { text: "New last" });
  });
  await frames(page); await hover(page, "#list > ul > li:last-child");
  assert.deepEqual(await page.locator(".ltig-breadcrumb-label").allTextContents(), ["Head:", "New first", "parent", "child", "New last"]);
  assert.equal(await page.evaluate(() => ltigTest.overlay("list").querySelectorAll(".ltig-thread-path").length), 2);
});
test("an embed mounted after postprocessing is discovered without a layout-change event", async page => {
  await page.evaluate(() => {
    const fragment = document.createDocumentFragment();
    const embed = fragment.createDiv({ cls: "internal-embed" });
    const host = embed.createDiv({ cls: "markdown-rendered", attr: { id: "late" } });
    host.innerHTML = "<ul><li>parent<ul><li>child</li></ul></li></ul>";
    ltigTest.rendered.process(host, { sourcePath: "Late.md", getSectionInfo: () => null });
    globalThis.mountLate = () => document.body.append(embed);
  });
  await frames(page); await page.evaluate(() => globalThis.mountLate()); await frames(page);
  assert(await page.evaluate(() => ltigTest.overlay("late")?.querySelectorAll("path").length));
});
test("ordinary outer scrolling does not rebuild unchanged embed paths", async page => {
  await surface(page);
  await page.evaluate(() => {
    globalThis.guideMutations = 0;
    new MutationObserver(records => globalThis.guideMutations += records.length)
      .observe(ltigTest.overlay("list"), { childList: true, subtree: true });
  });
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => document.dispatchEvent(new Event("scroll")));
    await frames(page);
  }
  assert.equal(await page.evaluate(() => globalThis.guideMutations), 0);
});
test("embed hover threading survives event interception inside a widget", async page => {
  await page.evaluate(() => ltigTest.setSettings({ enableListThreading: true, listHoverBreadcrumb: false }));
  await surface(page, { mode: "livePreview" });
  await page.evaluate(() => document.querySelector(".internal-embed").addEventListener("pointermove", event => event.stopPropagation()));
  await hover(page, "#list ul ul li");
  assert.equal(await page.evaluate(() => ltigTest.overlay("list").querySelectorAll(".ltig-thread-path").length), 2);
});
test("labels preserve punctuation while displaying inline Markdown", async page => {
  await page.evaluate(() => ltigTest.setupEditor("In `List Tree` version `2.0.0`:\n- Colon\\: &amp; &#58; C:\\\\Notes : emoji 🙂\n  - child"));
  await frames(page); await hover(page, "#editor .cm-line:last-child");
  const labels = await page.locator(".ltig-breadcrumb-label").allTextContents();
  assert.equal(labels[0], "In List Tree version 2.0.0:");
  assert.equal(labels[1], "Colon: & : C:\\Notes : emoji 🙂");
});
test("breadcrumb threading works with main threading disabled", async page => {
  await page.evaluate(() => ltigTest.setSettings({ breadcrumbThreading: true, enableListThreading: false }));
  await surface(page); await hover(page, "#list ul ul li");
  assert.equal(await page.locator(".ltig-breadcrumb-thread-path").count(), 2);
  const visible = await page.locator(".ltig-breadcrumb-thread-path").evaluateAll(paths => paths.every(p => {
    const s = getComputedStyle(p); const r = p.getBoundingClientRect();
    return s.stroke !== "none" && s.stroke !== "rgba(0, 0, 0, 0)" && Number(s.opacity) > 0 && r.width > 0 && r.height > 0;
  }));
  assert(visible);
});
test("breadcrumb threading retains independent mode and orphan gates", async page => {
  await page.evaluate(() => ltigTest.setSettings({ breadcrumbThreading: true, enableListThreading: false, breadcrumbGuides: false, enableListStaticTreeIndentationGuides: false }));
  await surface(page, { html: "<ol><li>parent<ol><li>child</li></ol></li><li>sibling</li></ol>", text: "1. parent\n   1. child\n2. sibling", mode: "livePreview" });
  await hover(page, "#list ol ol li");
  assert.equal(await page.locator(".ltig-breadcrumb-thread-path").count(), 2);
  await page.evaluate(() => ltigTest.setSettings({ breadcrumbThreadingLivePreview: false }));
  await page.mouse.move(1080, 10); await hover(page, "#list ol ol li");
  assert.equal(await page.locator(".ltig-breadcrumb-thread-path").count(), 0);
  await page.evaluate(() => ltigTest.setSettings({ breadcrumbThreadingLivePreview: true, breadcrumbThreadOrphanAll: true }));
  await page.mouse.move(1080, 10); await hover(page, "#list ol ol li");
  assert.equal(await page.locator(".ltig-breadcrumb-row").count(), 3);
  await page.evaluate(() => ltigTest.setSettings({ breadcrumbThreadOrphan: false }));
  await page.mouse.move(1080, 10); await hover(page, "#list ol ol li");
  assert.equal(await page.locator(".ltig-breadcrumb-thread-path").count(), 0);
});
test("connector height can increase beyond 100 percent", async page => {
  await page.evaluate(() => ltigTest.setSettings({ enableListThreading: true, listHoverBreadcrumb: false }));
  await surface(page); await hover(page, "#list ul ul li");
  const start = async () => Number((await page.evaluate(() => Array.from(ltigTest.overlay("list").querySelectorAll(".ltig-thread-path")).at(-1).getAttribute("d"))).split(" ")[2]);
  const normal = await start();
  await page.evaluate(() => { document.body.style.setProperty("--ltig-thread-connector-height", "150%"); ltigTest.rendered.refresh(document); });
  await frames(page); assert((await start()) < normal);
});
test("both height controls commit and reopen above the slider range", async page => {
  await page.evaluate(() => {
    const settings = document.body.createDiv({ attr: { id: "settings" } });
    globalThis.mountHeightControls = () => {
      settings.replaceChildren();
      for (const id of ["ltig-thread-connector-height", "ltig-breadcrumb-thread-connector-height"]) {
        const row = settings.createDiv({ cls: "setting-item", attr: { "data-id": id } });
        const control = row.createDiv({ cls: "setting-item-control" });
        const slider = control.createEl("input", { attr: { type: "range", min: "0", max: "500", step: "1" } });
        slider.value = document.body.style.getPropertyValue(`--${id}`).replace("%", "") || "100";
        slider.addEventListener("input", () => {
          document.body.style.setProperty(`--${id}`, `${slider.value}%`);
          row.dataset.saved = slider.value;
        });
      }
    };
    globalThis.mountHeightControls(); ltigTest.precision.start([document]);
  });
  await frames(page);
  for (const id of ["ltig-thread-connector-height", "ltig-breadcrumb-thread-connector-height"]) {
    const input = page.locator(`[data-id="${id}"] .ltig-style-settings-number-input`);
    await input.fill("725.25"); await input.blur();
    assert.equal(await page.locator(`[data-id="${id}"]`).getAttribute("data-saved"), "725.25");
  }
  await page.evaluate(() => globalThis.mountHeightControls()); await frames(page);
  assert.deepEqual(await page.locator(".ltig-style-settings-number-input").evaluateAll(inputs => inputs.map(i => i.value)), ["725.25", "725.25"]);
});

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
  await writeFile(resolve(output, process.argv.includes("--diagnose") ? "baseline-2.0.0.json" : "regressions-2.0.1.json"), JSON.stringify(report, null, 2));
  for (const failure of results.filter(r => !r.passed)) console.log(JSON.stringify(failure));
  if (!process.argv.includes("--diagnose")) assert(results.every(r => r.passed), "Regression scenarios failed");
} finally { await browser.close(); }
