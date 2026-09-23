import { elementScale, markerGeometry, visibleListMarkerRect, type MarkerGeometry } from "./marker-geometry";
export { elementScale } from "./marker-geometry";
import { buildGuidePath, threadSpineX, threadStartY } from "./guide-geometry";
import { buildRoundedThreadGroupPath } from "./editor-guides";
import {
  listThreadPlan,
  type ListNode,
  type ListThreadOptions,
} from "./list-model";

export interface ListPoint {
  x: number;
  y: number;
  bottom: number;
  centerX: number;
  /** Bottom of the full own row, excluding nested lists. */
  rowBottom?: number;
}
export interface ListGeometry {
  length: number;
  gap: number;
  rise: number;
  offset: number;
  threadLength: number;
  threadHeight: number;
  threadThickness: number;
  threadGap: number;
  threadOffset: number;
  radius: number;
  direction: number;
}

export function cssPixels(
  element: HTMLElement,
  variable: string,
  fallback: number,
): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const raw = style?.getPropertyValue(variable).trim() ?? "";
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  if (raw.endsWith("rem"))
    return (
      value *
      Number.parseFloat(
        element.ownerDocument.defaultView!.getComputedStyle(
          element.ownerDocument.documentElement,
        ).fontSize,
      )
    );
  if (raw.endsWith("em")) return value * Number.parseFloat(style!.fontSize);
  return value;
}

export function listGeometry(
  element: HTMLElement,
  breadcrumb = false,
): ListGeometry {
  const prefix = breadcrumb ? "--ltig-breadcrumb-" : "--ltig-";
  const number = (key: string, value: number) =>
    cssPixels(element, prefix + key, value);
  return {
    length: number("connector-length", 18),
    gap: number("marker-gap", 4),
    rise: number("first-branch-rise", 10),
    offset: number("connector-offset", 0),
    threadLength: number("thread-connector-length", 28),
    threadGap: number("thread-marker-gap", breadcrumb ? 4 : 6.5),
    threadHeight: number("thread-connector-height", breadcrumb ? 100 : 103),
    threadThickness: number("thread-thickness", 4),
    threadOffset: number("thread-vertical-offset", 0),
    radius: number("thread-corner-radius", 8),
    direction:
      element.ownerDocument.defaultView?.getComputedStyle(element).direction ===
      "rtl"
        ? -1
        : 1,
  };
}

/** One connected spine per sibling group; size comes from layout, never the old SVG. */
export function drawListTree(
  svg: SVGElement,
  nodes: readonly ListNode[],
  points: ReadonlyMap<number, ListPoint>,
  options: {
    guides: boolean;
    unmarkedGuides?: boolean;
    connect: boolean;
    threading: ListThreadOptions;
    active: number | null;
    breadcrumb?: boolean;
  },
  geometry: ListGeometry,
): void {
  const fragment = createFragment();
  const prefix = options.breadcrumb ? "ltig-breadcrumb-" : "ltig-";
  const groups = (indices: number[], connect: boolean) => {
    const result = new Map<string, number[]>();
    for (const i of indices) {
      const node = nodes[i];
      if (node.kind === "head" || !points.has(i)) continue;
      const root = node.parent === null || nodes[node.parent]?.kind === "head";
      const key = root && connect ? "root" : `${node.block}:${node.parent}`;
      const group = result.get(key) ?? [];
      group.push(i);
      result.set(key, group);
    }
    return [...result.values()];
  };
  const append = (d: string, cls: string) => {
    if (d && !/NaN|Infinity/.test(d))
      fragment.createSvg("path", { cls: cls.split(" "), attr: { d } });
  };
  if (options.guides)
    for (const group of groups([...points.keys()], options.connect)) {
      const connectors = group.map((i) => ({
        endX: points.get(i)!.x - geometry.gap * geometry.direction,
        y: points.get(i)!.y + geometry.offset,
      }));
      const edges = connectors.map(c => c.endX);
      const spineX = (geometry.direction < 0 ? Math.max(...edges) : Math.min(...edges)) - geometry.length * geometry.direction;
      const parentIndex = nodes[group[0]].parent;
      const parent = parentIndex === null ? undefined : points.get(parentIndex);
      const startY =
        parent && (options.breadcrumb || (options.unmarkedGuides && nodes[parentIndex!].kind === "head"))
          ? Math.min(connectors[0].y, Math.max(parent.y + geometry.rise, parent.rowBottom ?? parent.bottom))
          : connectors[0].y - geometry.rise;
      append(
        buildGuidePath({
          connectors,
          spineX,
          startY,
          endY: connectors.at(-1)!.y,
        }),
        `${prefix}guide-path`,
      );
    }
  if (options.guides && options.unmarkedGuides) {
    for (const [index, point] of points) {
      if (nodes[index].kind !== "head") continue;
      const endX = point.x - geometry.gap * geometry.direction;
      const y = point.y + geometry.offset;
      append(buildGuidePath({
        connectors: [{ endX, y }],
        spineX: endX - geometry.length * geometry.direction,
        startY: y - geometry.rise,
        endY: y,
      }), `${prefix}guide-path ${prefix}head-guide-path`);
    }
  }
  const plan = listThreadPlan(nodes, options.active, options.threading);
  const active = options.active === null ? undefined : nodes[options.active];
  const hasHead =
    active && nodes.some((n) => n.block === active.block && n.kind === "head");
  const all = hasHead
    ? options.threading.all
    : options.threading.orphan && options.threading.orphanAll;
  const join = all ? options.threading.joinAll : options.threading.joinActive;
  for (const group of groups(plan, join)) {
    const first = nodes[group[0]];
    const connectors = group.map((i) => ({
      endX: points.get(i)!.x - geometry.threadGap * geometry.direction,
      y: points.get(i)!.y + geometry.threadOffset,
    }));
    const isRoot =
      first.parent === null || nodes[first.parent]?.kind === "head";
    const firstRoot = isRoot
      ? nodes.find(
          (n) =>
            n.kind !== "head" &&
            (n.parent === null || nodes[n.parent]?.kind === "head") &&
            points.has(n.index) &&
            (join ? n.cluster === first.cluster : n.block === first.block),
        )
      : undefined;
    const parentIndex =
      isRoot && join && firstRoot ? firstRoot.parent : first.parent;
    const parent =
      parentIndex === null || parentIndex === undefined
        ? undefined
        : points.get(parentIndex);
    const startY = parent
      ? threadStartY(
          nodes[parentIndex!]?.kind === "head" ? parent.rowBottom ?? parent.bottom : parent.bottom,
          connectors[0].y,
          geometry.threadHeight,
          geometry.threadThickness,
          geometry.threadGap,
        )
      : connectors[0].y -
        ((connectors[0].y -
          (firstRoot ? points.get(firstRoot.index)!.y : connectors[0].y) +
          geometry.rise) *
          geometry.threadHeight) /
          100;
    const spineX = parent && nodes[parentIndex!]?.kind !== "head"
      ? threadSpineX(parent.centerX, geometry.threadLength, geometry.direction)
      : connectors[0].endX - geometry.threadLength * geometry.direction;
    const color = Math.min(
      8,
      Math.max(
        1,
        first.depth +
          (nodes.some((n) => n.block === first.block && n.kind === "head")
            ? 0
            : 1),
      ),
    );
    append(
      buildRoundedThreadGroupPath({
        connectors,
        spineX,
        startY,
        radius: geometry.radius,
      }),
      `${prefix}thread-path ${prefix}thread-depth-${color}`,
    );
  }
  svg.replaceChildren(fragment);
}

/** Measure the first text line, excluding nested lists, embed contents, and controls. */
export function firstTextRect(element: HTMLElement): DOMRect | null {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    const parent = text.parentElement;
    if (
      !text.textContent?.trim() ||
      !parent ||
      parent.closest("svg, .list-collapse-indicator, .ltig-rendered-overlay")
    )
      continue;
    if (
      parent.closest(".internal-embed") !== element.closest(".internal-embed")
    )
      continue;
    if (element.tagName === "LI" && parent.closest("li") !== element) continue;
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(text);
    const rect = Array.from(range.getClientRects()).find(
      (r) => r.width > 0 && r.height > 0,
    );
    if (rect) return rect;
  }
  return null;
}

export function renderedMarkerRect(element: HTMLElement): DOMRect {
  return renderedMarkerGeometry(element).bounds;
}

export function renderedMarkerGeometry(element: HTMLElement): MarkerGeometry {
  const win = element.ownerDocument.defaultView!;
  const style = win.getComputedStyle(element);
  const rtl = style.direction === "rtl";
  let control: DOMRect | null = null;
  // A task can have a hidden .list-bullet before its visible checkbox. Do not
  // let that placeholder (or a marker in a subordinate embed) win the search.
  for (const selector of [".task-list-item-checkbox", ".list-bullet"]) {
    for (const marker of Array.from(element.querySelectorAll<HTMLElement>(selector))) {
      if (marker.closest("li") !== element ||
        marker.closest(".internal-embed") !== element.closest(".internal-embed")) continue;
      const measured = visibleListMarkerRect(marker, element);
      if (measured) { control = measured; break; }
    }
    if (control) break;
  }
  const ordered = element.parentElement?.tagName === "OL";
  const markerStyle = win.getComputedStyle(element, "::marker");
  const nativeNumber = ordered && style.listStyleType !== "none" && markerStyle.content !== '""';
  if (control && !nativeNumber) return markerGeometry(control);
  const font = Number.parseFloat(style.fontSize) || 16;
  const box = element.getBoundingClientRect();
  const scale = elementScale(element);
  // Embed-only items have no own text. Their native marker belongs on the
  // first line, never at the vertical midpoint of the entire embedded block.
  const lineHeight = (Number.parseFloat(style.lineHeight) || font * 1.5) * scale.y;
  const rect = firstTextRect(element) ?? new DOMRect(box.left, box.top, box.width, Math.min(box.height, lineHeight));
  if (element.tagName !== "LI") return markerGeometry(rect);
  const siblings = element.parentElement
    ? Array.from(element.parentElement.children).filter(
        (e) => e.tagName === "LI",
      )
    : [];
  const reversed = element.parentElement?.hasAttribute("reversed") ?? false;
  let number = Number(element.parentElement?.getAttribute("start") ?? (reversed ? siblings.length : 1));
  for (const sibling of siblings) {
    if (sibling.hasAttribute("value")) number = Number(sibling.getAttribute("value"));
    if (sibling === element) break;
    number += reversed ? -1 : 1;
  }
  if (nativeNumber) {
    // Native ::marker has no DOM box. Measure its glyph advance off-document,
    // and anchor to the li content edge, not to text after the checkbox.
    const canvas = markerCanvas(element.ownerDocument);
    const context = canvas.getContext("2d")!;
    const size = Number.parseFloat(markerStyle.fontSize) || font;
    context.font = `${markerStyle.fontStyle} ${markerStyle.fontWeight} ${size}px ${markerStyle.fontFamily}`;
    const label = `${style.listStyleType === "decimal-leading-zero" && number >= 0 && number < 10 ? "0" : ""}${number}.`;
    const spacing = Number.parseFloat(markerStyle.letterSpacing) || 0;
    const width = (context.measureText(label).width + spacing * label.length) * scale.x;
    const space = (context.measureText(" ").width + spacing) * scale.x;
    const padding = Number.parseFloat(rtl ? style.paddingRight : style.paddingLeft) || 0;
    const border = Number.parseFloat(rtl ? style.borderRightWidth : style.borderLeftWidth) || 0;
    const edge = rtl ? box.right - (padding + border) * scale.x : box.left + (padding + border) * scale.x;
    const outside = style.listStylePosition !== "inside";
    const left = rtl ? edge + (outside ? space : -width) : edge - (outside ? width + space : 0);
    return markerGeometry(new DOMRect(left, rect.top, width, rect.height), control);
  }
  const width = (ordered
    ? font * (String(number).length * 0.6 + 0.3)
    : font * 0.45) * scale.x;
  return markerGeometry(new DOMRect(
    rtl ? rect.right + font * 0.3 * scale.x : rect.left - font * 0.3 * scale.x - width,
    rect.top,
    width,
    rect.height,
  ), control);
}

const markerCanvases = new WeakMap<Document, HTMLCanvasElement>();
function markerCanvas(doc: Document): HTMLCanvasElement {
  let canvas = markerCanvases.get(doc);
  if (!canvas) {
    canvas = doc.adoptNode(createFragment().createEl("canvas"));
    markerCanvases.set(doc, canvas);
  }
  return canvas;
}

export function pointWithinHost(
  marker: DOMRect,
  host: HTMLElement,
  direction: number,
  anchor: DOMRect = marker,
): ListPoint {
  const rect = host.getBoundingClientRect();
  const style = host.ownerDocument.defaultView!.getComputedStyle(host);
  const px = (key: string) =>
    Number.parseFloat(style.getPropertyValue(key)) || 0;
  const { x: scaleX, y: scaleY } = elementScale(host);
  const left = host.scrollLeft - px("border-left-width"),
    top = host.scrollTop - px("border-top-width");
  return {
    x:
      ((direction < 0 ? marker.right : marker.left) - rect.left) /
        (scaleX || 1) +
      left,
    centerX: ((anchor.left + anchor.right) / 2 - rect.left) / (scaleX || 1) + left,
    y: ((anchor.top + anchor.bottom) / 2 - rect.top) / (scaleY || 1) + top,
    bottom: (marker.bottom - rect.top) / (scaleY || 1) + top,
  };
}

export function ownRowRect(element: HTMLElement): DOMRect {
  const rect = element.getBoundingClientRect();
  const nested = Array.from(element.children).find(child => /^(UL|OL)$/.test(child.tagName));
  const bottom = nested ? Math.min(rect.bottom, nested.getBoundingClientRect().top) : rect.bottom;
  return new DOMRect(rect.left, rect.top, rect.width, Math.max(0, bottom - rect.top));
}
