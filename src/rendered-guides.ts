import type { MarkdownPostProcessorContext } from "obsidian";
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
  elements: Map<number, HTMLElement>;
  indices: Map<HTMLElement, number>;
  nodes: ListNode[];
  file: string;
  active: number | null;
  frame: number | null;
  observer: MutationObserver;
  resize: ResizeObserver;
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
  private readonly pending = new Map<Window, number>();
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
    this.queueRefresh(root.ownerDocument);
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
    const scroll = () => {
      for (const surface of this.surfaces.values())
        if (surface.host.ownerDocument === doc) this.schedule(surface);
    };
    const bodyObserver = new doc.defaultView.MutationObserver(() =>
      this.refresh(doc),
    );
    bodyObserver.observe(doc.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    doc.addEventListener("pointermove", move, { passive: true });
    doc.addEventListener("scroll", scroll, { passive: true, capture: true });
    this.documents.set(doc, () => {
      bodyObserver.disconnect();
      doc.removeEventListener("pointermove", move);
      doc.removeEventListener("scroll", scroll, true);
    });
    this.refresh(doc);
  }
  refresh(doc: Document): void {
    for (const [host, surface] of this.surfaces)
      if (!host.isConnected) {
        this.remove(surface);
        this.surfaces.delete(host);
      }
    for (const host of Array.from(
      doc.querySelectorAll<HTMLElement>(".markdown-rendered"),
    )) {
      if (
        host.closest(".ltig-breadcrumb-popover") ||
        !ownElements(host, "li").length
      )
        continue;
      let surface = this.surfaces.get(host);
      if (!surface && doc.defaultView) {
        host.classList.add("ltig-rendered-host");
        const svg = host.createSvg("svg", {
          cls: "ltig-rendered-overlay",
          attr: { "aria-hidden": "true", width: "0", height: "0" },
        });
        const observer = new doc.defaultView.MutationObserver((records) => {
          if (
            records.some(
              (r) =>
                !(r.target as Element).closest?.(
                  ".ltig-rendered-overlay, .ltig-breadcrumb-rendered-highlight",
                ) &&
                (r.type === "characterData" ||
                  [
                    ...Array.from(r.addedNodes),
                    ...Array.from(r.removedNodes),
                  ].some(
                    (n) =>
                      n !== svg &&
                      !(n as Element).classList?.contains(
                        "ltig-breadcrumb-rendered-highlight",
                      ),
                  )),
            )
          )
            this.schedule(surface!);
        });
        const resize = new doc.defaultView.ResizeObserver(() =>
          this.schedule(surface!),
        );
        surface = {
          host,
          svg,
          observer,
          resize,
          nodes: [],
          elements: new Map(),
          indices: new Map(),
          file: "",
          active: null,
          frame: null,
        };
        observer.observe(host, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        resize.observe(host);
        this.surfaces.set(host, surface);
      }
      if (surface) this.schedule(surface);
    }
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
      if (node.kind === "head" && !this.settings().listThreadingFromNonListHead)
        continue;
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
    for (const [win, frame] of this.pending) win.cancelAnimationFrame(frame);
    this.pending.clear();
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
    const win = doc.defaultView;
    if (win && this.pending.has(win)) {
      win.cancelAnimationFrame(this.pending.get(win)!);
      this.pending.delete(win);
    }
  }
  private queueRefresh(doc: Document): void {
    const win = doc.defaultView;
    if (!win || this.pending.has(win)) return;
    this.pending.set(
      win,
      win.requestAnimationFrame(() => {
        this.pending.delete(win);
        this.observeDocument(doc);
        this.refresh(doc);
      }),
    );
  }
  private schedule(surface: Surface): void {
    if (surface.frame !== null) return;
    surface.frame =
      surface.host.ownerDocument.defaultView?.requestAnimationFrame(() => {
        surface.frame = null;
        this.draw(surface);
      }) ?? null;
  }
  private collect(surface: Surface): void {
    const items = ownElements(surface.host, "li");
    const first = items.map((e) => this.registrations.get(e)).find(Boolean);
    surface.nodes = first?.nodes ?? [];
    surface.file = first?.file ?? "";
    surface.elements.clear();
    const domIndex = new Map<HTMLElement, number>();
    let block = -1;
    for (const element of items) {
      const registration = this.registrations.get(element);
      if (
        registration &&
        registration.file === surface.file &&
        registration.nodes === surface.nodes
      ) {
        surface.elements.set(registration.index, element);
        domIndex.set(element, registration.index);
      } else if (!first) {
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
        const node: ListNode = {
          index: surface.nodes.length,
          line: -1,
          endLine: -1,
          text: ownItemText(element) || "(Empty list item)",
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
          block,
          cluster: block,
        };
        surface.nodes.push(node);
        surface.elements.set(node.index, element);
        domIndex.set(element, node.index);
      }
      element.classList.add("ltig-rendered-item");
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
    if (!surface.host.isConnected) return;
    this.collect(surface);
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
    const geometry = listGeometry(surface.host),
      points = new Map<number, ListPoint>();
    for (const [index, element] of surface.elements) {
      if (!element.getClientRects().length) continue;
      points.set(
        index,
        pointWithinHost(
          renderedMarkerRect(element),
          surface.host,
          geometry.direction,
        ),
      );
    }
    surface.svg.setAttribute("width", String(surface.host.clientWidth));
    surface.svg.setAttribute("height", String(surface.host.clientHeight));
    drawListTree(
      surface.svg,
      surface.nodes,
      points,
      {
        guides,
        connect: s.connectSeparateListBlocks,
        threading: mainThreadOptions(s, mode),
        active: surface.active,
      },
      geometry,
    );
  }
  private remove(surface: Surface): void {
    surface.observer.disconnect();
    surface.resize.disconnect();
    surface.svg.remove();
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
  const clone = element.cloneNode(true) as HTMLElement;
  for (const nested of Array.from(
    clone.querySelectorAll("ul, ol, svg, .list-collapse-indicator"),
  ))
    nested.remove();
  return clone.textContent?.trim() ?? "";
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
