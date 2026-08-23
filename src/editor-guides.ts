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

interface EditorListItem {
  contentFrom: number;
  markerFrom: number;
}

interface EditorListGroup {
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

interface GuideStyleGeometry {
  connectorLength: number;
  connectorOffset: number;
  firstBranchRise: number;
  markerGap: number;
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
      parseList(node);
      return;
    }
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      visitForLists(child);
    }
  };

  const visitNestedLists = (node: SyntaxNode): void => {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (LIST_NODE_NAMES.has(child.name)) {
        parseList(child);
      } else {
        visitNestedLists(child);
      }
    }
  };

  const parseList = (listNode: SyntaxNode): void => {
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
          markerFrom: marker.from,
        });
      }
    }
    if (items.length > 0) {
      groups.push({
        from: listNode.from,
        items,
        ordered,
        to: listNode.to,
      });
    }
    for (const itemNode of itemNodes) {
      visitNestedLists(itemNode);
    }
  };

  visitForLists(tree.topNode);
  return groups;
}

class EditorGuideOverlay {
  private animationFrame: number | null = null;
  private readonly bodyObserver: MutationObserver | null;
  private groups: EditorListGroup[];
  private readonly modeObserver: MutationObserver | null;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly scrollHandler: () => void;
  private readonly sourceView: HTMLElement | null;
  private readonly svg: SVGSVGElement;

  public constructor(private readonly view: EditorView) {
    const ownerDocument = view.dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    this.svg = ownerDocument.createElementNS(SVG_NAMESPACE, "svg");
    this.svg.classList.add("ltig-editor-overlay");
    this.svg.setAttribute("aria-hidden", "true");
    this.svg.setAttribute("focusable", "false");
    view.dom.classList.add("ltig-editor-host");
    view.dom.appendChild(this.svg);
    this.groups = collectEditorListGroups(view.state);

    this.sourceView = view.dom.closest<HTMLElement>(
      ".markdown-source-view.mod-cm6",
    );
    this.scrollHandler = () => this.scheduleRender();
    view.scrollDOM.addEventListener("scroll", this.scrollHandler, {
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
    this.svg.remove();
    this.view.dom.classList.remove("ltig-editor-host");
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
    if (sourceView === null) {
      this.svg.replaceChildren();
      return;
    }

    const ownerDocument = this.view.dom.ownerDocument;
    const isLivePreview = sourceView.classList.contains("is-live-preview");
    if (
      (isLivePreview &&
        !ownerDocument.body.classList.contains("ltig-live-preview-enabled")) ||
      (!isLivePreview &&
        !ownerDocument.body.classList.contains("ltig-source-mode-enabled"))
    ) {
      this.svg.replaceChildren();
      return;
    }

    const editorRect = this.view.dom.getBoundingClientRect();
    const width = this.view.dom.clientWidth;
    const height = this.view.dom.clientHeight;
    if (width <= 0 || height <= 0) {
      this.svg.replaceChildren();
      return;
    }

    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.setAttribute("width", String(width));
    this.svg.setAttribute("height", String(height));

    const style = readGuideStyleGeometry(this.view.dom);
    const hideUnorderedBullets =
      isLivePreview &&
      !ownerDocument.body.classList.contains(
        "ltig-show-unordered-list-bullets",
      );
    const fragment = ownerDocument.createDocumentFragment();

    for (const group of this.groups) {
      if (!this.groupIntersectsVisibleRanges(group)) {
        continue;
      }
      const rendered = this.renderedConnectors(
        group,
        editorRect,
        style,
        hideUnorderedBullets,
        width,
        height,
      );
      if (rendered.length === 0) {
        continue;
      }

      const spineX = median(rendered.map((connector) => connector.startX));
      if (spineX === null) {
        continue;
      }
      const first = rendered[0];
      const last = rendered.at(-1);
      if (first === undefined || last === undefined) {
        continue;
      }
      const firstGroupItem = group.items[0];
      const lastGroupItem = group.items.at(-1);
      const startY =
        firstGroupItem?.markerFrom === first.markerFrom
          ? clamp(first.y - style.firstBranchRise, 0, height)
          : 0;
      const endY =
        lastGroupItem?.markerFrom === last.markerFrom
          ? clamp(last.y, 0, height)
          : height;

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
      fragment.appendChild(path);
    }

    this.svg.replaceChildren(fragment);
  }

  private groupIntersectsVisibleRanges(group: EditorListGroup): boolean {
    return this.view.visibleRanges.some(
      (range) => range.to >= group.from && range.from <= group.to,
    );
  }

  private renderedConnectors(
    group: EditorListGroup,
    editorRect: DOMRect,
    style: GuideStyleGeometry,
    hideUnorderedBullets: boolean,
    width: number,
    height: number,
  ): RenderedConnector[] {
    const connectors: RenderedConnector[] = [];
    for (const item of group.items) {
      if (!this.positionIsVisible(item.markerFrom)) {
        continue;
      }
      const markerRect = this.view.coordsAtPos(item.markerFrom, 1);
      if (markerRect === null) {
        continue;
      }
      const y =
        (markerRect.top + markerRect.bottom) / 2 -
        editorRect.top +
        style.connectorOffset;
      const markerHeight = markerRect.bottom - markerRect.top;
      if (y < -markerHeight || y > height + markerHeight) {
        continue;
      }

      const endpointPosition =
        !group.ordered && hideUnorderedBullets
          ? item.contentFrom
          : item.markerFrom;
      const endpointRect =
        this.view.coordsAtPos(endpointPosition, 1) ?? markerRect;
      const endX = clamp(
        endpointRect.left - editorRect.left - style.markerGap,
        0,
        width,
      );
      connectors.push({
        endX,
        markerFrom: item.markerFrom,
        startX: endX - style.connectorLength,
        y: clamp(y, 0, height),
      });
    }
    return connectors;
  }

  private positionIsVisible(position: number): boolean {
    return this.view.visibleRanges.some(
      (range) => position >= range.from && position <= range.to,
    );
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

function readPixelValue(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}
