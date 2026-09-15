import { buildGuidePath, threadStartY } from "./guide-geometry";
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
    threadGap: number("thread-marker-gap", 4),
    threadHeight: number("thread-connector-height", 100),
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
  svg: SVGSVGElement,
  nodes: readonly ListNode[],
  points: ReadonlyMap<number, ListPoint>,
  options: {
    guides: boolean;
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
      fragment.createSvg("path", { cls, attr: { d } });
  };
  if (options.guides)
    for (const group of groups([...points.keys()], options.connect)) {
      const connectors = group.map((i) => ({
        endX: points.get(i)!.x - geometry.gap * geometry.direction,
        y: points.get(i)!.y + geometry.offset,
      }));
      const spineX = connectors[0].endX - geometry.length * geometry.direction;
      const parentIndex = nodes[group[0]].parent;
      const parent = parentIndex === null ? undefined : points.get(parentIndex);
      const startY =
        options.breadcrumb && parent
          ? Math.min(connectors[0].y, parent.y + geometry.rise)
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
          parent.bottom,
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
    const spineX =
      connectors[0].endX - geometry.threadLength * geometry.direction;
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
  const rect = firstTextRect(element) ?? element.getBoundingClientRect();
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  const rtl = style.direction === "rtl";
  const explicit = Array.from(
    element.querySelectorAll<HTMLElement>(
      ".list-bullet, .task-list-item-checkbox",
    ),
  ).find((marker) => marker.closest("li") === element);
  if (explicit) {
    const measured = explicit.getBoundingClientRect();
    if (measured.width > 0 && measured.height > 0) return measured;
  }
  if (element.tagName !== "LI") return rect;
  const font = Number.parseFloat(style.fontSize) || 16;
  const ordered = element.parentElement?.tagName === "OL";
  const siblings = element.parentElement
    ? Array.from(element.parentElement.children).filter(
        (e) => e.tagName === "LI",
      )
    : [];
  const number =
    Number(element.getAttribute("value")) ||
    (Number(element.parentElement?.getAttribute("start")) || 1) +
      siblings.indexOf(element);
  const width = ordered
    ? font * (String(number).length * 0.6 + 0.3)
    : font * 0.45;
  return new DOMRect(
    rtl ? rect.right + font * 0.3 : rect.left - font * 0.3 - width,
    rect.top,
    width,
    rect.height,
  );
}

export function pointWithinHost(
  marker: DOMRect,
  host: HTMLElement,
  direction: number,
): ListPoint {
  const rect = host.getBoundingClientRect();
  const style = host.ownerDocument.defaultView!.getComputedStyle(host);
  const px = (key: string) =>
    Number.parseFloat(style.getPropertyValue(key)) || 0;
  const borderBox = style.boxSizing === "border-box";
  // offsetWidth/Height round fractional CSS pixels, which introduces drift in tall embeds.
  const width =
    px("width") +
    (borderBox
      ? 0
      : px("padding-left") +
        px("padding-right") +
        px("border-left-width") +
        px("border-right-width"));
  const height =
    px("height") +
    (borderBox
      ? 0
      : px("padding-top") +
        px("padding-bottom") +
        px("border-top-width") +
        px("border-bottom-width"));
  const scaleX = width ? rect.width / width : 1,
    scaleY = height ? rect.height / height : 1;
  const left = host.scrollLeft - px("border-left-width"),
    top = host.scrollTop - px("border-top-width");
  return {
    x:
      ((direction < 0 ? marker.right : marker.left) - rect.left) /
        (scaleX || 1) +
      left,
    y: ((marker.top + marker.bottom) / 2 - rect.top) / (scaleY || 1) + top,
    bottom: (marker.bottom - rect.top) / (scaleY || 1) + top,
  };
}
