import { MarkdownView } from "obsidian";
import { EditorState, StateField } from "@codemirror/state";
import { EditorView, Decoration } from "@codemirror/view";
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

const lineDecorations = StateField.define({
  create: (s) => decorations(s),
  update: (value, t) => (t.docChanged ? decorations(t.state) : value),
  provide: (f) => EditorView.decorations.from(f),
});
function decorations(state) {
  const result = [];
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i),
      m = line.text.match(/^(\s*)([-+*]|\d+[.)])\s/);
    if (!m) continue;
    result.push(
      Decoration.line({
        class: `HyperMD-list-line HyperMD-list-line-${Math.floor(m[1].length / 2) + 1}`,
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
function setupEditor(text, mode = "livePreview") {
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
    paths: Array.from(host.querySelectorAll(":scope > svg > path")).map(
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
  addSurface,
  geometry,
  navigations,
  editor: () => cm,
  destroy: () => {
    breadcrumb.destroy();
    rendered.destroy();
    precision.stop();
    cm?.destroy();
  },
};
