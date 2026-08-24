import type { Extension } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { buildGuidePath, clamp, median } from "./guide-geometry";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const LIST_LINE_CLASS_PREFIX = "HyperMD-list-line-";
const THREAD_COLOR_COUNT = 8;
let overlaySequence = 0;

export interface VisibleListRow {
  breakBefore?: boolean;
  depth: number;
}

export interface VisibleListItemModel {
  depth: number;
  groupIndex: number;
  parentIndex: number | null;
}

export interface VisibleListGroup {
  depth: number;
  itemIndices: number[];
  parentIndex: number | null;
}

export interface VisibleListModel {
  groups: VisibleListGroup[];
  items: VisibleListItemModel[];
}

interface CoordinateRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface MeasuredListRow extends VisibleListRow {
  element: HTMLElement;
  lineRect: CoordinateRect;
  markerRect: CoordinateRect;
}

interface RenderedConnector {
  endX: number;
  itemIndex: number;
  startX: number;
  y: number;
}

interface GuideStyleGeometry {
  connectorLength: number;
  connectorOffset: number;
  direction: "ltr" | "rtl";
  firstBranchRise: number;
  markerGap: number;
}

interface ThreadStyleGeometry {
  connectorLength: number;
  cornerRadius: number;
  markerGap: number;
  verticalOffset: number;
}

interface ThreadPathGeometry {
  endX: number;
  endY: number;
  radius: number;
  startX: number;
  startY: number;
}

export function createEditorGuidesExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly overlay: EditorGuideOverlay;

      public constructor(view: EditorView) {
        this.overlay = new EditorGuideOverlay(view);
      }

      public update(update: ViewUpdate): void {
        this.overlay.update(update);
      }

      public destroy(): void {
        this.overlay.destroy();
      }
    },
  );
}

/**
 * Build parent and sibling-group relationships from Obsidian's visible list
 * line depths. This intentionally does not depend on a Markdown syntax tree:
 * Obsidian's editor DOM is the source of truth for what is actually rendered.
 */
export function buildVisibleListModel(
  rows: readonly VisibleListRow[],
): VisibleListModel {
  const groups: VisibleListGroup[] = [];
  const items: VisibleListItemModel[] = [];
  const currentGroupAtDepth = new Map<number, number>();
  const lastItemAtDepth = new Map<number, number>();

  for (let itemIndex = 0; itemIndex < rows.length; itemIndex += 1) {
    const row = rows[itemIndex];
    if (row === undefined) {
      continue;
    }
    const depth = Math.max(1, Math.trunc(row.depth));
    if (row.breakBefore === true) {
      currentGroupAtDepth.clear();
      lastItemAtDepth.clear();
    }
    removeDeeperEntries(currentGroupAtDepth, depth);
    removeDeeperEntries(lastItemAtDepth, depth);

    const parentIndex =
      depth === 1 ? null : (lastItemAtDepth.get(depth - 1) ?? null);
    let groupIndex = currentGroupAtDepth.get(depth);
    const currentGroup =
      groupIndex === undefined ? undefined : groups[groupIndex];
    if (
      groupIndex === undefined ||
      currentGroup === undefined ||
      currentGroup.parentIndex !== parentIndex
    ) {
      groupIndex = groups.length;
      groups.push({
        depth,
        itemIndices: [],
        parentIndex,
      });
      currentGroupAtDepth.set(depth, groupIndex);
    }

    groups[groupIndex]?.itemIndices.push(itemIndex);
    items.push({ depth, groupIndex, parentIndex });
    lastItemAtDepth.set(depth, itemIndex);
  }

  return { groups, items };
}

export function buildRoundedThreadPath({
  endX,
  endY,
  radius,
  startX,
  startY,
}: ThreadPathGeometry): string {
  const verticalDirection = endY >= startY ? 1 : -1;
  const horizontalDirection = endX >= startX ? 1 : -1;
  const usableRadius = Math.max(
    0,
    Math.min(radius, Math.abs(endY - startY), Math.abs(endX - startX)),
  );
  const curveStartY = endY - verticalDirection * usableRadius;
  const curveEndX = startX + horizontalDirection * usableRadius;

  return [
    `M ${startX} ${startY}`,
    `V ${curveStartY}`,
    `Q ${startX} ${endY} ${curveEndX} ${endY}`,
    `H ${endX}`,
  ].join(" ");
}

class EditorGuideOverlay {
  private animationFrame: number | null = null;
  private readonly bodyObserver: MutationObserver | null;
  private readonly contentObserver: MutationObserver | null;
  private hoveredLine: HTMLElement | null = null;
  private readonly modeObserver: MutationObserver | null;
  private readonly overlay: SVGSVGElement;
  private readonly overlayClipId: string;
  private readonly overlayHost: HTMLElement;
  private readonly pointerLeaveHandler: () => void;
  private readonly pointerMoveHandler: (event: PointerEvent) => void;
  private readonly resizeHandler: () => void;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly scrollHandler: () => void;
  private readonly sourceView: HTMLElement | null;

  public constructor(private readonly view: EditorView) {
    const ownerDocument = view.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    this.sourceView = view.dom.closest<HTMLElement>(
      ".markdown-source-view.mod-cm6",
    );
    this.overlayHost = this.sourceView ?? view.dom;
    this.overlayHost.classList.add("ltig-editor-overlay-host");
    this.overlayClipId = `ltig-editor-clip-${overlaySequence++}`;
    this.overlay = ownerDocument.createElementNS(SVG_NAMESPACE, "svg");
    this.overlay.classList.add("ltig-editor-overlay");
    this.overlay.setAttribute("aria-hidden", "true");
    this.overlay.setAttribute("focusable", "false");
    this.overlayHost.appendChild(this.overlay);

    this.scrollHandler = () => this.scheduleRender();
    this.resizeHandler = () => this.scheduleRender();
    this.pointerLeaveHandler = () => this.setHoveredLine(null);
    this.pointerMoveHandler = (event) => this.updateHoveredLine(event);
    view.scrollDOM.addEventListener("scroll", this.scrollHandler, {
      passive: true,
    });
    view.dom.addEventListener("pointermove", this.pointerMoveHandler, {
      passive: true,
    });
    view.dom.addEventListener("pointerleave", this.pointerLeaveHandler, {
      passive: true,
    });
    ownerWindow?.addEventListener("resize", this.resizeHandler, {
      passive: true,
    });

    const Observer = ownerWindow?.MutationObserver;
    if (Observer === undefined) {
      this.bodyObserver = null;
      this.contentObserver = null;
      this.modeObserver = null;
    } else {
      this.bodyObserver = new Observer(() => this.scheduleRender());
      this.bodyObserver.observe(ownerDocument.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      this.contentObserver = new Observer(() => this.scheduleRender());
      this.contentObserver.observe(view.contentDOM, {
        attributes: true,
        attributeFilter: ["class"],
        childList: true,
        subtree: true,
      });
      this.modeObserver = new Observer(() => this.scheduleRender());
      if (this.sourceView !== null) {
        this.modeObserver.observe(this.sourceView, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }
    }

    const ResizeObserverConstructor = ownerWindow?.ResizeObserver;
    if (ResizeObserverConstructor === undefined) {
      this.resizeObserver = null;
    } else {
      this.resizeObserver = new ResizeObserverConstructor(() =>
        this.scheduleRender(),
      );
      this.resizeObserver.observe(view.dom);
      this.resizeObserver.observe(view.contentDOM);
      if (this.sourceView !== null) {
        this.resizeObserver.observe(this.sourceView);
      }
    }

    this.scheduleRender();
  }

  public update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.geometryChanged ||
      update.viewportChanged ||
      update.transactions.some((transaction) => transaction.reconfigured)
    ) {
      this.scheduleRender();
    }
  }

  public destroy(): void {
    const ownerWindow = this.view.dom.ownerDocument.defaultView;
    if (this.animationFrame !== null) {
      ownerWindow?.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.bodyObserver?.disconnect();
    this.contentObserver?.disconnect();
    this.modeObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.view.scrollDOM.removeEventListener("scroll", this.scrollHandler);
    this.view.dom.removeEventListener("pointermove", this.pointerMoveHandler);
    this.view.dom.removeEventListener("pointerleave", this.pointerLeaveHandler);
    ownerWindow?.removeEventListener("resize", this.resizeHandler);
    this.overlay.remove();
    if (
      this.overlayHost.querySelector(":scope > .ltig-editor-overlay") === null
    ) {
      this.overlayHost.classList.remove("ltig-editor-overlay-host");
    }
  }

  private scheduleRender(): void {
    if (this.animationFrame !== null) {
      return;
    }
    const ownerWindow = this.view.dom.ownerDocument.defaultView;
    if (ownerWindow === null) {
      return;
    }
    this.animationFrame = ownerWindow.requestAnimationFrame(() => {
      this.animationFrame = null;
      this.render();
    });
  }

  private render(): void {
    const sourceView =
      this.sourceView ??
      this.view.dom.closest<HTMLElement>(".markdown-source-view.mod-cm6");
    const ownerDocument = this.view.dom.ownerDocument;
    if (sourceView === null) {
      this.clearOverlay();
      return;
    }

    const isLivePreview = sourceView.classList.contains("is-live-preview");
    const guidesEnabled = isLivePreview
      ? ownerDocument.body.classList.contains("ltig-live-preview-enabled")
      : ownerDocument.body.classList.contains("ltig-source-mode-enabled");
    const threadingEnabled =
      ownerDocument.body.classList.contains("ltig-bullet-threading-enabled") &&
      (isLivePreview
        ? ownerDocument.body.classList.contains(
            "ltig-thread-live-preview-enabled",
          )
        : ownerDocument.body.classList.contains(
            "ltig-thread-source-mode-enabled",
          ));
    if (!guidesEnabled && !threadingEnabled) {
      this.clearOverlay();
      return;
    }

    const hostRect = this.overlayHost.getBoundingClientRect();
    const editorRect = this.view.dom.getBoundingClientRect();
    const overlayWidth = hostRect.width;
    const overlayHeight = hostRect.height;
    const clipTop = clamp(editorRect.top - hostRect.top, 0, overlayHeight);
    const clipBottom = clamp(
      editorRect.bottom - hostRect.top,
      0,
      overlayHeight,
    );
    const clipLeft = clamp(editorRect.left - hostRect.left, 0, overlayWidth);
    const clipRight = clamp(editorRect.right - hostRect.left, 0, overlayWidth);
    if (
      overlayWidth <= 0 ||
      overlayHeight <= 0 ||
      clipRight <= clipLeft ||
      clipBottom <= clipTop
    ) {
      this.clearOverlay();
      return;
    }

    const rows = this.collectVisibleRows(isLivePreview);
    if (rows.length === 0) {
      this.clearOverlay();
      return;
    }
    const model = buildVisibleListModel(rows);

    this.overlay.classList.remove("ltig-editor-overlay-hidden");
    this.overlay.setAttribute("viewBox", `0 0 ${overlayWidth} ${overlayHeight}`);
    this.overlay.setAttribute("width", String(overlayWidth));
    this.overlay.setAttribute("height", String(overlayHeight));

    const fragment = ownerDocument.createDocumentFragment();
    const definitions = ownerDocument.createElementNS(SVG_NAMESPACE, "defs");
    const clipPath = ownerDocument.createElementNS(SVG_NAMESPACE, "clipPath");
    clipPath.id = this.overlayClipId;
    const clipRectangle = ownerDocument.createElementNS(SVG_NAMESPACE, "rect");
    clipRectangle.setAttribute("x", String(clipLeft));
    clipRectangle.setAttribute("y", String(clipTop));
    clipRectangle.setAttribute("width", String(clipRight - clipLeft));
    clipRectangle.setAttribute("height", String(clipBottom - clipTop));
    clipPath.appendChild(clipRectangle);
    definitions.appendChild(clipPath);
    fragment.appendChild(definitions);

    const paths = ownerDocument.createElementNS(SVG_NAMESPACE, "g");
    paths.setAttribute("clip-path", `url(#${this.overlayClipId})`);
    const style = readGuideStyleGeometry(this.view.dom);
    if (guidesEnabled) {
      this.renderGuidePaths(
        paths,
        rows,
        model,
        style,
        hostRect,
        clipTop,
        clipBottom,
      );
    }
    if (threadingEnabled) {
      this.renderThreadPaths(
        paths,
        rows,
        model,
        style.direction,
        readThreadStyleGeometry(this.view.dom),
        hostRect,
        clipTop,
        clipBottom,
      );
    }

    fragment.appendChild(paths);
    this.overlay.replaceChildren(fragment);
  }

  private clearOverlay(): void {
    this.overlay.replaceChildren();
    this.overlay.classList.add("ltig-editor-overlay-hidden");
  }

  private collectVisibleRows(isLivePreview: boolean): MeasuredListRow[] {
    const rows: MeasuredListRow[] = [];
    let breakBefore = false;
    for (const line of Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
    )) {
      const depth = readListDepth(line);
      if (depth === null) {
        if (isHardListBoundary(line)) {
          breakBefore = true;
        }
        continue;
      }
      const lineRect = toCoordinateRect(line.getBoundingClientRect());
      rows.push({
        breakBefore,
        depth,
        element: line,
        lineRect,
        markerRect: measureMarkerRect(line, lineRect, isLivePreview),
      });
      breakBefore = false;
    }
    return rows;
  }

  private renderGuidePaths(
    container: SVGGElement,
    rows: readonly MeasuredListRow[],
    model: VisibleListModel,
    style: GuideStyleGeometry,
    hostRect: DOMRect,
    clipTop: number,
    clipBottom: number,
  ): void {
    const ownerDocument = this.view.dom.ownerDocument;
    for (const group of model.groups) {
      const rendered = group.itemIndices
        .map((itemIndex) =>
          this.connectorFor(
            rows[itemIndex],
            itemIndex,
            style.connectorLength,
            style.markerGap,
            style.connectorOffset,
            style.direction,
            hostRect,
          ),
        )
        .filter(
          (connector): connector is RenderedConnector =>
            connector !== null &&
            connector.y >= clipTop - 32 &&
            connector.y <= clipBottom + 32,
        );
      if (rendered.length === 0) {
        continue;
      }

      const spineX = median(rendered.map((connector) => connector.startX));
      const first = rendered[0];
      const last = rendered.at(-1);
      if (spineX === null || first === undefined || last === undefined) {
        continue;
      }
      const startsAboveViewport =
        first.itemIndex !== group.itemIndices[0] ||
        this.hasDeeperRowsBefore(rows, first.itemIndex, group.depth);
      const endsBelowViewport = last.itemIndex !== group.itemIndices.at(-1);
      const startY = startsAboveViewport
        ? clipTop
        : clamp(first.y - style.firstBranchRise, clipTop, clipBottom);
      const endY = endsBelowViewport
        ? clipBottom
        : clamp(last.y, clipTop, clipBottom);

      const path = ownerDocument.createElementNS(SVG_NAMESPACE, "path");
      path.classList.add("ltig-guide-path");
      path.setAttribute(
        "d",
        buildGuidePath({
          connectors: rendered.map(({ endX, y }) => ({ endX, y })),
          endY,
          spineX,
          startY,
        }),
      );
      container.appendChild(path);
    }

    this.renderMissingAncestorSpines(
      container,
      rows,
      model,
      style,
      hostRect,
      clipTop,
      clipBottom,
    );
  }

  private renderMissingAncestorSpines(
    container: SVGGElement,
    rows: readonly MeasuredListRow[],
    model: VisibleListModel,
    style: GuideStyleGeometry,
    hostRect: DOMRect,
    clipTop: number,
    clipBottom: number,
  ): void {
    const first = rows[0];
    if (first === undefined || first.depth <= 2) {
      return;
    }
    const indentWidth = inferIndentWidth(rows);
    const firstConnector = this.connectorFor(
      first,
      0,
      style.connectorLength,
      style.markerGap,
      style.connectorOffset,
      style.direction,
      hostRect,
    );
    if (firstConnector === null) {
      return;
    }
    const ownerDocument = this.view.dom.ownerDocument;
    for (let depth = 2; depth < first.depth; depth += 1) {
      if (model.groups.some((group) => group.depth === depth)) {
        continue;
      }
      const depthDifference = first.depth - depth;
      const spineX =
        style.direction === "rtl"
          ? firstConnector.startX + depthDifference * indentWidth
          : firstConnector.startX - depthDifference * indentWidth;
      const path = ownerDocument.createElementNS(SVG_NAMESPACE, "path");
      path.classList.add("ltig-guide-path", "ltig-guide-path-continuation");
      path.setAttribute(
        "d",
        `M ${spineX} ${clipTop} V ${clipBottom}`,
      );
      container.prepend(path);
    }
  }

  private renderThreadPaths(
    container: SVGGElement,
    rows: readonly MeasuredListRow[],
    model: VisibleListModel,
    direction: "ltr" | "rtl",
    style: ThreadStyleGeometry,
    hostRect: DOMRect,
    clipTop: number,
    clipBottom: number,
  ): void {
    const hoveredIndex = this.resolveHoveredIndex(rows);
    if (hoveredIndex === null) {
      return;
    }
    const chain = collectAncestorIndices(model.items, hoveredIndex);
    const ownerDocument = this.view.dom.ownerDocument;
    for (let chainIndex = 1; chainIndex < chain.length; chainIndex += 1) {
      const parentIndex = chain[chainIndex - 1];
      const childIndex = chain[chainIndex];
      const parent = parentIndex === undefined ? undefined : rows[parentIndex];
      const child = childIndex === undefined ? undefined : rows[childIndex];
      if (parent === undefined || child === undefined) {
        continue;
      }
      const parentY = clamp(
        markerCenterY(parent.markerRect) - hostRect.top + style.verticalOffset,
        clipTop,
        clipBottom,
      );
      const childY = clamp(
        markerCenterY(child.markerRect) - hostRect.top + style.verticalOffset,
        clipTop,
        clipBottom,
      );
      const markerEdge =
        direction === "rtl"
          ? child.markerRect.right - hostRect.left
          : child.markerRect.left - hostRect.left;
      const endX =
        direction === "rtl"
          ? markerEdge + style.markerGap
          : markerEdge - style.markerGap;
      const spineX =
        direction === "rtl"
          ? endX + style.connectorLength
          : endX - style.connectorLength;
      const path = ownerDocument.createElementNS(SVG_NAMESPACE, "path");
      path.classList.add(
        "ltig-thread-path",
        `ltig-thread-depth-${Math.min(
          Math.max(1, child.depth - 1),
          THREAD_COLOR_COUNT,
        )}`,
      );
      path.setAttribute(
        "d",
        buildRoundedThreadPath({
          endX,
          endY: childY,
          radius: style.cornerRadius,
          startX: spineX,
          startY: parentY,
        }),
      );
      container.appendChild(path);
    }
  }

  private connectorFor(
    row: MeasuredListRow | undefined,
    itemIndex: number,
    connectorLength: number,
    markerGap: number,
    verticalOffset: number,
    direction: "ltr" | "rtl",
    hostRect: DOMRect,
  ): RenderedConnector | null {
    if (row === undefined) {
      return null;
    }
    const markerEdge =
      direction === "rtl"
        ? row.markerRect.right - hostRect.left
        : row.markerRect.left - hostRect.left;
    const endX =
      direction === "rtl" ? markerEdge + markerGap : markerEdge - markerGap;
    return {
      endX,
      itemIndex,
      startX:
        direction === "rtl"
          ? endX + connectorLength
          : endX - connectorLength,
      y: markerCenterY(row.markerRect) - hostRect.top + verticalOffset,
    };
  }

  private hasDeeperRowsBefore(
    rows: readonly MeasuredListRow[],
    itemIndex: number,
    depth: number,
  ): boolean {
    for (let index = itemIndex - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row === undefined || row.breakBefore === true || row.depth < depth) {
        return false;
      }
      if (row.depth === depth) {
        return false;
      }
      if (row.depth > depth) {
        return true;
      }
    }
    return false;
  }

  private resolveHoveredIndex(rows: readonly MeasuredListRow[]): number | null {
    if (this.hoveredLine !== null) {
      const directIndex = rows.findIndex(
        (row) => row.element === this.hoveredLine,
      );
      if (directIndex >= 0) {
        return directIndex;
      }
    }
    const hoveredIndex = rows.findIndex((row) => row.element.matches(":hover"));
    return hoveredIndex >= 0 ? hoveredIndex : null;
  }

  private updateHoveredLine(event: PointerEvent): void {
    const target = event.target;
    const ElementConstructor =
      this.view.dom.ownerDocument.defaultView?.Element;
    const line =
      ElementConstructor !== undefined && target instanceof ElementConstructor
        ? target.closest<HTMLElement>(".cm-line.HyperMD-list-line")
        : null;
    this.setHoveredLine(
      line !== null && this.view.contentDOM.contains(line) ? line : null,
    );
  }

  private setHoveredLine(line: HTMLElement | null): void {
    if (this.hoveredLine === line) {
      return;
    }
    this.hoveredLine = line;
    this.scheduleRender();
  }
}

function collectAncestorIndices(
  items: readonly VisibleListItemModel[],
  itemIndex: number,
): number[] {
  const chain: number[] = [];
  const visited = new Set<number>();
  let currentIndex: number | null = itemIndex;
  while (
    currentIndex !== null &&
    currentIndex >= 0 &&
    currentIndex < items.length &&
    !visited.has(currentIndex)
  ) {
    visited.add(currentIndex);
    chain.push(currentIndex);
    currentIndex = items[currentIndex]?.parentIndex ?? null;
  }
  return chain.reverse();
}

function readListDepth(line: HTMLElement): number | null {
  for (const className of Array.from(line.classList)) {
    if (!className.startsWith(LIST_LINE_CLASS_PREFIX)) {
      continue;
    }
    const parsed = Number.parseInt(
      className.slice(LIST_LINE_CLASS_PREFIX.length),
      10,
    );
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (!line.classList.contains("HyperMD-list-line")) {
    return null;
  }
  return Math.max(
    1,
    line.querySelectorAll(".cm-hmd-list-indent > .cm-indent").length + 1,
  );
}

function isHardListBoundary(line: HTMLElement): boolean {
  if (line.textContent?.trim() === "") {
    return false;
  }
  return !line.classList.contains("HyperMD-list-line");
}

function measureMarkerRect(
  line: HTMLElement,
  lineRect: CoordinateRect,
  isLivePreview: boolean,
): CoordinateRect {
  const selectors = isLivePreview
    ? [
        ".list-bullet",
        ".cm-formatting-list-ol",
        ".cm-formatting-list",
        ".task-list-item-checkbox",
      ]
    : [
        ".cm-formatting-list",
        ".cm-formatting-list-ul",
        ".cm-formatting-list-ol",
        ".list-bullet",
      ];
  for (const selector of selectors) {
    const marker = line.querySelector<HTMLElement>(selector);
    if (marker === null) {
      continue;
    }
    const markerRect = toCoordinateRect(marker.getBoundingClientRect());
    if (rectHasUsablePosition(markerRect)) {
      return normalizeMarkerHeight(markerRect, lineRect);
    }
  }

  const indent = line.querySelector<HTMLElement>(
    ".cm-hmd-list-indent > .cm-indent:last-child",
  );
  if (indent !== null) {
    const indentRect = toCoordinateRect(indent.getBoundingClientRect());
    if (rectHasUsablePosition(indentRect)) {
      return {
        bottom: lineRect.bottom,
        left: indentRect.right,
        right: indentRect.right,
        top: lineRect.top,
      };
    }
  }

  return {
    bottom: lineRect.bottom,
    left: lineRect.left,
    right: lineRect.left,
    top: lineRect.top,
  };
}

function normalizeMarkerHeight(
  markerRect: CoordinateRect,
  lineRect: CoordinateRect,
): CoordinateRect {
  if (markerRect.bottom > markerRect.top) {
    return markerRect;
  }
  return {
    ...markerRect,
    bottom: lineRect.bottom,
    top: lineRect.top,
  };
}

function rectHasUsablePosition(rect: CoordinateRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom) &&
    rect.right >= rect.left &&
    rect.bottom >= rect.top
  );
}

function toCoordinateRect(rect: DOMRect): CoordinateRect {
  return {
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    top: rect.top,
  };
}

function markerCenterY(rect: CoordinateRect): number {
  return (rect.top + rect.bottom) / 2;
}

function inferIndentWidth(rows: readonly MeasuredListRow[]): number {
  const candidates: number[] = [];
  for (const row of rows) {
    for (const indent of Array.from(
      row.element.querySelectorAll<HTMLElement>(".cm-indent"),
    )) {
      const width = indent.getBoundingClientRect().width;
      if (Number.isFinite(width) && width > 4) {
        candidates.push(width);
      }
    }
  }
  return median(candidates) ?? 32;
}

function removeDeeperEntries(
  entries: Map<number, number>,
  depth: number,
): void {
  for (const entryDepth of Array.from(entries.keys())) {
    if (entryDepth > depth) {
      entries.delete(entryDepth);
    }
  }
}

function readGuideStyleGeometry(element: HTMLElement): GuideStyleGeometry {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return {
    connectorLength: readPixelValue(
      style?.getPropertyValue("--ltig-connector-length"),
      18,
    ),
    connectorOffset: readPixelValue(
      style?.getPropertyValue("--ltig-connector-offset"),
      0,
    ),
    direction: style?.direction === "rtl" ? "rtl" : "ltr",
    firstBranchRise: readPixelValue(
      style?.getPropertyValue("--ltig-first-branch-rise"),
      10,
    ),
    markerGap: readPixelValue(
      style?.getPropertyValue("--ltig-marker-gap"),
      4,
    ),
  };
}

function readThreadStyleGeometry(element: HTMLElement): ThreadStyleGeometry {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return {
    connectorLength: readPixelValue(
      style?.getPropertyValue("--ltig-thread-connector-length"),
      28,
    ),
    cornerRadius: readPixelValue(
      style?.getPropertyValue("--ltig-thread-corner-radius"),
      8,
    ),
    markerGap: readPixelValue(
      style?.getPropertyValue("--ltig-thread-marker-gap"),
      4,
    ),
    verticalOffset: readPixelValue(
      style?.getPropertyValue("--ltig-thread-vertical-offset"),
      0,
    ),
  };
}

function readPixelValue(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}
