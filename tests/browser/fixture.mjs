import { MarkdownView } from "obsidian";
import { EditorState, StateField, Compartment } from "@codemirror/state";
import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { RenderedListGuides } from "../../src/rendered-guides.ts";
import { ListBreadcrumb } from "../../src/list-breadcrumb.ts";
import { createBreadcrumbEditorExtension } from "../../src/breadcrumb-editor.ts";
import { createEditorGuidesExtension } from "../../src/editor-guides.ts";
import { renderedMarkerRect, firstTextRect } from "../../src/list-renderer.ts";
import { DEFAULT_SETTINGS } from "../../src/types.ts";
import { StyleSettingsPrecisionControls } from "../../src/style-settings-precision.ts";

const plugin = {
  settings: { ...DEFAULT_SETTINGS },
  app: {
    workspace: {
      iterateAllLeaves: (callback) => {
        if (view) callback({ view });
      },
      openLinkText: (...args) => {
        navigations.push(args);
        return Promise.resolve();
      },
    },
  },
};
let view = null,
  cm = null;
const navigations = [];
const rendered = new RenderedListGuides(() => plugin.settings);
const breadcrumb = new ListBreadcrumb(plugin, rendered);
const precision = new StyleSettingsPrecisionControls();
const editorOptions = new Compartment();

const lineDecorations = StateField.define({
  create: (s) => decorations(s),
  update: (value, t) => (t.docChanged ? decorations(t.state) : value),
  provide: (f) => EditorView.decorations.from(f),
});
function decorations(state) {
  const result = [];
  const indents = [];
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i),
      m = line.text.match(/^(\s*)([-+*]|\d+[.)])\s/);
    if (!m) continue;
    while (indents.length && indents.at(-1) >= m[1].length) indents.pop();
    indents.push(m[1].length);
    result.push(
      Decoration.line({
        class: `HyperMD-list-line HyperMD-list-line-${indents.length}`,
      }).range(line.from),
    );
    result.push(
      Decoration.mark({ class: "cm-formatting-list" }).range(
        line.from + m[1].length,
        line.from + m[1].length + m[2].length,
      ),
    );
  }
  return Decoration.set(result, true);
}
function setSettings(values) {
  Object.assign(plugin.settings, values);
  const classes = {
    "ltig-static-guides-enabled": "enableListStaticTreeIndentationGuides",
    "ltig-static-unmarked-head-enabled": "unmarkedListHeadStaticGuides",
    "ltig-list-threading-enabled": "enableListThreading",
    "ltig-thread-active-cursor-enabled": "activeCursorListThreading",
    "ltig-thread-active-item-enabled": "activeListItemThreading",
    "ltig-thread-all-branches-enabled": "allBranchesOfActiveListThreading",
    "ltig-thread-from-list-head-enabled": "listThreadingFromNonListHead",
    "ltig-thread-orphan-enabled": "activeOrphanListThreading",
    "ltig-thread-orphan-active-item-enabled": "activeOrphanListItemThreading",
    "ltig-thread-orphan-all-branches-enabled":
      "allBranchesOfActiveOrphanListThreading",
    "ltig-thread-live-preview-enabled": "listThreadingInLivePreview",
    "ltig-thread-source-mode-enabled": "listThreadingInSourceMode",
    "ltig-thread-reading-mode-enabled": "listThreadingInReadingMode",
    "ltig-live-preview-enabled": "renderInLivePreview",
    "ltig-source-mode-enabled": "renderInSourceMode",
    "ltig-reading-mode-enabled": "renderInReadingMode",
  };
  for (const [cls, key] of Object.entries(classes))
    document.body.classList.toggle(cls, plugin.settings[key]);
  rendered.refresh(document);
  breadcrumb.refresh();
}
function setupEditor(text, mode = "livePreview", extra = []) {
  const source = document.body.createDiv({
    cls: `markdown-source-view mod-cm6 ${mode === "livePreview" ? "is-live-preview" : ""}`,
  });
  source.id = "editor";
  view = new MarkdownView();
  view.containerEl = source;
  view.file = { path: "Fixture.md" };
  cm = new EditorView({
    parent: source,
    state: EditorState.create({
      doc: text,
      extensions: [
        editorOptions.of(extra),
        markdown(),
        lineDecorations,
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "350px" },
          ".cm-content": { padding: "30px 45px" },
          ".cm-line": { lineHeight: "2", fontSize: "24px" },
        }),
        createEditorGuidesExtension(),
        createBreadcrumbEditorExtension(breadcrumb),
      ],
    }),
  });
}
// Host-shaped marker widgets for geometry tests. In particular, the bullet's
// line box is much taller than its ::after glyph, and task bullets are hidden.
function setupMarkerEditor(text, mode = "livePreview") {
  class Marker extends WidgetType {
    constructor(token, task) { super(); this.token = token; this.task = task; }
    toDOM() {
      const el = document.createElement("span");
      el.className = `cm-formatting-list cm-formatting-list-${/^\d/.test(this.token) ? "ol" : "ul"}`;
      if (this.task) {
        el.innerHTML = `${/^\d/.test(this.token) ? `<span class="fixture-ordinal">${this.token}</span>` : '<span class="list-bullet" style="display:none"></span>'}<span class="task-list-label"><input type="checkbox" class="task-list-item-checkbox"></span>`;
      } else if (/^\d/.test(this.token)) el.textContent = this.token;
      else el.innerHTML = '<span class="list-bullet"></span>';
      return el;
    }
  }
  const markers = StateField.define({
    create: state => {
      const ranges = [];
      for (let i = 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i), m = line.text.match(/^(\s*)([-+*]|\d+[.)]) (\[[ xX]\] )?/);
        if (m) ranges.push(Decoration.replace({widget:new Marker(m[2], Boolean(m[3]))})
          .range(line.from + m[1].length, line.from + m[0].length - 1));
      }
      return Decoration.set(ranges, true);
    },
    update: value => value,
    provide: f => EditorView.decorations.from(f),
  });
  setupEditor(text, mode, mode === "livePreview" ? [markers] : []);
}
function addSurface({
  id,
  html,
  text,
  from = 0,
  to,
  file = "Embedded.md",
  mode = "reading",
  parent,
  embed = false,
}) {
  const outer = parent ? document.getElementById(parent) : document.body;
  const wrapper = outer.createDiv({
    cls:
      mode === "reading"
        ? "markdown-reading-view"
        : `markdown-source-view ${mode === "livePreview" ? "is-live-preview" : ""}`,
  });
  const container = embed
    ? wrapper.createDiv({ cls: "internal-embed markdown-embed" })
    : wrapper;
  const host = container.createDiv({
    cls: "markdown-preview-view markdown-rendered",
  });
  host.id = id;
  host.innerHTML = html;
  if (text)
    rendered.process(host, {
      sourcePath: file,
      getSectionInfo: () => ({
        text,
        lineStart: from,
        lineEnd: to ?? text.split("\n").length - 1,
      }),
    });
  rendered.observeDocument(document);
  rendered.refresh(document);
  breadcrumb.observeDocument(document);
  return id;
}
function geometry(id) {
  const host = document.getElementById(id);
  const box = host.getBoundingClientRect();
  return {
    width: host.clientWidth,
    height: host.clientHeight,
    scrollHeight: host.scrollHeight,
    items: Array.from(host.querySelectorAll("li"))
      .filter((e) => e.closest(".markdown-rendered") === host)
      .map((el) => ({
        text: firstTextRect(el)?.toJSON(),
        marker: renderedMarkerRect(el).toJSON(),
        rect: el.getBoundingClientRect().toJSON(),
      })),
    rect: box.toJSON(),
    paths: Array.from(rendered.overlayFor(host)?.querySelectorAll("path") ?? []).map(
      (p) => ({
        d: p.getAttribute("d"),
        cls: p.getAttribute("class"),
        stroke: getComputedStyle(p).stroke,
      }),
    ),
  };
}
setSettings({});
breadcrumb.observeDocument(document);
globalThis.ltigTest = {
  plugin,
  rendered,
  breadcrumb,
  precision,
  setSettings,
  setupEditor,
  setupMarkerEditor,
  setupEmbedEditor: () => {
    class Embed extends WidgetType {
      toDOM() {
        const wrapper = document.createElement("div");
        wrapper.className = "internal-embed markdown-embed inline-embed";
        const container = wrapper.createDiv({ cls: "markdown-embed-content" });
        const host = container.createDiv({ cls: "markdown-preview-view markdown-rendered", attr: { id: "widget-list" } });
        host.innerHTML = "<h5>Embedded heading</h5><ul>" + Array.from({length:40}, (_, i) => `<li>Item ${i}: wrapped text in a long embedded list with enough text to span several rows<ul><li>Child ${i}</li></ul></li>`).join("") + "</ul>";
        rendered.process(host, { sourcePath: "Embed.md", getSectionInfo: () => null });
        return wrapper;
      }
      ignoreEvent() { return true; }
    }
    const decoration = StateField.define({
      create: () => Decoration.set([Decoration.replace({widget:new Embed(), block:true}).range(0, 10)]),
      update: value => value,
      provide: f => EditorView.decorations.from(f),
    });
    setupEditor("![[Embed]]\n" + "Outer text\n".repeat(150), "livePreview", [decoration]);
  },
  addSurface,
  geometry,
  overlay: id => rendered.overlayFor(document.getElementById(id)),
  navigations,
  editor: () => cm,
  reconfigureEditor: () => cm.dispatch({ effects: editorOptions.reconfigure(EditorView.editable.of(true)) }),
  destroy: () => {
    breadcrumb.destroy();
    rendered.destroy();
    precision.stop();
    cm?.destroy();
  },
};
