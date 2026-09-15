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
  entryPoints: [resolve(root, "tests/browser/fixture.mjs")],
  bundle: true,
  write: false,
  format: "iife",
  alias: { obsidian: resolve(root, "tests/browser/obsidian.mjs") },
});
const css = await readFile(resolve(root, "styles.css"), "utf8");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.LTIG_CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.route("http://ltig.test/**", (route) =>
  route.fulfill({
    body: "<html><body></body></html>",
    contentType: "text/html",
  }),
);
await page.goto("http://ltig.test/");
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let count = 0;
const hostCSS = `body{margin:20px;background:#24272b;color:#ddd;font:20px/1.6 Arial;--text-muted:#888;--text-normal:#ddd;--background-primary:#24272b;--background-secondary:#202124;--background-modifier-border:#555;--interactive-accent:#9375ef;--text-accent:#b294ff;--background-modifier-hover:#41454a;--input-height:30px} .markdown-rendered{box-sizing:border-box;width:740px;padding:28px 65px;margin:10px 0;font-size:24px;line-height:2} .markdown-rendered li{margin:10px 0} .markdown-rendered ul,.markdown-rendered ol{padding-inline-start:44px} .markdown-rendered p{margin:25px 0} .markdown-embed{border-inline-start:3px solid #9375ef;margin-inline:30px} .markdown-embed .markdown-rendered{width:620px;padding:30px 55px;font-size:29px;line-height:2.5} .cm-editor{border:1px solid #555} button{font:inherit} .setting-item{display:flex;gap:10px} input{font:inherit}`;
async function reset(settings = {}) {
  await page.evaluate(() => globalThis.ltigTest?.destroy());
  await page.setContent(
    `<style>${hostCSS}\n${css}</style><body class="theme-dark ltig-show-unordered-list-bullets"></body>`,
  );
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate((s) => ltigTest.setSettings(s), settings);
}
const frames = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        ),
      ),
  );
async function surface(args) {
  await page.evaluate((a) => ltigTest.addSurface(a), args);
  await frames();
}
async function hover(selector, x = "text") {
  const p = await page.locator(selector).evaluate((el, x) => {
    const r = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el.childNodes[0] ?? el);
    const text = range.getBoundingClientRect();
    return {
      x: x === "gutter" ? r.left - 35 : text.left + 10,
      y: text.top + text.height / 2,
    };
  }, x);
  await page.mouse.move(p.x, p.y);
  await frames();
}
async function test(name, run) {
  await run();
  assert.deepEqual(errors, [], "browser errors");
  count++;
  console.log(`PASS ${name}`);
}
const fixture = {
  html: "<p>List head</p><ol><li>same<ul><li>child<ul><li>leaf</li></ul></li></ul></li><li>same</li></ol>",
  text: "List head\n1. same\n   - child\n     - leaf\n2. same",
};
try {
  await test("measured guides align with tight, loose, heading and block embed markers", async () => {
    await reset({ enableListThreading: true });
    await surface({ ...fixture, id: "normal" });
    await surface({ ...fixture, id: "embed", embed: true });
    for (const id of ["normal", "embed"]) {
      const g = await page.evaluate((id) => ltigTest.geometry(id), id);
      assert(g.paths.length >= 3);
      const ys = g.paths.flatMap((p) =>
        Array.from(p.d.matchAll(/M [-.\d]+ ([-.\d]+) H/g), (m) => Number(m[1])),
      );
      for (const item of g.items)
        assert(
          ys.some(
            (y) =>
              Math.abs(
                y + g.rect.top - (item.marker.top + item.marker.bottom) / 2,
              ) < 0.1,
          ),
          `${id} connector follows its marker`,
        );
    }
    await reset();
    await surface({
      id: "slice",
      embed: true,
      html: "<ul><li>child<ul><li>leaf</li></ul></li></ul>",
      text: fixture.text,
      from: 2,
      to: 3,
    });
    const g = await page.evaluate(() => ltigTest.geometry("slice"));
    assert.equal(g.items.length, 2);
    assert.equal(g.paths.length, 2);
    await page.screenshot({ path: resolve(output, "partial-embed.png") });
  });
  await test("nested embeds own separate overlays and do not connect to the host note", async () => {
    await reset({ connectSeparateListBlocks: true });
    await surface({ ...fixture, id: "outer" });
    const before = (await page.evaluate(() => ltigTest.geometry("outer")))
      .paths;
    await surface({
      ...fixture,
      id: "inner",
      embed: true,
      parent: "outer",
      file: "Other.md",
    });
    assert.deepEqual(
      (await page.evaluate(() => ltigTest.geometry("outer"))).paths,
      before,
    );
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => ltigTest.rendered.refresh(document));
      await frames();
    }
    const a = await page.evaluate(() => ltigTest.geometry("inner"));
    await frames();
    const b = await page.evaluate(() => ltigTest.geometry("inner"));
    assert.equal(a.scrollHeight, b.scrollHeight);
  });
  await test("height leaves ordered and unordered parent markers clear, and shortens independently", async () => {
    await reset({ enableListThreading: true, listHoverBreadcrumb: false });
    await surface({ ...fixture, id: "list" });
    await hover("#list ul ul li");
    const g = await page.evaluate(() => ltigTest.geometry("list"));
    const paths = g.paths.filter((p) => p.cls.includes("thread-path"));
    assert.equal(paths.length, 3);
    for (let i = 1; i < 3; i++) {
      const start = Number(paths[i].d.match(/^M [-.\d]+ ([-.\d]+)/)[1]);
      assert(start + g.rect.top >= g.items[i - 1].marker.bottom + 6 - 0.1);
    }
    await page.evaluate(() => {
      document.body.style.setProperty("--ltig-thread-connector-height", "50%");
      ltigTest.rendered.refresh(document);
    });
    await frames();
    const shorter = (
      await page.evaluate(() => ltigTest.geometry("list"))
    ).paths.filter((p) => p.cls.includes("thread-path"));
    assert(
      Number(shorter[1].d.split(" ")[2]) > Number(paths[1].d.split(" ")[2]),
    );
    await page.screenshot({ path: resolve(output, "thread-height.png") });
  });
  await test("default marker/gutter scope and full-row opt-in, current path and popup hover highlights", async () => {
    await reset();
    await surface({ ...fixture, id: "list" });
    await hover("#list ul ul li");
    assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
    await hover("#list ul ul li", "gutter");
    assert.equal(await page.locator(".ltig-breadcrumb-row").count(), 4);
    assert.equal(
      (
        await page.locator(".ltig-breadcrumb-row.is-current").innerText()
      ).replace(/\s+/g, " "),
      "• leaf",
    );
    await page.locator(".ltig-breadcrumb-row").nth(1).hover();
    assert.equal(
      await page.locator("#list > .ltig-breadcrumb-rendered-highlight").count(),
      1,
    );
    const highlight = await page
      .locator(".ltig-breadcrumb-rendered-highlight")
      .boundingBox();
    const parent = await page.locator("#list ol > li").first().boundingBox();
    assert(
      highlight.height < parent.height / 2,
      "preview highlights only the parent field",
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
    await page.evaluate(() =>
      ltigTest.setSettings({ breadcrumbFieldActivation: true }),
    );
    await hover("#list ul ul li");
    assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 1);
    await page.screenshot({ path: resolve(output, "breadcrumb.png") });
  });
  await test("partial embed breadcrumb includes source ancestors and clicks use their original source lines", async () => {
    await reset({ breadcrumbFieldActivation: true });
    await surface({
      id: "slice",
      embed: true,
      html: "<ul><li>child<ul><li>leaf</li></ul></li></ul>",
      text: fixture.text,
      from: 2,
      to: 3,
      file: "Original.md",
    });
    await hover("#slice ul ul li");
    assert.equal(await page.locator(".ltig-breadcrumb-row").count(), 4);
    await page.locator(".ltig-breadcrumb-row").nth(1).click();
    const nav = await page.evaluate(() => ltigTest.navigations);
    assert.equal(nav[0][0], "Original.md");
    assert.equal(nav[0][3].eState.line, 1);
  });
  await test("all-branches expansion, independent breadcrumb markers/guides/threading, and color namespaces", async () => {
    await reset({
      breadcrumbFieldActivation: true,
      breadcrumbThreading: true,
      breadcrumbThreadAll: true,
      enableListThreading: true,
    });
    await surface({ ...fixture, id: "list" });
    await hover("#list ul ul li");
    assert.equal(await page.locator(".ltig-breadcrumb-row").count(), 5);
    assert.equal(await page.locator(".ltig-breadcrumb-thread-path").count(), 3);
    await page.evaluate(() => {
      document.body.classList.add(
        "ltig-breadcrumb-thread-override-colors-enabled",
      );
      document.body.style.setProperty(
        "--ltig-breadcrumb-thread-override-color-dark",
        "#123456",
      );
    });
    assert.equal(
      await page
        .locator(".ltig-breadcrumb-thread-path")
        .first()
        .evaluate((el) => getComputedStyle(el).stroke),
      "rgb(18, 52, 86)",
    );
    assert.notEqual(
      await page
        .locator(".ltig-thread-path")
        .first()
        .evaluate((el) => getComputedStyle(el).stroke),
      "rgb(18, 52, 86)",
    );
    await page.evaluate(() =>
      ltigTest.setSettings({
        breadcrumbMarkers: false,
        breadcrumbGuides: false,
        breadcrumbThreading: false,
      }),
    );
    await hover("#list ul ul li");
    assert.equal(
      await page
        .locator(
          ".ltig-breadcrumb-list-marker, .ltig-breadcrumb-guide-path, .ltig-breadcrumb-thread-path",
        )
        .count(),
      0,
    );
  });
  for (const mode of ["livePreview", "source", "reading"])
    await test(`${mode} embedded rendering and breadcrumb mode gates`, async () => {
      await reset({ breadcrumbFieldActivation: true });
      await surface({ ...fixture, id: "list", embed: true, mode });
      await hover("#list ul ul li");
      assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 1);
      const key =
        mode === "livePreview"
          ? "breadcrumbLivePreview"
          : mode === "source"
            ? "breadcrumbSource"
            : "breadcrumbReading";
      await page.evaluate((key) => ltigTest.setSettings({ [key]: false }), key);
      await hover("#list ul ul li");
      assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
    });
  for (const mode of ["livePreview", "source"])
    await test(`${mode} CodeMirror hover, navigation, keyboard and caret threading`, async () => {
      await reset({
        breadcrumbFieldActivation: true,
        enableListThreading: true,
      });
      await page.evaluate(
        (mode) =>
          ltigTest.setupEditor(
            "List head\n1. parent\n   - child\n     1. leaf\n2. last",
            mode,
          ),
        mode,
      );
      await frames();
      await hover("#editor .cm-line:nth-child(4)");
      assert.equal(await page.locator(".ltig-breadcrumb-row").count(), 4);
      const before = await page.evaluate(
        () => ltigTest.editor().state.selection.main.head,
      );
      await page.locator(".ltig-breadcrumb-row").nth(1).hover();
      assert.equal(
        await page.evaluate(() => ltigTest.editor().state.selection.main.head),
        before,
      );
      await page.locator(".ltig-breadcrumb-row").nth(1).focus();
      await page.keyboard.press("End");
      assert.equal(
        await page
          .locator(".ltig-breadcrumb-row:focus")
          .getAttribute("data-index"),
        "3",
      );
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      assert.equal(
        await page.evaluate(
          () =>
            ltigTest
              .editor()
              .state.doc.lineAt(ltigTest.editor().state.selection.main.head)
              .number,
        ),
        2,
      );
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        ltigTest.setSettings({
          activeCursorListThreading: true,
          listHoverBreadcrumb: false,
        });
        const cm = ltigTest.editor();
        cm.dispatch({ selection: { anchor: cm.state.doc.line(4).to } });
        cm.focus();
      });
      await frames();
      assert.equal(
        await page.locator(".ltig-editor-overlay .ltig-thread-path").count(),
        3,
      );
      await page.mouse.move(1000, 850);
      await frames();
      assert.equal(
        await page.locator(".ltig-editor-overlay .ltig-thread-path").count(),
        3,
      );
    });
  await test("fallback/override colors and precise numerical controls survive reconstruction", async () => {
    await reset();
    await page.evaluate(() => {
      const ui = document.body.createDiv();
      ui.id = "settings";
      for (const prefix of ["ltig-", "ltig-breadcrumb-"])
        for (const kind of ["fallback", "override"])
          for (const mode of ["light", "dark"]) {
            const row = ui.createDiv({
              cls: "setting-item",
              attr: { "data-id": `${prefix}thread-${kind}-color-${mode}` },
            });
            const control = row.createDiv({ cls: "setting-item-control" });
            const input = control.createEl("input", { attr: { type: "text" } });
            input.value = "#888888";
            input.addEventListener("input", () =>
              localStorage.setItem(row.dataset.id, input.value),
            );
          }
      ltigTest.precision.start([document]);
    });
    await frames();
    assert.equal(
      await page.locator(".ltig-style-settings-color-input").count(),
      8,
    );
    await page
      .locator(".ltig-style-settings-color-input")
      .nth(7)
      .fill("#123456");
    const value = await page
      .locator("#settings input[type=text]")
      .nth(7)
      .inputValue();
    assert.equal(value, "#123456");
    await page.evaluate(() => {
      for (const row of document.querySelectorAll("#settings .setting-item")) {
        const control = row.querySelector(".setting-item-control");
        control.replaceChildren();
        const input = control.createEl("input", { attr: { type: "text" } });
        input.value = localStorage.getItem(row.dataset.id) ?? "#888888";
      }
      const row = document
        .querySelector("#settings")
        .createDiv({
          cls: "setting-item",
          attr: { "data-id": "ltig-thread-connector-height" },
        });
      const control = row.createDiv({ cls: "setting-item-control" });
      const slider = control.createEl("input", {
        attr: { type: "range", min: "0", max: "100", step: "1" },
      });
      slider.value = "100";
      slider.addEventListener("input", () =>
        localStorage.setItem("height", slider.value),
      );
    });
    await frames();
    assert.equal(
      await page
        .locator(".ltig-style-settings-color-input")
        .nth(7)
        .inputValue(),
      "#123456",
    );
    assert.equal(
      await page
        .locator(".ltig-style-settings-color-input")
        .nth(6)
        .inputValue(),
      "#888888",
    );
    await page.locator(".ltig-style-settings-number-input").fill("47.25");
    await page.locator(".ltig-style-settings-number-input").blur();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("height")),
      "47.25",
    );
  });
  await test("popover timers, wrapping, cleanup and no edits on hover", async () => {
    await reset({
      breadcrumbFieldActivation: true,
      globalBreadcrumbTimeoutSeconds: 0.06,
      breadcrumbNavigateBeforeTimeout: false,
    });
    await surface({
      id: "list",
      html: `<ul><li>${"A long list item ".repeat(20)}<ul><li>child</li></ul></li></ul>`,
    });
    await hover("#list ul ul li");
    const expanded = await page
      .locator(".ltig-breadcrumb-row")
      .first()
      .evaluate((e) => e.clientHeight);
    await page.evaluate(() =>
      ltigTest.setSettings({ breadcrumbExpandTitles: false }),
    );
    await hover("#list ul ul li");
    const collapsed = await page
      .locator(".ltig-breadcrumb-row")
      .first()
      .evaluate((e) => e.clientHeight);
    assert(expanded > collapsed);
    await page.mouse.move(1050, 10);
    await page
      .locator(".ltig-breadcrumb-popover")
      .waitFor({ state: "detached" });
    await page.evaluate(() => ltigTest.destroy());
    assert.equal(
      await page
        .locator(".ltig-rendered-overlay,.ltig-breadcrumb-popover")
        .count(),
      0,
    );
  });
  await test("blank-separated blocks join only under the corresponding toggle, with no extra active-item elbows", async () => {
    await reset({ listHoverBreadcrumb: false, enableListThreading: true });
    await surface({
      id: "blocks",
      html: "<ul><li>first<ul><li>one</li></ul></li><li>second<ul><li>two</li></ul></li></ul>",
      text: "- first\n  - one\n\n- second\n  - two",
    });
    await hover("#blocks > ul > li:nth-child(2) > ul > li");
    const base = await page.evaluate(() => ltigTest.geometry("blocks"));
    assert.equal(
      base.paths.filter((p) => p.cls.includes("guide-path")).length,
      4,
    );
    const original = base.paths.filter((p) => p.cls.includes("thread-path"));
    assert.equal(original.length, 2);
    await page.evaluate(() =>
      ltigTest.setSettings({
        threadBlankLineSeparatedListBlocksForActiveItem: true,
      }),
    );
    await frames();
    const joined = (
      await page.evaluate(() => ltigTest.geometry("blocks"))
    ).paths.filter((p) => p.cls.includes("thread-path"));
    assert.equal(joined.length, 2);
    assert(
      Number(joined[0].d.split(" ")[2]) < Number(original[0].d.split(" ")[2]),
    );
    await page.evaluate(() =>
      ltigTest.setSettings({ allBranchesOfActiveOrphanListThreading: true }),
    );
    await frames();
    assert.equal(
      (await page.evaluate(() => ltigTest.geometry("blocks"))).paths.filter(
        (p) => p.cls.includes("thread-path"),
      ).length,
      2,
    );
    await page.evaluate(() =>
      ltigTest.setSettings({
        threadBlankLineSeparatedListBlocksForAllBranches: true,
      }),
    );
    await frames();
    assert.equal(
      (await page.evaluate(() => ltigTest.geometry("blocks"))).paths.filter(
        (p) => p.cls.includes("thread-path"),
      ).length,
      3,
    );
  });
  await test("unmarked-head activation, exact-marker fallback, and marker clearance in CodeMirror", async () => {
    await reset({ breadcrumbFieldActivation: true, enableListThreading: true });
    await page.evaluate(() =>
      ltigTest.setupEditor("List head\n1. parent\n   - child\n     1. leaf"),
    );
    await frames();
    await hover("#editor .cm-line:first-child");
    assert.equal(await page.locator(".ltig-breadcrumb-row").count(), 1);
    await page.evaluate(() =>
      ltigTest.setSettings({ listThreadingFromNonListHead: false }),
    );
    await hover("#editor .cm-line:first-child");
    assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
    await page.evaluate(() =>
      ltigTest.setSettings({
        listThreadingFromNonListHead: true,
        breadcrumbFieldActivation: false,
        breadcrumbMarkerActivation: false,
      }),
    );
    await hover("#editor .cm-line:nth-child(4)", "gutter");
    assert.equal(await page.locator(".ltig-breadcrumb-popover").count(), 0);
    await page
      .locator("#editor .cm-line:nth-child(4) .cm-formatting-list")
      .hover();
    await frames();
    assert.equal(await page.locator(".ltig-breadcrumb-row").count(), 4);
    const safe = await page.evaluate(() => {
      const svg = document.querySelector(".ltig-editor-overlay");
      const origin = svg.getBoundingClientRect().top;
      const paths = Array.from(svg.querySelectorAll(".ltig-thread-path"));
      const markers = document.querySelectorAll("#editor .cm-formatting-list");
      return paths
        .slice(1)
        .every(
          (p, i) =>
            Number(p.getAttribute("d").split(" ")[2]) + origin >=
            markers[i].getBoundingClientRect().bottom +
              5.9,
        );
    });
    assert(safe);
  });
  await test("preview scrolling restores on Escape; timeout navigation retains focus without moving the caret", async () => {
    const text =
      "List head\n- parent\n" +
      Array.from({ length: 30 }, (_, i) => `  continuation ${i}`).join("\n") +
      "\n  - target";
    for (const after of [false, true]) {
      await reset({
        breadcrumbFieldActivation: true,
        breadcrumbNavigateAfterTimeout: after,
        globalBreadcrumbTimeoutSeconds: 0.04,
      });
      await page.evaluate((text) => {
        ltigTest.setupEditor(text);
        const cm = ltigTest.editor();
        cm.dispatch({ selection: { anchor: cm.state.doc.length } });
        cm.focus();
        cm.scrollDOM.scrollTop = cm.scrollDOM.scrollHeight;
      }, text);
      await frames();
      await hover("#editor .cm-line:last-child");
      assert.equal(await page.locator(".ltig-breadcrumb-row").count(), 3);
      const before = await page.evaluate(() => ({
        top: ltigTest.editor().scrollDOM.scrollTop,
        pos: ltigTest.editor().state.selection.main.head,
      }));
      await page.locator(".ltig-breadcrumb-row").first().hover();
      await frames();
      const preview = await page.evaluate(
        () => ltigTest.editor().scrollDOM.scrollTop,
      );
      assert(preview < before.top);
      if (after) {
        await page.mouse.move(1000, 850);
        await page
          .locator(".ltig-breadcrumb-popover")
          .waitFor({ state: "detached" });
      } else await page.keyboard.press("Escape");
      await frames();
      const result = await page.evaluate(() => ({
        top: ltigTest.editor().scrollDOM.scrollTop,
        pos: ltigTest.editor().state.selection.main.head,
        text: ltigTest.editor().state.doc.toString(),
      }));
      assert.equal(result.pos, before.pos);
      assert.equal(result.text, text);
      if (after) assert(result.top < before.top);
      else assert(Math.abs(result.top - before.top) < 2);
    }
  });
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(
      {
        browser: browser.version(),
        passed: count,
        errors,
        host: "Chromium fixtures with actual plugin modules and a minimal Obsidian adapter; not Obsidian desktop",
      },
      null,
      2,
    ),
  );
  console.log(`${count} browser scenarios passed (${browser.version()}).`);
} catch (error) {
  await page.screenshot({ path: resolve(output, "failure.png") });
  throw error;
} finally {
  await browser.close();
}
