import type { Extension } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { buildGuidePath, clamp, median } from "./guide-geometry";

const LIST_LINE_CLASS_PREFIX = "HyperMD-list-line-";
const THREAD_COLOR_COUNT = 8;
let overlaySequence = 0;

export interface VisibleListRow {
  boundaryBefore?: ListBlockBoundary;
  depth: number;
}

export type ListBlockBoundary = "blank-line" | "content";

export interface VisibleListModelOptions {
  connectSeparateListBlocks?: boolean;
  threadBlankLineSeparatedListBlocks?: boolean;
}

export interface VisibleListItemModel {
  blockIndex: number;
  depth: number;
  groupIndex: number;
  parentIndex: number | null;
}

export interface VisibleListGroup {
  blockIndex: number;
  depth: number;
  itemIndices: number[];
  parentIndex: number | null;
}

export interface VisibleListModel {
  groups: VisibleListGroup[];
  items: VisibleListItemModel[];
}

export interface CoordinateRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface ListRowHitBox {
  bottom: number;
  top: number;
}

export interface ListRowDocumentLine {
  documentLineNumber: number;
}

export interface ListThreadTargetOptions {
  activeCursorListThreading: boolean;
  cursorDocumentLineNumber: number | null;
  hoveredIndex: number | null;
}

interface MeasuredListRow extends VisibleListRow {
  documentLineNumber: number;
  element: HTMLElement;
  headRect?: CoordinateRect;
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

interface ThreadGroupPathGeometry {
  connectors: readonly {
    endX: number;
    y: number;
  }[];
  radius: number;
  spineX: number;
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
  options: boolean | VisibleListModelOptions = {},
): VisibleListModel {
  const normalizedOptions =
    typeof options === "boolean"
      ? { connectSeparateListBlocks: options }
      : options;
  const groups: VisibleListGroup[] = [];
  const items: VisibleListItemModel[] = [];
  const currentGroupAtDepth = new Map<number, number>();
  const lastItemAtDepth = new Map<number, number>();
  let blockIndex = 0;

  for (let itemIndex = 0; itemIndex < rows.length; itemIndex += 1) {
    const row = rows[itemIndex];
    if (row === undefined) {
      continue;
    }
    const depth = Math.max(1, Math.trunc(row.depth));
    if (startsNewListBlock(row, normalizedOptions)) {
      if (itemIndex > 0) {
        blockIndex += 1;
      }
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
      currentGroup.blockIndex !== blockIndex ||
      currentGroup.parentIndex !== parentIndex
    ) {
      groupIndex = groups.length;
      groups.push({
        blockIndex,
        depth,
        itemIndices: [],
        parentIndex,
      });
      currentGroupAtDepth.set(depth, groupIndex);
    }

    groups[groupIndex]?.itemIndices.push(itemIndex);
    items.push({ blockIndex, depth, groupIndex, parentIndex });
    lastItemAtDepth.set(depth, itemIndex);
  }

  return { groups, items };
}

function startsNewListBlock(
  row: VisibleListRow,
  options: VisibleListModelOptions,
): boolean {
  if (options.connectSeparateListBlocks === true) {
    return false;
  }
  const boundary = row.boundaryBefore;
  return !(
    boundary === undefined ||
    (boundary === "blank-line" &&
      options.threadBlankLineSeparatedListBlocks === true)
  );
}

export function findListRowAtClientY(
  rows: readonly ListRowHitBox[],
  clientY: number,
): number | null {
  if (!Number.isFinite(clientY)) {
    return null;
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (
      row !== undefined &&
      clientY >= Math.min(row.top, row.bottom) &&
      clientY <= Math.max(row.top, row.bottom)
    ) {
      return index;
    }
  }
  return null;
}

export function findListRowAtDocumentLine(
  rows: readonly ListRowDocumentLine[],
  documentLineNumber: number,
): number | null {
  if (!Number.isInteger(documentLineNumber) || documentLineNumber < 1) {
    return null;
  }
  const index = rows.findIndex(
    (row) => row.documentLineNumber === documentLineNumber,
  );
  return index >= 0 ? index : null;
}

export function selectListThreadTargetIndex(
  rows: readonly ListRowDocumentLine[],
  options: ListThreadTargetOptions,
): number | null {
  if (options.activeCursorListThreading) {
    return options.cursorDocumentLineNumber === null
      ? null
      : findListRowAtDocumentLine(rows, options.cursorDocumentLineNumber);
  }
  return options.hoveredIndex !== null &&
    options.hoveredIndex >= 0 &&
    options.hoveredIndex < rows.length
    ? options.hoveredIndex
    : null;
}

export function isDefiniteListBlockBoundary(sourceLine: string): boolean {
  const remainder = stripBlockquotePrefixes(sourceLine);
  if (remainder.trim() === "") {
    return false;
  }
  return !/^[ \t]/u.test(remainder);
}

export function isBlankListBlockSeparator(sourceLine: string): boolean {
  return stripBlockquotePrefixes(sourceLine).trim() === "";
}

export function hasMarkdownListMarker(sourceLine: string): boolean {
  return getMarkdownListMarkerKind(sourceLine) !== null;
}

export type MarkdownListMarkerKind = "ordered" | "unordered";

export function getMarkdownListMarkerKind(
  sourceLine: string,
): MarkdownListMarkerKind | null {
  const match = /^[ \t]*(?:([-+*])|(\d+[.)]))(?:[ \t]+|$)/u.exec(
    stripBlockquotePrefixes(sourceLine),
  );
  if (match === null) {
    return null;
  }
  return match[2] === undefined ? "unordered" : "ordered";
}

function stripBlockquotePrefixes(sourceLine: string): string {
  let remainder = sourceLine;
  while (true) {
    const quotePrefix = /^[ \t]{0,3}>[ \t]?/u.exec(remainder);
    if (quotePrefix === null) {
      return remainder;
    }
    remainder = remainder.slice(quotePrefix[0].length);
  }
}

export function buildRoundedThreadPath({
  endX,
  endY,
  radius,
  startX,
  startY,
}: ThreadPathGeometry): string {
  if (startY === endY) {
    return `M ${startX} ${startY} H ${endX}`;
  }
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

export function buildRoundedThreadGroupPath({
  connectors,
  radius,
  spineX,
  startY,
}: ThreadGroupPathGeometry): string {
  const lastConnector = connectors.at(-1);
  if (lastConnector === undefined) {
    return "";
  }
  const commands = [
    buildRoundedThreadPath({
      endX: lastConnector.endX,
      endY: lastConnector.y,
      radius,
      startX: spineX,
      startY,
    }),
  ];
  for (const connector of connectors.slice(0, -1)) {
    commands.push(
      `M ${spineX} ${connector.y} H ${connector.endX}`,
    );
  }
  return commands.join(" ");
}

export function findAncestorContinuationEndIndex(
  rows: readonly VisibleListRow[],
  depth: number,
  connectSeparateListBlocks = false,
): number {
  if (rows.length === 0) {
    return -1;
  }
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (
      row === undefined ||
      startsNewListBlock(row, { connectSeparateListBlocks }) ||
      row.depth < depth
    ) {
      return index - 1;
    }
  }
  return rows.length - 1;
}

export function selectListMarkerRect(
  markerKind: MarkdownListMarkerKind,
  lineRect: CoordinateRect,
  elementRect: CoordinateRect | null,
  textRect: CoordinateRect | null,
): CoordinateRect | null {
  const preferredTextRect =
    markerKind === "ordered" &&
    textRect !== null &&
    rectHasVisibleInlineSize(textRect, lineRect)
      ? textRect
      : null;
  for (const candidate of [preferredTextRect, elementRect]) {
    if (candidate !== null && rectHasUsablePosition(candidate)) {
      return normalizeMarkerHeight(candidate, lineRect);
    }
  }
  return null;
}

class EditorGuideOverlay {
  private animationFrame: number | null = null;
  private readonly bodyObserver: MutationObserver | null;
  private readonly contentObserver: MutationObserver | null;
  private hoveredLine: HTMLElement | null = null;
  private lastMeasuredRows: readonly MeasuredListRow[] = [];
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
    this.overlay = this.overlayHost.createSvg("svg", {
      cls: "ltig-editor-overlay",
      attr: {
        "aria-hidden": "true",
        focusable: "false",
      },
    });

    this.scrollHandler = () => {
      this.lastMeasuredRows = [];
      this.overlay.classList.add("ltig-editor-overlay-hidden");
      this.scheduleRender();
    };
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
      update.focusChanged ||
      update.geometryChanged ||
      update.selectionSet ||
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
    const guidesEnabled =
      ownerDocument.body.classList.contains("ltig-static-guides-enabled") &&
      (isLivePreview
        ? ownerDocument.body.classList.contains("ltig-live-preview-enabled")
        : ownerDocument.body.classList.contains("ltig-source-mode-enabled"));
    const activeListItemThreading = ownerDocument.body.classList.contains(
      "ltig-thread-active-item-enabled",
    );
    const allBranchesThreading = ownerDocument.body.classList.contains(
      "ltig-thread-all-branches-enabled",
    );
    const orphanThreading = ownerDocument.body.classList.contains(
      "ltig-thread-orphan-enabled",
    );
    const activeOrphanListItemThreading =
      orphanThreading &&
      ownerDocument.body.classList.contains(
        "ltig-thread-orphan-active-item-enabled",
      );
    const allBranchesOfActiveOrphanListThreading =
      orphanThreading &&
      ownerDocument.body.classList.contains(
        "ltig-thread-orphan-all-branches-enabled",
      );
    const activeCursorListThreading = ownerDocument.body.classList.contains(
      "ltig-thread-active-cursor-enabled",
    );
    const threadingEnabled =
      ownerDocument.body.classList.contains(
        "ltig-list-threading-enabled",
      ) &&
      (activeListItemThreading ||
        allBranchesThreading ||
        activeOrphanListItemThreading ||
        allBranchesOfActiveOrphanListThreading) &&
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
    this.lastMeasuredRows = rows;
    if (rows.length === 0) {
      this.clearOverlay();
      return;
    }
    const connectSeparateListBlocks = ownerDocument.body.classList.contains(
      "ltig-connect-separate-list-blocks-enabled",
    );
    const guideModel = buildVisibleListModel(rows, {
      connectSeparateListBlocks,
    });
    const activeThreadModel = buildVisibleListModel(rows, {
      threadBlankLineSeparatedListBlocks:
        activeListItemThreading &&
        ownerDocument.body.classList.contains(
          "ltig-thread-active-blank-separated-blocks-enabled",
        ),
    });
    const allBranchesThreadModel = buildVisibleListModel(rows, {
      threadBlankLineSeparatedListBlocks:
        allBranchesThreading &&
        ownerDocument.body.classList.contains(
          "ltig-thread-all-branches-blank-separated-blocks-enabled",
        ),
    });

    this.overlay.classList.remove("ltig-editor-overlay-hidden");
    this.overlay.setAttribute("viewBox", `0 0 ${overlayWidth} ${overlayHeight}`);
    this.overlay.setAttribute("width", String(overlayWidth));
    this.overlay.setAttribute("height", String(overlayHeight));

    const fragment = createFragment();
    const definitions = fragment.createSvg("defs");
    const clipPath = definitions.createSvg("clipPath", {
      attr: { id: this.overlayClipId },
    });
    clipPath.createSvg("rect", {
      attr: {
        height: String(clipBottom - clipTop),
        width: String(clipRight - clipLeft),
        x: String(clipLeft),
        y: String(clipTop),
      },
    });

    const paths = fragment.createSvg("g", {
      attr: { "clip-path": `url(#${this.overlayClipId})` },
    });
    const style = readGuideStyleGeometry(this.view.dom);
    if (guidesEnabled) {
      this.renderGuidePaths(
        paths,
        rows,
        guideModel,
        style,
        hostRect,
        clipTop,
        clipBottom,
        clipLeft,
        clipRight,
        connectSeparateListBlocks,
      );
    }
    if (threadingEnabled) {
      this.renderThreadPaths(
        paths,
        rows,
        activeThreadModel,
        allBranchesThreadModel,
        style.direction,
        readThreadStyleGeometry(this.view.dom),
        hostRect,
        clipTop,
        clipBottom,
        activeCursorListThreading,
        activeListItemThreading,
        allBranchesThreading,
        ownerDocument.body.classList.contains(
          "ltig-thread-from-list-head-enabled",
        ),
        activeOrphanListItemThreading,
        allBranchesOfActiveOrphanListThreading,
      );
    }

    this.overlay.replaceChildren(fragment);
  }

  private clearOverlay(): void {
    this.lastMeasuredRows = [];
    this.overlay.replaceChildren();
    this.overlay.classList.add("ltig-editor-overlay-hidden");
  }

  private collectVisibleRows(isLivePreview: boolean): MeasuredListRow[] {
    const rows: MeasuredListRow[] = [];
    let boundaryBefore: ListBlockBoundary | undefined;
    let candidateHeadRect: CoordinateRect | undefined;
    for (const line of Array.from(
      this.view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
    )) {
      const { documentLineNumber, text: sourceLine } =
        this.readSourceLine(line);
      if (isBlankListBlockSeparator(sourceLine)) {
        if (boundaryBefore !== "content") {
          boundaryBefore = "blank-line";
        }
        candidateHeadRect = undefined;
        continue;
      }

      const depth = readListDepth(line);
      const markerKind = getMarkdownListMarkerKind(sourceLine);
      if (depth === null || markerKind === null) {
        if (isHardListBoundary(line, sourceLine)) {
          boundaryBefore = "content";
          candidateHeadRect = toCoordinateRect(
            line.getBoundingClientRect(),
          );
        } else {
          candidateHeadRect = undefined;
        }
        continue;
      }
      const lineRect = toCoordinateRect(line.getBoundingClientRect());
      const markerRect = measureMarkerRect(
        line,
        lineRect,
        isLivePreview,
        markerKind,
      );
      if (markerRect === null) {
        if (isHardListBoundary(line, sourceLine)) {
          boundaryBefore = "content";
        }
        candidateHeadRect = undefined;
        continue;
      }
      rows.push({
        boundaryBefore,
        depth,
        documentLineNumber,
        element: line,
        headRect:
          boundaryBefore === "content" ? candidateHeadRect : undefined,
        lineRect,
        markerRect,
      });
      boundaryBefore = undefined;
      candidateHeadRect = undefined;
    }
    return rows;
  }

  private readSourceLine(line: HTMLElement): {
    documentLineNumber: number;
    text: string;
  } {
    try {
      const position = this.view.posAtDOM(line);
      const documentLine = this.view.state.doc.lineAt(position);
      return {
        documentLineNumber: documentLine.number,
        text: documentLine.text,
      };
    } catch {
      return {
        documentLineNumber: -1,
        text: line.textContent ?? "",
      };
    }
  }

  private renderGuidePaths(
    container: SVGGElement,
    rows: readonly MeasuredListRow[],
    model: VisibleListModel,
    style: GuideStyleGeometry,
    hostRect: DOMRect,
    clipTop: number,
    clipBottom: number,
    clipLeft: number,
    clipRight: number,
    connectSeparateListBlocks: boolean,
  ): void {
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
        this.hasDeeperRowsBefore(
          rows,
          first.itemIndex,
          group.depth,
          connectSeparateListBlocks,
        );
      const endsBelowViewport = last.itemIndex !== group.itemIndices.at(-1);
      const startY = startsAboveViewport
        ? clipTop
        : clamp(first.y - style.firstBranchRise, clipTop, clipBottom);
      const endY = endsBelowViewport
        ? clipBottom
        : clamp(last.y, clipTop, clipBottom);

      container.createSvg("path", {
        cls: "ltig-guide-path",
        attr: {
          d: buildGuidePath({
          connectors: rendered.map(({ endX, y }) => ({ endX, y })),
          endY,
          spineX,
          startY,
          }),
        },
      });
    }

    if (connectSeparateListBlocks) {
      this.renderMissingAncestorSpines(
        container,
        rows,
        model,
        style,
        hostRect,
        clipTop,
        clipBottom,
        clipLeft,
        clipRight,
        connectSeparateListBlocks,
      );
    }
  }

  private renderMissingAncestorSpines(
    container: SVGGElement,
    rows: readonly MeasuredListRow[],
    model: VisibleListModel,
    style: GuideStyleGeometry,
    hostRect: DOMRect,
    clipTop: number,
    clipBottom: number,
    clipLeft: number,
    clipRight: number,
    connectSeparateListBlocks: boolean,
  ): void {
    const first = rows[0];
    if (
      first === undefined ||
      first.depth <= 2 ||
      startsNewListBlock(first, { connectSeparateListBlocks })
    ) {
      return;
    }
    const indentWidth = clamp(inferIndentWidth(rows), 8, 96);
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
    const firstBlockIndex = model.items[0]?.blockIndex;
    for (let depth = 2; depth < first.depth; depth += 1) {
      if (
        model.groups.some(
          (group) =>
            group.blockIndex === firstBlockIndex && group.depth === depth,
        )
      ) {
        continue;
      }
      const depthDifference = first.depth - depth;
      const spineX =
        style.direction === "rtl"
          ? firstConnector.startX + depthDifference * indentWidth
          : firstConnector.startX - depthDifference * indentWidth;
      const isOnAncestorSide =
        style.direction === "rtl"
          ? spineX > firstConnector.startX
          : spineX < firstConnector.startX;
      if (
        !Number.isFinite(spineX) ||
        !isOnAncestorSide ||
        spineX < clipLeft ||
        spineX > clipRight
      ) {
        continue;
      }
      const continuationEndRowIndex = findAncestorContinuationEndIndex(
        rows,
        depth,
        connectSeparateListBlocks,
      );
      const continuationEndConnector = this.connectorFor(
        rows[continuationEndRowIndex],
        continuationEndRowIndex,
        style.connectorLength,
        style.markerGap,
        style.connectorOffset,
        style.direction,
        hostRect,
      );
      if (continuationEndConnector === null) {
        continue;
      }
      const continuationEnd = clamp(
        continuationEndConnector.y,
        clipTop,
        clipBottom,
      );
      if (continuationEnd <= clipTop) {
        continue;
      }
      container.createSvg("path", {
        cls: ["ltig-guide-path", "ltig-guide-path-continuation"],
        attr: { d: `M ${spineX} ${clipTop} V ${continuationEnd}` },
        prepend: true,
      });
    }
  }

  private renderThreadPaths(
    container: SVGGElement,
    rows: readonly MeasuredListRow[],
    activeModel: VisibleListModel,
    allBranchesModel: VisibleListModel,
    direction: "ltr" | "rtl",
    style: ThreadStyleGeometry,
    hostRect: DOMRect,
    clipTop: number,
    clipBottom: number,
    activeCursorListThreading: boolean,
    activeListItemThreading: boolean,
    allBranchesThreading: boolean,
    threadFromListHead: boolean,
    activeOrphanListItemThreading: boolean,
    allBranchesOfActiveOrphanListThreading: boolean,
  ): void {
    const activeIndex = this.resolveActiveIndex(
      rows,
      activeCursorListThreading,
    );
    if (activeIndex === null) {
      return;
    }
    const allBranchesBlockHasHead = this.blockHasListHead(
      rows,
      allBranchesModel,
      activeIndex,
    );
    if (
      (allBranchesBlockHasHead && allBranchesThreading) ||
      (!allBranchesBlockHasHead &&
        allBranchesOfActiveOrphanListThreading)
    ) {
      this.renderAllBranchThreadPaths(
        container,
        rows,
        allBranchesModel,
        activeIndex,
        direction,
        style,
        hostRect,
        clipTop,
        clipBottom,
        threadFromListHead,
        !allBranchesBlockHasHead,
      );
      return;
    }
    const activeBlockHasHead = this.blockHasListHead(
      rows,
      activeModel,
      activeIndex,
    );
    if (
      (activeBlockHasHead && !activeListItemThreading) ||
      (!activeBlockHasHead && !activeOrphanListItemThreading)
    ) {
      return;
    }
    const chain = collectAncestorIndices(activeModel.items, activeIndex);
    const rootIndex = chain[0];
    const root = rootIndex === undefined ? undefined : rows[rootIndex];
    const activeBlockIndex =
      rootIndex === undefined
        ? undefined
        : activeModel.items[rootIndex]?.blockIndex;
    const firstBlockItemIndex = activeModel.items.findIndex(
      (item) => item.blockIndex === activeBlockIndex,
    );
    const listHeadRect =
      firstBlockItemIndex >= 0
        ? rows[firstBlockItemIndex]?.headRect
        : undefined;
    const hasListHead = threadFromListHead && listHeadRect !== undefined;
    const hasOrphanRoot = !activeBlockHasHead;
    if (root !== undefined && (hasListHead || hasOrphanRoot)) {
      const connector = this.connectorFor(
        root,
        rootIndex ?? 0,
        style.connectorLength,
        style.markerGap,
        style.verticalOffset,
        direction,
        hostRect,
      );
      if (connector !== null) {
        const rootGroupIndex =
          rootIndex === undefined
            ? undefined
            : activeModel.items[rootIndex]?.groupIndex;
        const firstRootItemIndex =
          rootGroupIndex === undefined
            ? undefined
            : activeModel.groups[rootGroupIndex]?.itemIndices[0];
        const firstRootConnector = hasOrphanRoot
          ? this.connectorFor(
              firstRootItemIndex === undefined
                ? undefined
                : rows[firstRootItemIndex],
              firstRootItemIndex ?? 0,
              style.connectorLength,
              style.markerGap,
              style.verticalOffset,
              direction,
              hostRect,
            )
          : null;
        const path = container.createSvg("path");
        addThreadPathClasses(path, 1);
        path.setAttribute(
          "d",
          buildRoundedThreadPath({
            endX: connector.endX,
            endY: clamp(connector.y, clipTop, clipBottom),
            radius: style.cornerRadius,
            startX: connector.startX,
            startY: listHeadRect !== undefined && threadFromListHead
              ? clamp(
                  markerCenterY(listHeadRect) - hostRect.top +
                    style.verticalOffset,
                  clipTop,
                  clipBottom,
                )
              : clamp(
                  firstRootConnector?.y ?? connector.y,
                  clipTop,
                  clipBottom,
                ),
          }),
        );
      }
    }
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
      const path = container.createSvg("path");
      addThreadPathClasses(
        path,
        hasListHead || hasOrphanRoot
          ? chainIndex + 1
          : chainIndex,
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
    }
  }

  private renderAllBranchThreadPaths(
    container: SVGGElement,
    rows: readonly MeasuredListRow[],
    model: VisibleListModel,
    hoveredIndex: number,
    direction: "ltr" | "rtl",
    style: ThreadStyleGeometry,
    hostRect: DOMRect,
    clipTop: number,
    clipBottom: number,
    threadFromListHead: boolean,
    threadOrphanRoot: boolean,
  ): void {
    const activeBlockIndex = model.items[hoveredIndex]?.blockIndex;
    if (activeBlockIndex === undefined) {
      return;
    }
    const activeItemIndices = model.items
      .map((item, itemIndex) =>
        item.blockIndex === activeBlockIndex ? itemIndex : -1,
      )
      .filter((itemIndex) => itemIndex >= 0);
    const rootDepth = Math.min(
      ...activeItemIndices.map(
        (itemIndex) => model.items[itemIndex]?.depth ?? Number.POSITIVE_INFINITY,
      ),
    );
    const firstBlockItemIndex = activeItemIndices[0];
    const listHeadRect =
      threadFromListHead && firstBlockItemIndex !== undefined
        ? rows[firstBlockItemIndex]?.headRect
        : undefined;
    const hasListHead = listHeadRect !== undefined;
    const hasOrphanRoot =
      !this.blockHasListHead(rows, model, hoveredIndex) && threadOrphanRoot;

    const appendGroupPath = (
      group: VisibleListGroup,
      startY: number | undefined,
      colorDepth: number,
    ): void => {
      const connectors = group.itemIndices
        .map((itemIndex) =>
          this.connectorFor(
            rows[itemIndex],
            itemIndex,
            style.connectorLength,
            style.markerGap,
            style.verticalOffset,
            direction,
            hostRect,
          ),
        )
        .filter(
          (connector): connector is RenderedConnector =>
            connector !== null &&
            connector.y >= clipTop - 32 &&
            connector.y <= clipBottom + 32,
        );
      const spineX = median(connectors.map((connector) => connector.startX));
      const firstConnector = connectors[0];
      if (
        spineX === null ||
        connectors.length === 0 ||
        firstConnector === undefined
      ) {
        return;
      }
      const pathData = buildRoundedThreadGroupPath({
        connectors: connectors.map(({ endX, y }) => ({ endX, y })),
        radius: style.cornerRadius,
        spineX,
        startY: clamp(
          startY ?? firstConnector.y,
          clipTop,
          clipBottom,
        ),
      });
      if (pathData === "") {
        return;
      }
      const path = container.createSvg("path");
      addThreadPathClasses(path, colorDepth);
      path.setAttribute("d", pathData);
    };

    if (hasListHead || hasOrphanRoot) {
      const rootGroup = model.groups.find(
        (group) =>
          group.blockIndex === activeBlockIndex &&
          group.depth === rootDepth &&
          group.parentIndex === null,
      );
      if (rootGroup !== undefined) {
        appendGroupPath(
          rootGroup,
          hasListHead
            ? markerCenterY(listHeadRect) -
                hostRect.top +
                style.verticalOffset
            : undefined,
          1,
        );
      }
    }

    for (const group of model.groups) {
      if (
        group.blockIndex !== activeBlockIndex ||
        group.parentIndex === null
      ) {
        continue;
      }
      const parent = rows[group.parentIndex];
      if (parent === undefined) {
        continue;
      }
      const parentY = clamp(
        markerCenterY(parent.markerRect) - hostRect.top + style.verticalOffset,
        clipTop,
        clipBottom,
      );
      appendGroupPath(
        group,
        parentY,
        group.depth -
          rootDepth +
          (hasListHead || hasOrphanRoot ? 1 : 0),
      );
    }
  }

  private blockHasListHead(
    rows: readonly MeasuredListRow[],
    model: VisibleListModel,
    itemIndex: number,
  ): boolean {
    const blockIndex = model.items[itemIndex]?.blockIndex;
    if (blockIndex === undefined) {
      return false;
    }
    const firstBlockItemIndex = model.items.findIndex(
      (item) => item.blockIndex === blockIndex,
    );
    return (
      firstBlockItemIndex >= 0 &&
      rows[firstBlockItemIndex]?.headRect !== undefined
    );
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
    connectSeparateListBlocks: boolean,
  ): boolean {
    const currentRow = rows[itemIndex];
    if (
      currentRow === undefined ||
      startsNewListBlock(currentRow, { connectSeparateListBlocks })
    ) {
      return false;
    }
    for (let index = itemIndex - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (
        row === undefined ||
        startsNewListBlock(row, { connectSeparateListBlocks }) ||
        row.depth < depth
      ) {
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

  private resolveActiveIndex(
    rows: readonly MeasuredListRow[],
    activeCursorListThreading: boolean,
  ): number | null {
    if (activeCursorListThreading) {
      const cursorLineNumber = this.view.hasFocus
        ? this.view.state.doc.lineAt(this.view.state.selection.main.head)
            .number
        : null;
      return selectListThreadTargetIndex(rows, {
        activeCursorListThreading,
        cursorDocumentLineNumber: cursorLineNumber,
        hoveredIndex: null,
      });
    }
    if (this.hoveredLine !== null) {
      const directIndex = rows.findIndex(
        (row) => row.element === this.hoveredLine,
      );
      if (directIndex >= 0) {
        return directIndex;
      }
    }
    const hoveredIndex = rows.findIndex((row) => row.element.matches(":hover"));
    return selectListThreadTargetIndex(rows, {
      activeCursorListThreading,
      cursorDocumentLineNumber: null,
      hoveredIndex: hoveredIndex >= 0 ? hoveredIndex : null,
    });
  }

  private updateHoveredLine(event: PointerEvent): void {
    const index = findListRowAtClientY(
      this.lastMeasuredRows.map((row) => row.lineRect),
      event.clientY,
    );
    this.setHoveredLine(
      index === null ? null : (this.lastMeasuredRows[index]?.element ?? null),
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

function addThreadPathClasses(path: SVGPathElement, colorDepth: number): void {
  path.classList.add(
    "ltig-thread-path",
    `ltig-thread-depth-${Math.min(
      Math.max(1, colorDepth),
      THREAD_COLOR_COUNT,
    )}`,
  );
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

function isHardListBoundary(line: HTMLElement, sourceLine: string): boolean {
  if (sourceLine.trim() === "") {
    return false;
  }
  return (
    !line.classList.contains("HyperMD-list-line") ||
    isDefiniteListBlockBoundary(sourceLine)
  );
}

function measureMarkerRect(
  line: HTMLElement,
  lineRect: CoordinateRect,
  isLivePreview: boolean,
  markerKind: MarkdownListMarkerKind,
): CoordinateRect | null {
  const selectors =
    markerKind === "ordered"
      ? [".cm-formatting-list-ol", ".cm-formatting-list"]
      : isLivePreview
        ? [
            ".list-bullet",
            ".task-list-item-checkbox",
            ".cm-formatting-list-ul",
            ".cm-formatting-list",
          ]
        : [
            ".cm-formatting-list-ul",
            ".cm-formatting-list",
            ".list-bullet",
          ];
  let markerFound = false;
  for (const selector of selectors) {
    const marker = line.querySelector<HTMLElement>(selector);
    if (marker === null) {
      continue;
    }
    markerFound = true;
    const markerRect = selectListMarkerRect(
      markerKind,
      lineRect,
      toCoordinateRect(marker.getBoundingClientRect()),
      markerKind === "ordered" ? measureTextRect(marker) : null,
    );
    if (markerRect !== null) {
      return markerRect;
    }
  }

  if (!markerFound) {
    return null;
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

function measureTextRect(element: HTMLElement): CoordinateRect | null {
  if (element.textContent?.trim() === "") {
    return null;
  }
  try {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const rect = toCoordinateRect(range.getBoundingClientRect());
    return rect;
  } catch {
    return null;
  }
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

function rectHasVisibleInlineSize(
  rect: CoordinateRect,
  lineRect: CoordinateRect,
): boolean {
  const width = rect.right - rect.left;
  const lineHeight = Math.max(1, lineRect.bottom - lineRect.top);
  return (
    rectHasUsablePosition(rect) &&
    width > 0.25 &&
    width <= Math.max(128, lineHeight * 8)
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
