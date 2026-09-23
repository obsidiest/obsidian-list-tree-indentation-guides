import { EditorView, type ViewUpdate } from "@codemirror/view";
import { MarkdownView, sanitizeHTMLToDom, type Plugin } from "obsidian";
import { listLabel } from "./list-label";
import {
  breadcrumbEnabled,
  breadcrumbFeature,
  breadcrumbThreadOptions,
  breadcrumbTimeout,
  type ListMode,
} from "./breadcrumb-settings";
import {
  breadcrumbEntries,
  listNodeAtLine,
  parseListDocument,
  type ListNode,
} from "./list-model";
import {
  cssPixels,
  drawListTree,
  firstTextRect,
  listGeometry,
  pointWithinHost,
  type ListPoint,
} from "./list-renderer";
import {
  listBreadcrumbHighlight,
  type BreadcrumbEditorHost,
} from "./breadcrumb-editor";
import type { RenderedListGuides } from "./rendered-guides";
import type { ListTreeIndentationGuidesSettings } from "./types";

interface Host extends Plugin {
  settings: ListTreeIndentationGuidesSettings;
}
interface Target {
  nodes: ListNode[];
  index: number;
  element: HTMLElement;
  marker: DOMRect;
  row: DOMRect;
  host: HTMLElement;
  file: string;
  mode: ListMode;
  elements?: Map<number, HTMLElement>;
  cm?: EditorView;
  source?: unknown;
}
interface Popup {
  target: Target;
  element: HTMLElement;
  tree: HTMLElement;
  content: HTMLElement;
  svg: SVGSVGElement;
  rows: Map<number, HTMLButtonElement>;
  active: number;
  selected: number;
  hovered: number | null;
  restore: (() => void) | null;
  anchor: DOMRect;
  resize: ResizeObserver;
  lifecycle: MutationObserver;
  frame: number | null;
}
interface WindowState {
  doc: Document;
  popup: Popup | null;
  timer: number | null;
  abort: AbortController;
  pointer: { x: number; y: number } | null;
  highlighted: HTMLElement | null;
  highlightEditor: EditorView | null;
  keyboardFocus: boolean;
}
export function breadcrumbKeyboardTarget(
  key: string,
  index: number,
  length: number,
): number | null {
  if (!length) return null;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowUp") return Math.max(0, index - 1);
  if (key === "ArrowDown") return Math.min(length - 1, index + 1);
  return null;
}
export function inRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
export function activationContains(
  target: { marker: DOMRect; row: DOMRect; host: HTMLElement; unmarked?: boolean },
  x: number,
  y: number,
  field: boolean,
  marker: boolean,
): boolean {
  if (field)
    return (
      y >= target.row.top &&
      y <= target.row.bottom &&
      x >= target.host.getBoundingClientRect().left &&
      x <= target.host.getBoundingClientRect().right
    );
  if (marker) {
    const rtl =
      target.host.ownerDocument.defaultView?.getComputedStyle(target.host)
        .direction === "rtl";
    return (
      y >= target.row.top &&
      y <= target.row.bottom &&
      (rtl
        ? x >= (target.unmarked ? target.marker.right : target.marker.left) &&
          x <= target.host.getBoundingClientRect().right
        : x >= target.host.getBoundingClientRect().left &&
          x <= (target.unmarked ? target.marker.left : target.marker.right))
    );
  }
  return !target.unmarked && inRect(x, y, target.marker);
}

/** Adapted from Extended Headings 2.1.0. Source caches are scoped to open
 * editors; popover hover previews never edit text or add undo history. */
export class ListBreadcrumb implements BreadcrumbEditorHost {
  private readonly editors = new Map<
    EditorView,
    { doc: unknown; nodes: ListNode[] }
  >();
  private readonly documents = new Map<Document, WindowState>();
  constructor(
    private readonly plugin: Host,
    private readonly rendered: RenderedListGuides,
  ) {}
  addEditor(view: EditorView): void {
    this.editors.set(view, { doc: null, nodes: [] });
    this.observeDocument(view.dom.ownerDocument);
  }
  updateEditor(update: ViewUpdate): void {
    if (!update.docChanged && !update.transactions.some((t) => t.reconfigured))
      return;
    const state = this.documents.get(update.view.dom.ownerDocument);
    // ViewPlugin.update runs inside EditorView.update. Dispatching from cleanup
    // here crashes the view plugin and can strand its already-created dialog.
    if (state?.popup?.target.cm === update.view) {
      this.dismiss(state, false, update.view);
      if (!update.docChanged) this.deferEditorHighlightClear(update.view);
    }
  }
  removeEditor(view: EditorView): void {
    this.editors.delete(view);
    const state = this.documents.get(view.dom.ownerDocument);
    if (state?.popup?.target.cm === view) this.dismiss(state, false, view);
  }
  observeDocument(doc: Document): void {
    if (this.documents.has(doc) || !doc.defaultView) return;
    const abort = new doc.defaultView.AbortController();
    const state: WindowState = {
      doc,
      abort,
      popup: null,
      timer: null,
      pointer: null,
      highlighted: null,
      highlightEditor: null,
      keyboardFocus: false,
    };
    this.documents.set(doc, state);
    doc.addEventListener("pointermove", (e) => this.move(state, e), {
      passive: true,
      capture: true,
      signal: abort.signal,
    });
    doc.addEventListener(
      "pointerout",
      (e) => {
        if (!e.relatedTarget) {
          state.pointer = null;
          this.scheduleDismiss(state);
        }
      },
      { capture: true, signal: abort.signal },
    );
    doc.addEventListener(
      "keydown",
      (e) => {
        state.keyboardFocus = true;
        if (e.key === "Escape" && state.popup) {
          e.preventDefault();
          this.dismiss(state);
        }
      },
      { capture: true, signal: abort.signal },
    );
    doc.addEventListener(
      "pointerdown",
      (e) => {
        state.keyboardFocus = false;
        if (state.popup && !state.popup.element.contains(e.target as Node))
          this.dismiss(state);
      },
      { capture: true, signal: abort.signal },
    );
    doc.defaultView.addEventListener("blur", () => this.dismiss(state), {
      signal: abort.signal,
    });
    doc.defaultView.addEventListener("resize", () => this.dismiss(state), {
      signal: abort.signal,
    });
  }
  refresh(): void {
    for (const state of this.documents.values()) this.dismiss(state);
  }
  removeDocument(doc: Document): void {
    const state = this.documents.get(doc);
    if (state) {
      this.dismiss(state);
      state.abort.abort();
      this.documents.delete(doc);
    }
  }
  destroy(): void {
    for (const state of this.documents.values()) {
      this.dismiss(state);
      state.abort.abort();
    }
    this.documents.clear();
    this.editors.clear();
  }

  private viewFor(element: HTMLElement): MarkdownView | null {
    let found: MarkdownView | null = null;
    this.plugin.app.workspace.iterateAllLeaves((leaf) => {
      if (
        leaf.view instanceof MarkdownView &&
        leaf.view.containerEl.contains(element)
      )
        found = leaf.view;
    });
    return found;
  }
  private targetAt(event: PointerEvent): Target | null {
    const rendered = this.rendered.targetAt(event);
    if (rendered) return rendered;
    const element = event.target as HTMLElement | null;
    if (!element?.closest || element.closest(".internal-embed")) return null;
    const cm = [...this.editors.keys()].find((view) =>
      view.dom.contains(element),
    );
    if (!cm) return null;
    const source = cm.dom.closest<HTMLElement>(".markdown-source-view");
    const mode = source?.classList.contains("is-live-preview")
      ? "livePreview"
      : "source";
    if (!breadcrumbEnabled(this.plugin.settings, mode)) return null;
    const cache = this.editors.get(cm)!;
    if (cache.doc !== cm.state.doc) {
      cache.doc = cm.state.doc;
      cache.nodes = parseListDocument(cm.state.doc.toString());
    }
    const row = Array.from(
      cm.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
    ).find((line) => {
      if (line.closest(".cm-editor") !== cm.dom) return false;
      const r = line.getBoundingClientRect();
      return event.clientY >= r.top && event.clientY <= r.bottom;
    });
    if (!row) return null;
    let pos: number;
    try {
      pos = cm.posAtDOM(row);
    } catch {
      return null;
    }
    const line = cm.state.doc.lineAt(pos),
      index = listNodeAtLine(cache.nodes, line.number - 1);
    if (index === null || !line.text.trim()) return null;
    const node = cache.nodes[index];
    if (
      node.kind === "head" &&
      !this.plugin.settings.breadcrumbUnmarkedHeadActivation
    )
      return null;
    const markerEl = row.querySelector<HTMLElement>(
      ".list-bullet, .task-list-item-checkbox, .cm-formatting-list",
    );
    let marker =
      markerEl?.getBoundingClientRect() ??
      firstTextRect(row) ??
      row.getBoundingClientRect();
    const match = line.text.match(/^\s*(?:>\s*)*([-+*]|\d+[.)])\s/);
    if (match && (!markerEl || marker.width > 128)) {
      const start = cm.coordsAtPos(line.from + match[0].indexOf(match[1])),
        end = cm.coordsAtPos(line.from + match[0].length - 1);
      if (start && end)
        marker = new DOMRect(
          start.left,
          start.top,
          Math.max(1, end.right - start.left),
          start.bottom - start.top,
        );
    }
    return {
      nodes: cache.nodes,
      index,
      element: row,
      marker,
      row: row.getBoundingClientRect(),
      host: cm.dom,
      cm,
      source: cm.state.doc,
      file: this.viewFor(cm.dom)?.file?.path ?? "",
      mode,
    };
  }
  private move(state: WindowState, event: PointerEvent): void {
    state.keyboardFocus = false;
    state.pointer = { x: event.clientX, y: event.clientY };
    if (
      state.popup?.element.contains(event.target as Node) ||
      this.inCorridor(state)
    ) {
      this.cancelDismiss(state);
      return;
    }
    const target = this.plugin.settings.listHoverBreadcrumb
      ? this.targetAt(event)
      : null;
    if (
      !target ||
      !breadcrumbEnabled(this.plugin.settings, target.mode) ||
      (target.nodes[target.index].kind === "head" && !this.plugin.settings.breadcrumbUnmarkedHeadActivation) ||
      !activationContains(
        { ...target, unmarked: target.nodes[target.index].kind === "head" },
        event.clientX,
        event.clientY,
        this.plugin.settings.breadcrumbFieldActivation,
        this.plugin.settings.breadcrumbMarkerActivation,
      )
    ) {
      this.scheduleDismiss(state);
      return;
    }
    this.cancelDismiss(state);
    const previous = state.popup?.target;
    if (
      previous?.host === target.host &&
      previous.nodes === target.nodes &&
      previous.index === target.index
    )
      return;
    this.show(state, target);
  }
  private inCorridor(state: WindowState): boolean {
    const popup = state.popup,
      point = state.pointer;
    if (!popup || !point) return false;
    const rect = popup.element.getBoundingClientRect(),
      anchor = popup.anchor;
    // Only the gap toward the popup is protected; other list rows still switch targets.
    const source = popup.target.host.getBoundingClientRect();
    const left = Math.min(source.left, rect.left),
      right = Math.max(source.right, rect.right);
    const top = rect.top >= anchor.bottom ? anchor.bottom : rect.bottom;
    const bottom = rect.top >= anchor.bottom ? rect.top : anchor.top;
    return (
      point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
    );
  }
  private show(state: WindowState, target: Target): void {
    this.dismiss(state);
    const win = state.doc.defaultView;
    if (!win) return;
    const element = state.doc.body.createDiv({
      cls: "ltig-breadcrumb-popover",
      attr: { role: "dialog", "aria-label": "List hierarchy" },
    });
    element.classList.toggle(
      "ltig-breadcrumb-expand",
      this.plugin.settings.breadcrumbExpandTitles,
    );
    element.createDiv({ cls: "ltig-breadcrumb-title", text: "List hierarchy" });
    const tree = element.createDiv({
      cls: "ltig-breadcrumb-tree",
      attr: { role: "tree" },
    });
    const content = tree.createDiv({ cls: "ltig-breadcrumb-content" });
    const svg = content.createSvg("svg", {
      cls: "ltig-breadcrumb-guides",
      attr: { "aria-hidden": "true", width: "0", height: "0" },
    });
    const rows = new Map<number, HTMLButtonElement>();
    const options = breadcrumbThreadOptions(this.plugin.settings, target.mode);
    const indexes = breadcrumbEntries(target.nodes, target.index, options);
    const minDepth = Math.min(...indexes.map((i) => target.nodes[i].depth));
    for (const index of indexes) {
      const node = target.nodes[index];
      const row = content.createEl("button", {
        cls: "ltig-breadcrumb-row",
        attr: {
          type: "button",
          role: "treeitem",
          "aria-level": String(node.depth - minDepth + 1),
        },
      });
      row.dataset.index = String(index);
      row.tabIndex = index === target.index ? 0 : -1;
      row.style.setProperty(
        "--ltig-breadcrumb-depth",
        String(node.depth - minDepth),
      );
      row.classList.toggle("is-current", index === target.index);
      row.setAttribute("aria-current", String(index === target.index));
      row.setAttribute("aria-selected", String(index === target.index));
      if (this.plugin.settings.breadcrumbMarkers && node.kind !== "head")
        row.createSpan({
          cls: "ltig-breadcrumb-list-marker",
          text: node.marker,
          attr: { "aria-hidden": "true" },
        });
      const label = node.plainText ? node.text : listLabel(node.text, entity => sanitizeHTMLToDom(entity).textContent ?? entity);
      row.createSpan({
        cls: "ltig-breadcrumb-label",
        text: label,
      });
      row.setAttribute("aria-label", `${node.marker} ${label}`.trim());
      row.addEventListener("pointerenter", () => this.activate(state, index));
      row.addEventListener("focus", () => {
        this.cancelDismiss(state);
        this.activate(state, index);
      });
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.activate(state, index, true);
      });
      rows.set(index, row);
    }
    const resize = new win.ResizeObserver(() => this.scheduleDraw(state));
    // An embed can be recycled without an editor transaction or layout event.
    const lifecycle = new win.MutationObserver(() => {
      const connected = target.cm ? target.host.isConnected : target.element.isConnected;
      if (state.popup === popup && (!connected || !element.isConnected))
        this.dismiss(state);
    });
    const popup: Popup = {
      target,
      element,
      tree,
      content,
      svg,
      rows,
      active: target.index,
      selected: target.index,
      hovered: null,
      restore: null,
      anchor: target.row,
      resize,
      lifecycle,
      frame: null,
    };
    state.popup = popup;
    element.addEventListener("pointerenter", () => this.cancelDismiss(state));
    element.addEventListener("pointerleave", () => this.scheduleDismiss(state));
    element.addEventListener("focusout", () => this.scheduleDismiss(state));
    tree.addEventListener("keydown", (event) => {
      const position = breadcrumbKeyboardTarget(
        event.key,
        indexes.findIndex((i) => rows.get(i) === state.doc.activeElement),
        indexes.length,
      );
      if (position !== null) {
        event.preventDefault();
        rows.get(indexes[position])?.focus();
      }
    });
    resize.observe(content);
    lifecycle.observe(state.doc.body, { childList: true, subtree: true });
    this.draw(state);
    this.highlight(state, target.index);
    const current = rows.get(target.index);
    if (current) {
      const delta =
        current.getBoundingClientRect().bottom -
        tree.getBoundingClientRect().bottom;
      if (delta > 0) tree.scrollTop += delta;
    }
  }
  private activate(state: WindowState, index: number, select = false): void {
    const popup = state.popup;
    if (!popup) return;
    popup.active = index;
    popup.hovered = select ? null : index;
    if (select) {
      popup.selected = index;
      popup.restore = null;
    }
    for (const [i, row] of popup.rows) {
      row.classList.toggle("is-active", i === index);
      row.tabIndex = i === index ? 0 : -1;
      row.setAttribute("aria-selected", String(i === popup.selected));
    }
    this.highlight(state, index);
    if (select || this.plugin.settings.breadcrumbNavigateBeforeTimeout) {
      if (!select) popup.restore ??= this.captureScroll(popup.target);
      this.navigate(popup.target, index, select);
    }
    this.scheduleDraw(state);
  }
  private captureScroll(target: Target): () => void {
    if (target.cm) {
      const snapshot = target.cm.scrollSnapshot();
      return () => target.cm?.dispatch({ effects: snapshot });
    }
    const elements = new Map<HTMLElement, { top: number; left: number }>();
    for (let el: HTMLElement | null = target.host; el; el = el.parentElement)
      elements.set(el, { top: el.scrollTop, left: el.scrollLeft });
    return () => {
      for (const [el, pos] of elements)
        if (el.isConnected) {
          el.scrollTop = pos.top;
          el.scrollLeft = pos.left;
        }
    };
  }
  private navigate(target: Target, index: number, select: boolean): void {
    const node = target.nodes[index];
    if (!node) return;
    if (
      target.cm &&
      target.cm.state.doc === target.source &&
      node.line >= 0 &&
      node.line < target.cm.state.doc.lines
    ) {
      const line = target.cm.state.doc.line(node.line + 1);
      target.cm.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        ...(select ? { selection: { anchor: line.to } } : {}),
      });
      if (select) target.cm.focus();
      return;
    }
    const element = target.elements?.get(index);
    if (element?.isConnected) {
      element.scrollIntoView({ block: "nearest" });
      return;
    }
    // A transcluded heading/block can have ancestors outside its visible slice.
    // Hover only previews available content; clicking opens the correct source note.
    if (select && target.file && node.line >= 0) {
      void this.plugin.app.workspace.openLinkText(target.file, "", false, {
        eState: { line: node.line, focus: true },
      });
    }
  }
  private highlight(state: WindowState, index: number): void {
    this.clearHighlight(state);
    const target = state.popup?.target;
    if (!target) return;
    if (target.cm && target.nodes[index].line >= 0) {
      target.cm.dispatch({
        effects: listBreadcrumbHighlight.of(target.nodes[index].line),
      });
      state.highlightEditor = target.cm;
    } else {
      const element = target.elements?.get(index);
      if (element) {
        const rect = element.getBoundingClientRect();
        const child = Array.from(element.children).find((e) =>
          /^(UL|OL)$/.test(e.tagName),
        );
        const bottom = child
          ? Math.min(rect.bottom, child.getBoundingClientRect().top)
          : rect.bottom;
        const start = pointWithinHost(
          new DOMRect(rect.left, rect.top, 0, 0),
          target.host,
          1,
        );
        const end = pointWithinHost(
          new DOMRect(rect.right, bottom, 0, 0),
          target.host,
          1,
        );
        const highlight = this.rendered.highlight(target.host,
          new DOMRect(start.x, start.y, end.x - start.x, end.y - start.y));
        state.highlighted = highlight;
      }
    }
  }
  private clearHighlight(state: WindowState): void {
    const editor = state.highlightEditor;
    // Release references first; even a disposed editor must not prevent cleanup.
    state.highlighted?.remove();
    state.highlighted = null;
    state.highlightEditor = null;
    if (editor && this.editors.has(editor) && editor.dom.isConnected)
      editor.dispatch({ effects: listBreadcrumbHighlight.of(null) });
  }
  private deferEditorHighlightClear(editor: EditorView): void {
    editor.dom.ownerDocument.defaultView?.queueMicrotask(() => {
      const state = this.documents.get(editor.dom.ownerDocument);
      if (this.editors.has(editor) && editor.dom.isConnected && state?.highlightEditor !== editor)
        editor.dispatch({ effects: listBreadcrumbHighlight.of(null) });
    });
  }
  private scheduleDraw(state: WindowState): void {
    const popup = state.popup;
    if (!popup || popup.frame !== null) return;
    popup.frame =
      state.doc.defaultView?.requestAnimationFrame(() => {
        popup.frame = null;
        if (state.popup === popup) this.draw(state);
      }) ?? null;
  }
  private draw(state: WindowState): void {
    const p = state.popup,
      win = state.doc.defaultView;
    if (!p || !win) return;
    const geometry = listGeometry(p.element, true),
      points = new Map<number, ListPoint>();
    for (const [i, row] of p.rows) {
      const anchor = row.querySelector<HTMLElement>(
        ".ltig-breadcrumb-list-marker, .ltig-breadcrumb-label",
      )!;
      const point = pointWithinHost(
        firstTextRect(anchor) ?? anchor.getBoundingClientRect(),
        p.content,
        geometry.direction,
      );
      const label = row.querySelector<HTMLElement>(".ltig-breadcrumb-label")!;
      point.rowBottom = pointWithinHost(label.getBoundingClientRect(), p.content, geometry.direction).bottom;
      points.set(i, point);
    }
    const s = this.plugin.settings;
    drawListTree(
      p.svg,
      p.target.nodes,
      points,
      {
        guides: breadcrumbFeature(s, p.target.mode, "Guides"),
        connect: s.breadcrumbConnectSeparateListBlocks,
        threading: breadcrumbThreadOptions(s, p.target.mode),
        active: s.breadcrumbThreadSelected ? p.selected : p.active,
        breadcrumb: true,
      },
      geometry,
    );
    p.svg.setAttribute("width", String(p.content.offsetWidth));
    p.svg.setAttribute("height", String(p.content.offsetHeight));
    const gap = cssPixels(p.element, "--ltig-breadcrumb-anchor-gap", 8),
      edge = cssPixels(p.element, "--ltig-breadcrumb-viewport-gap", 8);
    const left = Math.max(
      edge,
      Math.min(p.anchor.left, win.innerWidth - p.element.offsetWidth - edge),
    );
    const below = p.anchor.bottom + gap;
    const top =
      below + p.element.offsetHeight <= win.innerHeight - edge
        ? below
        : Math.max(edge, p.anchor.top - p.element.offsetHeight - gap);
    p.element.style.left = `${left}px`;
    p.element.style.top = `${top}px`;
  }
  private cancelDismiss(state: WindowState): void {
    if (state.timer !== null) state.doc.defaultView?.clearTimeout(state.timer);
    state.timer = null;
  }
  private scheduleDismiss(state: WindowState): void {
    if (
      !state.popup ||
      state.timer !== null ||
      this.inCorridor(state) ||
      (state.keyboardFocus && state.popup.element.contains(state.doc.activeElement))
    )
      return;
    const p = state.popup;
    state.timer =
      state.doc.defaultView?.setTimeout(
        () => {
          state.timer = null;
          if (state.popup === p) this.dismiss(state, true);
        },
        breadcrumbTimeout(this.plugin.settings, p.target.mode),
      ) ?? null;
  }
  private dismiss(state: WindowState, timedOut = false, updatingEditor?: EditorView): void {
    this.cancelDismiss(state);
    const p = state.popup;
    state.popup = null;
    // DOM/lifecycle cleanup must complete before any editor operation can throw.
    if (p) {
      p.resize.disconnect();
      p.lifecycle.disconnect();
      if (p.frame !== null) state.doc.defaultView?.cancelAnimationFrame(p.frame);
      p.element.remove();
    }
    if (state.highlightEditor === updatingEditor) state.highlightEditor = null;
    this.clearHighlight(state);
    if (!p || updatingEditor) return;
    if (
      !p.target.host.isConnected ||
      (p.target.cm && p.target.cm.state.doc !== p.target.source)
    )
      return;
    if (
      timedOut &&
      this.plugin.settings.breadcrumbNavigateAfterTimeout &&
      p.hovered !== null
    )
      this.navigate(p.target, p.hovered, false);
    else p.restore?.();
  }
}
