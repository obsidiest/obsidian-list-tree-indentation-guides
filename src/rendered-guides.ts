import type { MarkdownPostProcessorContext } from "obsidian";
import { RenderedLayer } from "./rendered-layer";
import type { ListTreeIndentationGuidesSettings } from "./types";
import {
  isUnmarkedListHead,
  parseListDocument,
  type ListNode,
  type ListThreadOptions,
} from "./list-model";
import {
  drawListTree,
  firstTextRect,
  listGeometry,
  pointWithinHost,
  renderedMarkerRect,
  renderedMarkerGeometry,
  ownRowRect,
  type ListPoint,
} from "./list-renderer";
import type { ListMode } from "./breadcrumb-settings";

export interface RenderedListTarget {
  nodes: ListNode[];
  index: number;
  element: HTMLElement;
  marker: DOMRect;
  row: DOMRect;
  host: HTMLElement;
  file: string;
  mode: ListMode;
  elements: Map<number, HTMLElement>;
}
interface Registration {
  nodes: ListNode[];
  index: number;
  file: string;
}
interface Surface {
  host: HTMLElement;
  svg: SVGSVGElement;
  layer: RenderedLayer;
  redraw: boolean;
  elements: Map<number, HTMLElement>;
  indices: Map<HTMLElement, number>;
  nodes: ListNode[];
  file: string;
  active: number | null;
  frame: number | null;
  resize: ResizeObserver;
  dirty: boolean;
  points: Map<number, ListPoint>;
  geometry: ReturnType<typeof listGeometry> | null;
}
export function mainThreadOptions(
  s: ListTreeIndentationGuidesSettings,
  mode: ListMode,
): ListThreadOptions {
  return {
    enabled:
      s.enableListThreading &&
      (mode === "livePreview"
        ? s.listThreadingInLivePreview
        : mode === "source"
          ? s.listThreadingInSourceMode
          : s.listThreadingInReadingMode),
    active: s.activeListItemThreading,
    all: s.allBranchesOfActiveListThreading,
    unmarked: s.listThreadingFromNonListHead,
    orphan: s.activeOrphanListThreading,
    orphanActive: s.activeOrphanListItemThreading,
    orphanAll: s.allBranchesOfActiveOrphanListThreading,
    joinActive: s.threadBlankLineSeparatedListBlocksForActiveItem,
    joinAll: s.threadBlankLineSeparatedListBlocksForAllBranches,
  };
}
export function renderedMode(host: HTMLElement): ListMode {
  const source = host.closest(".markdown-source-view");
  return source
    ? source.classList.contains("is-live-preview")
      ? "livePreview"
      : "source"
    : "reading";
}
function owner(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>(".markdown-rendered");
}
function ownElements(host: HTMLElement, selector: string): HTMLElement[] {
  return [
    ...(host.matches(selector) ? [host] : []),
    ...Array.from(host.querySelectorAll<HTMLElement>(selector)),
  ].filter((element) => owner(element) === host);
}

/** One measured overlay per rendered Markdown surface, isolated from nested embeds. */
export class RenderedListGuides {
  private readonly surfaces = new Map<HTMLElement, Surface>();
  private readonly registrations = new WeakMap<HTMLElement, Registration>();
  private readonly documents = new Map<Document, () => void>();
  private readonly sourceCache = new Map<
    string,
    { text: string; nodes: ListNode[] }
  >();
  constructor(
    private readonly settings: () => ListTreeIndentationGuidesSettings,
  ) {}

  process(root: HTMLElement, context: MarkdownPostProcessorContext): void {
    const elements = [
      ...(root.matches("li") ? [root] : []),
      ...Array.from(root.querySelectorAll<HTMLElement>("li")),
    ];
    if (!elements.length) return;
    const info = context.getSectionInfo(root);
    if (info) {
      let cached = this.sourceCache.get(context.sourcePath);
      if (!cached || cached.text !== info.text) {
        cached = { text: info.text, nodes: parseListDocument(info.text) };
        if (this.sourceCache.size >= 16)
          this.sourceCache.delete(this.sourceCache.keys().next().value!);
        this.sourceCache.set(context.sourcePath, cached);
      }
      let cursor = 0;
      const items = cached.nodes.filter(
        (n) =>
          n.kind !== "head" &&
          n.line >= info.lineStart &&
          n.line <= info.lineEnd,
      );
      for (const element of elements) {
        if (
          element.closest(".internal-embed") !== root.closest(".internal-embed")
        )
          continue;
        const node = items[cursor++];
        if (node)
          this.registrations.set(element, {
            nodes: cached.nodes,
            index: node.index,
            file: context.sourcePath,
          });
      }
    }
    this.observeDocument(root.ownerDocument);
    // Registering one newly rendered section must not invalidate every open note.
    const hosts = new Set(elements.map(element => owner(element)));
    for (const host of hosts) if (host) this.refreshHost(host);
  }
  observeDocument(doc: Document): void {
    if (this.documents.has(doc) || !doc.defaultView) return;
    const move = (event: PointerEvent) => {
      const target = this.targetAt(event);
      for (const surface of this.surfaces.values()) {
        if (surface.host.ownerDocument !== doc) continue;
        const active = target?.host === surface.host ? target.index : null;
        if (surface.active !== active) {
          surface.active = active;
          this.schedule(surface);
        }
      }
    };
    const leave = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      for (const surface of this.surfaces.values()) {
        if (surface.host.ownerDocument !== doc || surface.active === null) continue;
        surface.active = null;
        this.schedule(surface);
      }
    };
    const bodyObserver = new doc.defaultView.MutationObserver(() =>
      this.refresh(doc),
    );
    bodyObserver.observe(doc.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    // Renderers may postprocess detached sections, replace an embed's contents,
    // or recycle the entire surface. Observe these transitions instead of
    // rediscovering and rebuilding every list on every outer scroll event.
    const contentObserver = new doc.defaultView.MutationObserver(records => {
      const affected = new Set<HTMLElement>();
      let removed = false;
      let layoutChanged = false;
      for (const record of records) {
        const element = record.target.nodeType === 1
          ? record.target as Element : record.target.parentElement;
        if (element?.closest(".ltig-embed-layer, .ltig-rendered-overlay, .ltig-breadcrumb-popover, .ltig-breadcrumb-rendered-highlight")) continue;
        if (record.type === "attributes") {
          layoutChanged = true;
          const host = element && owner(element);
          if (host) affected.add(host);
          if (host && host === element && !this.surfaces.has(host)) {
            const outer = host.parentElement && owner(host.parentElement);
            if (outer) affected.add(outer);
          }
          continue;
        }
        const changed = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
        if (record.type !== "characterData" && changed.length && changed.every(n =>
          n.nodeType === 1 && (n as Element).matches(".ltig-embed-layer, .ltig-rendered-overlay, .ltig-breadcrumb-rendered-highlight"))) {
          // An externally removed overlay needs reattachment; our own insertion does not.
          const host = element && owner(element);
          if (host && this.surfaces.has(host) && !this.surfaces.get(host)!.svg.isConnected) affected.add(host);
          continue;
        }
        layoutChanged = true;
        const host = element && owner(element);
        if (host) affected.add(host);
        for (const node of Array.from(record.addedNodes)) {
          if (node.nodeType !== 1) continue;
          const added = node as HTMLElement;
          if (added.matches(".markdown-rendered")) affected.add(added);
          for (const nested of Array.from(added.querySelectorAll<HTMLElement>(".markdown-rendered"))) affected.add(nested);
        }
        removed ||= record.removedNodes.length > 0;
      }
      if (removed) this.prune();
      for (const host of affected) this.refreshHost(host);
      // An edit above an embed can move it without changing its own dimensions.
      // Reposition external layers without rebuilding paths or writing into widgets.
      if (layoutChanged)
        for (const surface of this.surfaces.values())
          if (surface.host.ownerDocument === doc && surface.layer.portal)
            this.schedule(surface, false);
    });
    contentObserver.observe(doc.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["style", "class", "open"],
    });
    const scroll = (event: Event) => {
      for (const surface of this.surfaces.values()) {
        if (surface.host.ownerDocument !== doc || !surface.layer.portal) continue;
        const target = event.target;
        if (target === doc || (target instanceof doc.defaultView!.Element && target.contains(surface.host)))
          this.schedule(surface, false);
      }
    };
    doc.addEventListener("scroll", scroll, { passive: true, capture: true });
    doc.addEventListener("pointermove", move, { passive: true, capture: true });
    doc.addEventListener("pointerout", leave, { passive: true, capture: true });
    this.documents.set(doc, () => {
      doc.removeEventListener("scroll", scroll, true);
      bodyObserver.disconnect();
      contentObserver.disconnect();
      doc.removeEventListener("pointermove", move, true);
      doc.removeEventListener("pointerout", leave, true);
    });
    this.refresh(doc);
  }
  refresh(doc: Document): void {
    this.prune();
    for (const host of Array.from(doc.querySelectorAll<HTMLElement>(".markdown-rendered"))) this.refreshHost(host);
  }
  private prune(): void {
    for (const [host, surface] of this.surfaces)
      if (!host.isConnected) {
        this.remove(surface);
        this.surfaces.delete(host);
      }
  }
  private refreshHost(host: HTMLElement): void {
      const doc = host.ownerDocument;
      if (
        !host.isConnected ||
        host.closest(".ltig-breadcrumb-popover") ||
        !ownElements(host, "li").length
      ) {
        const stale = this.surfaces.get(host);
        if (stale) { this.remove(stale); this.surfaces.delete(host); }
        return;
      }
      let surface = this.surfaces.get(host);
      if (!surface && doc.defaultView) {
        host.classList.add("ltig-rendered-host");
        const layer = new RenderedLayer(host);
        const svg = layer.svg;
        const resize = new doc.defaultView.ResizeObserver(() => {
          surface!.dirty = true;
          this.schedule(surface!);
        });
        surface = {
          host,
          svg,
          layer,
          redraw: true,
          resize,
          nodes: [],
          elements: new Map(),
          indices: new Map(),
          file: "",
          active: null,
          frame: null,
          dirty: true,
          points: new Map(),
          geometry: null,
        };
        resize.observe(host);
        this.surfaces.set(host, surface);
      }
      if (surface) { surface.dirty = true; this.schedule(surface); }
  }
  targetAt(event: PointerEvent): RenderedListTarget | null {
    const element = event.target as HTMLElement | null;
    if (!element?.closest || element.closest(".ltig-breadcrumb-popover"))
      return null;
    const host = owner(element),
      surface = host && this.surfaces.get(host);
    if (!surface) return null;
    const direct = element.closest<HTMLElement>("li, p");
    const directIndex = direct ? surface.indices.get(direct) : undefined;
    const directRect = direct?.getBoundingClientRect();
    const childList = direct && Array.from(direct.children).find(e => /^(UL|OL)$/.test(e.tagName));
    const directBottom = childList?.getBoundingClientRect().top ?? directRect?.bottom;
    const inDirectRow = directRect && directBottom !== undefined && event.clientY >= directRect.top && event.clientY <= directBottom;
    let candidate: {
      index: number;
      element: HTMLElement;
      marker: DOMRect;
      row: DOMRect;
    } | null = null;
    const candidates =
      directIndex !== undefined && direct && inDirectRow
        ? [[directIndex, direct] as const]
        : surface.elements;
    for (const [index, rowElement] of candidates) {
      const rect = rowElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const node = surface.nodes[index];
      const children = Array.from(rowElement.children).filter((e) =>
        /^(UL|OL)$/.test(e.tagName),
      );
      const bottom = children.length
        ? Math.min(rect.bottom, children[0].getBoundingClientRect().top)
        : rect.bottom;
      if (event.clientY < rect.top || event.clientY > bottom) continue;
      if (!candidate || node.depth >= surface.nodes[candidate.index].depth)
        candidate = {
          index,
          element: rowElement,
          marker: renderedMarkerRect(rowElement),
          row: new DOMRect(rect.left, rect.top, rect.width, bottom - rect.top),
        };
    }
    return candidate
      ? {
          ...candidate,
          nodes: surface.nodes,
          file: surface.file,
          host: surface.host,
          mode: renderedMode(surface.host),
          elements: surface.elements,
        }
      : null;
  }
  destroy(): void {
    for (const cleanup of this.documents.values()) cleanup();
    this.documents.clear();
    for (const surface of this.surfaces.values()) this.remove(surface);
    this.surfaces.clear();
    this.sourceCache.clear();
  }
  removeDocument(doc: Document): void {
    this.documents.get(doc)?.();
    this.documents.delete(doc);
    for (const [host, surface] of this.surfaces)
      if (host.ownerDocument === doc) {
        this.remove(surface);
        this.surfaces.delete(host);
      }
  }
  overlayFor(host: HTMLElement): SVGSVGElement | null {
    return this.surfaces.get(host)?.svg ?? null;
  }
  highlight(host: HTMLElement, rect: DOMRect): HTMLElement | null {
    return this.surfaces.get(host)?.layer.addHighlight(rect) ?? null;
  }
  private schedule(surface: Surface, redraw = true): void {
    surface.redraw ||= redraw;
    if (surface.frame !== null) return;
    surface.frame =
      surface.host.ownerDocument.defaultView?.requestAnimationFrame(() => {
        surface.frame = null;
        if (surface.redraw) { surface.redraw = false; this.draw(surface); }
        else surface.layer.position();
      }) ?? null;
  }
  private collect(surface: Surface): void {
    const items = ownElements(surface.host, "li");
    const first = items.map((e) => this.registrations.get(e)).find(Boolean);
    const complete = first && items.every(element => {
      const registration = this.registrations.get(element);
      return registration?.nodes === first.nodes && registration.file === first.file;
    });
    // During partial rerenders, use one coherent DOM hierarchy until source
    // registration is complete. Mixing old source indices and appended fallback
    // indices can connect siblings in the wrong vertical order.
    surface.nodes = complete ? first.nodes : [];
    surface.file = first?.file ?? "";
    surface.elements.clear();
    const domIndex = new Map<HTMLElement, number>();
    let block = -1;
    for (const element of items) {
      const registration = this.registrations.get(element);
      if (
        complete && registration
      ) {
        surface.elements.set(registration.index, element);
        domIndex.set(element, registration.index);
      } else {
        const parentEl = element.parentElement?.closest<HTMLElement>("li");
        let parent = parentEl ? (domIndex.get(parentEl) ?? null) : null;
        if (parent === null) {
          if (
            !element.previousElementSibling ||
            element.previousElementSibling.tagName !== "LI"
          )
            block++;
          const previous = previousBlock(element, surface.host);
          if (
            previous?.tagName === "P" &&
            firstTextRect(previous) &&
            isUnmarkedListHead(previous.textContent?.trim() ?? "")
          ) {
            let head = surface.nodes.find(
              (n) => n.kind === "head" && n.block === block,
            );
            if (!head) {
              head = {
                index: surface.nodes.length,
                line: -1,
                endLine: -1,
                text: previous.textContent ?? "",
                plainText: true,
                marker: "",
                kind: "head",
                parent: null,
                depth: 0,
                block,
                cluster: block,
              };
              surface.nodes.push(head);
              surface.elements.set(head.index, previous);
            }
            parent = head.index;
          }
        }
        const ordered = element.parentElement?.tagName === "OL";
        const siblings = Array.from(
          element.parentElement?.children ?? [],
        ).filter((e) => e.tagName === "LI");
        const ordinal =
          Number(element.getAttribute("value")) ||
          (Number(element.parentElement?.getAttribute("start")) || 1) +
            siblings.indexOf(element);
        const task = element.classList.contains("task-list-item");
        const previous = element.previousElementSibling as HTMLElement | null;
        const previousIndex = previous ? domIndex.get(previous) : undefined;
        const ancestor = parent === null ? undefined : surface.nodes[parent];
        const sibling = previousIndex === undefined ? undefined : surface.nodes[previousIndex];
        const node: ListNode = {
          index: surface.nodes.length,
          line: -1,
          endLine: -1,
          text: ownItemText(element) || "(Empty list item)",
          plainText: true,
          marker: task
            ? element.getAttribute("data-task") === " "
              ? "☐"
              : "☑"
            : ordered
              ? `${ordinal}.`
              : "•",
          kind: task ? "task" : ordered ? "ordered" : "unordered",
          parent,
          depth: parent === null ? 0 : surface.nodes[parent].depth + 1,
          block: ancestor?.block ?? sibling?.block ?? block,
          cluster: ancestor?.cluster ?? sibling?.cluster ?? block,
        };
        surface.nodes.push(node);
        surface.elements.set(node.index, element);
        domIndex.set(element, node.index);
      }
      if (!element.classList.contains("ltig-rendered-item")) element.classList.add("ltig-rendered-item");
    }
    for (const [index, element] of [...surface.elements]) {
      const node = surface.nodes[index];
      if (node.parent === null || surface.nodes[node.parent]?.kind !== "head")
        continue;
      const previous = previousBlock(element, surface.host);
      if (previous?.tagName === "P" && owner(previous) === surface.host)
        surface.elements.set(node.parent, previous);
    }
    surface.indices = new Map(
      Array.from(surface.elements, ([index, element]) => [element, index]),
    );
  }
  private draw(surface: Surface): void {
    surface.layer.position();
    if (!surface.host.isConnected || !surface.host.getClientRects().length) return;
    if (surface.dirty || !surface.geometry) {
      surface.dirty = false;
      this.collect(surface);
      surface.geometry = listGeometry(surface.host);
      surface.points.clear();
      for (const [index, element] of surface.elements) {
        if (!element.getClientRects().length) continue;
        const marker = renderedMarkerGeometry(element);
        const point = pointWithinHost(marker.bounds, surface.host, surface.geometry.direction, marker.anchor);
        point.rowBottom = pointWithinHost(ownRowRect(element), surface.host, surface.geometry.direction).bottom;
        surface.points.set(index, point);
      }
      surface.layer.copyStyle();
    }
    const mode = renderedMode(surface.host),
      s = this.settings();
    const guides =
      s.enableListStaticTreeIndentationGuides &&
      (mode === "livePreview"
        ? s.renderInLivePreview
        : mode === "source"
          ? s.renderInSourceMode
          : s.renderInReadingMode);
    surface.host.classList.toggle("ltig-rendered-static", guides);
    drawListTree(
      surface.svg,
      surface.nodes,
      surface.points,
      {
        guides,
        unmarkedGuides: s.unmarkedListHeadStaticGuides,
        connect: s.connectSeparateListBlocks,
        threading: mainThreadOptions(s, mode),
        active: surface.active,
      },
      surface.geometry,
    );
  }
  private remove(surface: Surface): void {
    surface.resize.disconnect();
    surface.layer.remove();
    if (surface.frame !== null)
      surface.host.ownerDocument.defaultView?.cancelAnimationFrame(
        surface.frame,
      );
    surface.host.classList.remove("ltig-rendered-host", "ltig-rendered-static");
    for (const element of ownElements(surface.host, ".ltig-rendered-item"))
      element.classList.remove("ltig-rendered-item");
  }
}
function ownItemText(element: HTMLElement): string {
  // Prune nested lists instead of cloning the entire subtree for every parent.
  const walker = element.ownerDocument.createTreeWalker(element, 5, {
    acceptNode(node) {
      if (node.nodeType === 1)
        return (node as Element).matches("ul, ol, svg, .internal-embed, .list-collapse-indicator") ? 2 : 3;
      return 1;
    },
  });
  let text = "";
  while (walker.nextNode()) text += walker.currentNode.textContent ?? "";
  return text.trim();
}

function previousBlock(
  item: HTMLElement,
  host: HTMLElement,
): HTMLElement | null {
  let block = item.parentElement;
  while (block && block !== host && owner(block) === host) {
    if (block.tagName === "LI") return null;
    const previous = block.previousElementSibling as HTMLElement | null;
    if (previous)
      return previous.matches("p")
        ? previous
        : previous.querySelector<HTMLElement>(":scope > p");
    block = block.parentElement;
  }
  return null;
}
