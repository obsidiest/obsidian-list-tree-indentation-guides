import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { buildGuidePath, clamp, median } from "./guide-geometry";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const LIST_NODE_NAMES = new Set(["BulletList", "OrderedList"]);
const LIST_ITEM_NODE_NAME = "ListItem";
const LIST_MARK_NODE_NAMES = new Set(["ListMark", "TaskMarker"]);
const THREAD_COLOR_COUNT = 8;
let overlaySequence = 0;

export interface EditorListItem {
  contentFrom: number;
  depth: number;
  markerFrom: number;
  parentMarkerFrom: number | null;
}

export interface EditorListGroup {
  depth: number;
  from: number;
  items: readonly EditorListItem[];
  ordered: boolean;
  to: number;
}

interface RenderedConnector {
  endX: number;
  markerFrom: number;
  startX: number;
  y: number;
}

interface CoordinateRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
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

export function collectEditorListGroups(state: EditorState): EditorListGroup[] {
  const groups: EditorListGroup[] = [];
  const tree = syntaxTree(state);

  const visitForLists = (node: SyntaxNode): void => {
    if (LIST_NODE_NAMES.has(node.name)) {
      parseList(node, 1);
      return;
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visitForLists(child);
    }
  };

  const visitNestedLists = (node: SyntaxNode, depth: number): void => {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (LIST_NODE_NAMES.has(child.name)) {
        parseList(child, depth);
      } else {
        visitNestedLists(child, depth);
      }
    }
  };

  const parseList = (listNode: SyntaxNode, depth: number): void => {
    const ordered = listNode.name === "OrderedList";
    const items: EditorListItem[] = [];
    const itemNodes: SyntaxNode[] = [];
    for (
      let child = listNode.firstChild;
      child !== null;
      child = child.nextSibling
    ) {
      if (child.name !== LIST_ITEM_NODE_NAME) {
        continue;
      }
      itemNodes.push(child);
      const marker = findListMarker(child);
      if (marker !== null) {
        const line = state.doc.lineAt(marker.to);
        const afterMarker = state.doc.sliceString(marker.to, line.to);
        const whitespaceLength = afterMarker.match(/^[\t ]*/u)?.[0].length ?? 0;
        items.push({
          contentFrom: marker.to + whitespaceLength,
          depth,
          markerFrom: marker.from,
          parentMarkerFrom: null,
        });
      }
    }
    if (items.length > 0) {
      groups.push({
        depth,
        from: listNode.from,
        items,
        ordered,
        to: listNode.to,
      });
    }
    for (const itemNode of itemNodes) {
      visitNestedLists(itemNode, depth + 1);
    }
  };

  visitForLists(tree.topNode);
  assignParentMarkers(groups);
  return groups;
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
  private groups: EditorListGroup[];
  private hoveredMarkerFrom: number | null = null;
  private itemsByLine = new Map<number, EditorListItem>();
  private itemsByMarker = new Map<number, EditorListItem>();
  private readonly modeObserver: MutationObserver | null;
  private readonly overlay: SVGSVGElement;
  private readonly overlayClipId: string;
  private readonly pointerLeaveHandler: () => void;
  private readonly pointerMoveHandler: (event: PointerEvent) => void;
  private readonly resizeHandler: () => void;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly scrollHandler: () => void;
  private readonly sourceView: HTMLElement | null;

  public constructor(private readonly view: EditorView) {
    const ownerDocument = view.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    this.overlayClipId = `ltig-editor-clip-${overlaySequence++}`;
    this.overlay = ownerDocument.createElementNS(SVG_NAMESPACE, "svg");
    this.overlay.classList.add("ltig-editor-overlay");
    this.overlay.setAttribute("aria-hidden", "true");
    this.overlay.setAttribute("focusable", "false");
    ownerDocument.body.appendChild(this.overlay);

    this.groups = collectEditorListGroups(view.state);
    this.rebuildItemIndexes();
    this.sourceView = view.dom.closest<HTMLElement>(
      ".markdown-source-view.mod-cm6",
    );

    this.scrollHandler = () => this.scheduleRender();
    this.resizeHandler = () => this.scheduleRender();
    this.pointerLeaveHandler = () => this.setHoveredMarker(null);
    this.pointerMoveHandler = (event) => this.updateHoveredMarker(event);
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
    ownerWindow?.addEventListener("scroll", this.scrollHandler, {
      capture: true,
      passive: true,
    });

    const Observer = ownerWindow?.MutationObserver;
    if (Observer === undefined) {
      this.bodyObserver = null;
      this.modeObserver = null;
    } else {
      this.bodyObserver = new Observer(() => this.scheduleRender());
      this.bodyObserver.observe(ownerDocument.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
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
    }

    this.scheduleRender();
  }

  public update(update: ViewUpdate): void {
    const syntaxChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
    if (update.docChanged || syntaxChanged) {
      this.groups = collectEditorListGroups(update.state);
      this.rebuildItemIndexes();
      if (
        this.hoveredMarkerFrom !== null &&
        !this.itemsByMarker.has(this.hoveredMarkerFrom)
      ) {
        this.hoveredMarkerFrom = null;
      }
    }
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
    this.modeObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.view.scrollDOM.removeEventListener("scroll", this.scrollHandler);
    this.view.dom.removeEventListener("pointermove", this.pointerMoveHandler);
    this.view.dom.removeEventListener("pointerleave", this.pointerLeaveHandler);
    ownerWindow?.removeEventListener("resize", this.resizeHandler);
    ownerWindow?.removeEventListener("scroll", this.scrollHandler, true);
    this.overlay.remove();
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
    const ownerWindow = ownerDocument.defaultView;
    if (sourceView === null || ownerWindow === null) {
      this.overlay.replaceChildren();
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
        : ownerDocument.body.classList.contains("ltig-thread-source-mode-enabled"));
    if (!guidesEnabled && !threadingEnabled) {
      this.overlay.replaceChildren();
      return;
    }

    const viewportWidth = ownerWindow.innerWidth;
    const viewportHeight = ownerWindow.innerHeight;
    const editorRect = this.view.dom.getBoundingClientRect();
    const clipTop = clamp(editorRect.top, 0, viewportHeight);
    const clipBottom = clamp(editorRect.bottom, 0, viewportHeight);
    const clipLeft = clamp(editorRect.left, 0, viewportWidth);
    const clipRight = clamp(editorRect.right, 0, viewportWidth);
    if (clipRight <= clipLeft || clipBottom <= clipTop) {
      this.overlay.replaceChildren();
      return;
    }

    this.overlay.setAttribute("viewBox", `0 0 ${viewportWidth} ${viewportHeight}`);
    this.overlay.setAttribute("width", String(viewportWidth));
    this.overlay.setAttribute("height", String(viewportHeight));

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
    const hideUnorderedBullets =
      isLivePreview &&
      !ownerDocument.body.classList.contains(
        "ltig-show-unordered-list-bullets",
      );

    if (guidesEnabled) {
      this.renderGuidePaths(
        paths,
        style,
        hideUnorderedBullets,
        clipTop,
        clipBottom,
      );
    }
    if (threadingEnabled && this.hoveredMarkerFrom !== null) {
      this.renderThreadPaths(
        paths,
        style.direction,
        readThreadStyleGeometry(this.view.dom),
        clipTop,
        clipBottom,
      );
    }

    fragment.appendChild(paths);
    this.overlay.replaceChildren(fragment);
  }

  private renderGuidePaths(
    container: SVGGElement,
    style: GuideStyleGeometry,
    hideUnorderedBullets: boolean,
    clipTop: number,
    clipBottom: number,
  ): void {
    const ownerDocument = this.view.dom.ownerDocument;
    for (const group of this.groups) {
      if (!this.groupIntersectsVisibleRanges(group)) {
        continue;
      }
      const rendered = this.renderedConnectors(
        group,
        style,
        hideUnorderedBullets,
        clipTop,
        clipBottom,
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
      const firstGroupItem = group.items[0];
      const lastGroupItem = group.items.at(-1);
      const startY =
        firstGroupItem?.markerFrom === first.markerFrom
          ? clamp(first.y - style.firstBranchRise, clipTop, clipBottom)
          : clipTop;
      const endY =
        lastGroupItem?.markerFrom === last.markerFrom
          ? clamp(last.y, clipTop, clipBottom)
          : clipBottom;

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
  }

  private renderThreadPaths(
    container: SVGGElement,
    direction: "ltr" | "rtl",
    style: ThreadStyleGeometry,
    clipTop: number,
    clipBottom: number,
  ): void {
    const hovered = this.itemsByMarker.get(this.hoveredMarkerFrom ?? -1);
    if (hovered === undefined) {
      return;
    }
    const chain = this.collectAncestorChain(hovered);
    const ownerDocument = this.view.dom.ownerDocument;
    for (let index = 1; index < chain.length; index += 1) {
      const parent = chain[index - 1];
      const child = chain[index];
      if (parent === undefined || child === undefined) {
        continue;
      }
      const childRect = this.safeCoordsAtPos(child.markerFrom);
      if (childRect === null) {
        continue;
      }
      const parentRect = this.safeCoordsAtPos(parent.markerFrom);
      const childY = clamp(
        (childRect.top + childRect.bottom) / 2 + style.verticalOffset,
        clipTop,
        clipBottom,
      );
      const parentY = clamp(
        parentRect === null
          ? clipTop
          : (parentRect.top + parentRect.bottom) / 2 + style.verticalOffset,
        clipTop,
        clipBottom,
      );
      const endX =
        direction === "rtl"
          ? childRect.right + style.markerGap
          : childRect.left - style.markerGap;
      const spineX =
        direction === "rtl"
          ? endX + style.connectorLength
          : endX - style.connectorLength;
      const path = ownerDocument.createElementNS(SVG_NAMESPACE, "path");
      path.classList.add(
        "ltig-thread-path",
        `ltig-thread-depth-${Math.min(index, THREAD_COLOR_COUNT)}`,
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

  private renderedConnectors(
    group: EditorListGroup,
    style: GuideStyleGeometry,
    hideUnorderedBullets: boolean,
    clipTop: number,
    clipBottom: number,
  ): RenderedConnector[] {
    const connectors: RenderedConnector[] = [];
    for (const item of group.items) {
      if (!this.positionIsVisible(item.markerFrom)) {
        continue;
      }
      const markerRect = this.safeCoordsAtPos(item.markerFrom);
      if (markerRect === null) {
        continue;
      }
      const y =
        (markerRect.top + markerRect.bottom) / 2 + style.connectorOffset;
      const markerHeight = markerRect.bottom - markerRect.top;
      if (y < clipTop - markerHeight || y > clipBottom + markerHeight) {
        continue;
      }

      const endpointPosition =
        !group.ordered && hideUnorderedBullets
          ? item.contentFrom
          : item.markerFrom;
      const endpointRect = this.safeCoordsAtPos(endpointPosition) ?? markerRect;
      const endX =
        style.direction === "rtl"
          ? endpointRect.right + style.markerGap
          : endpointRect.left - style.markerGap;
      connectors.push({
        endX,
        markerFrom: item.markerFrom,
        startX:
          style.direction === "rtl"
            ? endX + style.connectorLength
            : endX - style.connectorLength,
        y: clamp(y, clipTop, clipBottom),
      });
    }
    return connectors;
  }

  private groupIntersectsVisibleRanges(group: EditorListGroup): boolean {
    return this.view.visibleRanges.some(
      (range) => range.to >= group.from && range.from <= group.to,
    );
  }

  private positionIsVisible(position: number): boolean {
    return this.view.visibleRanges.some(
      (range) => position >= range.from && position <= range.to,
    );
  }

  private safeCoordsAtPos(position: number): CoordinateRect | null {
    try {
      return this.view.coordsAtPos(position, 1);
    } catch {
      return null;
    }
  }

  private rebuildItemIndexes(): void {
    this.itemsByLine = new Map();
    this.itemsByMarker = new Map();
    for (const item of flattenItems(this.groups)) {
      this.itemsByMarker.set(item.markerFrom, item);
      const lineNumber = this.view.state.doc.lineAt(item.markerFrom).number;
      this.itemsByLine.set(lineNumber, item);
    }
  }

  private updateHoveredMarker(event: PointerEvent): void {
    const position = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position === null) {
      this.setHoveredMarker(null);
      return;
    }
    const lineNumber = this.view.state.doc.lineAt(position).number;
    this.setHoveredMarker(this.itemsByLine.get(lineNumber)?.markerFrom ?? null);
  }

  private setHoveredMarker(markerFrom: number | null): void {
    if (this.hoveredMarkerFrom === markerFrom) {
      return;
    }
    this.hoveredMarkerFrom = markerFrom;
    this.scheduleRender();
  }

  private collectAncestorChain(item: EditorListItem): EditorListItem[] {
    const chain: EditorListItem[] = [];
    let current: EditorListItem | undefined = item;
    while (current !== undefined) {
      chain.push(current);
      current =
        current.parentMarkerFrom === null
          ? undefined
          : this.itemsByMarker.get(current.parentMarkerFrom);
    }
    return chain.reverse();
  }
}

function findListMarker(item: SyntaxNode): SyntaxNode | null {
  for (let child = item.firstChild; child !== null; child = child.nextSibling) {
    if (LIST_MARK_NODE_NAMES.has(child.name)) {
      return child;
    }
    if (!LIST_NODE_NAMES.has(child.name)) {
      const nested = findListMarker(child);
      if (nested !== null) {
        return nested;
      }
    }
  }
  return null;
}

function assignParentMarkers(groups: readonly EditorListGroup[]): void {
  const lastAtDepth = new Map<number, EditorListItem>();
  for (const item of flattenItems(groups)) {
    for (const depth of Array.from(lastAtDepth.keys())) {
      if (depth > item.depth) {
        lastAtDepth.delete(depth);
      }
    }
    item.parentMarkerFrom =
      item.depth === 1 ? null : (lastAtDepth.get(item.depth - 1)?.markerFrom ?? null);
    lastAtDepth.set(item.depth, item);
  }
}

function flattenItems(
  groups: readonly EditorListGroup[],
): EditorListItem[] {
  return groups
    .flatMap((group) => [...group.items])
    .sort((left, right) => left.markerFrom - right.markerFrom);
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
